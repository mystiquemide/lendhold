import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAddress } from "viem";
import type Database from "better-sqlite3";
import { NVDAB, NVDAB_MARKET, USD1, USDT } from "./helpers";
import { AgentError, type Baw } from "@/lib/agent/baw";
import { planUsdValue, runAgentPlan, type ChainReader, type ExecutorDeps } from "@/lib/agent/executor";
import type { Plan, Step } from "@/lib/engine/planner";
import { toJson } from "@/lib/json";
import { createRun, getRun, openDb, upsertStep } from "@/lib/store/db";

vi.mock("@/lib/config", () => ({
  getConfig: () => ({ LISTA_MOOLAH_ADDRESS: "0x8F73b65B4caAf64FBA2aF91cC5D4a2A1318E5D8C", AGENT_MAX_USD_PER_RUN: 50, BAW_BIN: "baw" }),
}));

const E18 = 10n ** 18n;
const AGENT = getAddress("0x40F93Eca205086b4ccbF722C871c2815c266550a");
const MOOLAH = getAddress("0x8F73b65B4caAf64FBA2aF91cC5D4a2A1318E5D8C");
const nvdab = getAddress(NVDAB);
const usd1 = getAddress(USD1);
const usdt = getAddress(USDT);

const contractStep = (idx: number, kind: Step["kind"], to: string, selector: string, token: string, amount: bigint): Step => ({
  id: `p:${idx}`, idx, kind, label: kind, to: getAddress(to), data: `${selector}${"00".repeat(4)}` as `0x${string}`, value: 0n, selector: selector as `0x${string}`, token: getAddress(token), amount,
});

const steps: Step[] = [
  contractStep(0, "approve", nvdab, "0x095ea7b3", nvdab, 2n * E18),
  contractStep(1, "supplyCollateral", MOOLAH, "0x238d6579", nvdab, 2n * E18),
  contractStep(2, "borrow", MOOLAH, "0x50d8cd4b", usd1, 100n * E18),
  {
    id: "p:3", idx: 3, kind: "swap", label: "Swap USD1 to USDT", token: usd1, amount: 100n * E18,
    swap: { from: usd1, to: usdt, fromSymbol: "USD1", toSymbol: "USDT", amountIn: 100n * E18, minOut: 99n * E18, fromDecimals: 18, toDecimals: 18, fromUsd: 1, toUsd: 1, quote: { quoteId: "q", vendor: "v", priceImpact: 0, expectedOut: 100n * E18, valueRatio: 1 } },
  },
];

const plan: Plan = {
  id: "p", action: "borrow", address: AGENT, token: nvdab,
  market: { id: NVDAB_MARKET as `0x${string}`, params: { loanToken: usd1, collateralToken: nvdab, oracle: MOOLAH, irm: MOOLAH, lltv: 75n * 10n ** 16n }, loanSymbol: "USD1", loanDecimals: 18 },
  display: {} as Plan["display"],
  sizing: { collateralValueLoan: 456n * E18, maxBorrowTotal: 342n * E18, maxBorrowNew: 342n * E18, safeBorrowNew: 205n * E18, buffer: 0.6, notices: [] },
  steps, notices: [], blockers: [], createdAt: 0,
};

let dir: string;
let db: Database.Database;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "lendhold-exec-"));
  db = openDb(join(dir, "t.db"));
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function makeRun(p: Plan = plan, path: "agent" | "browser" = "agent") {
  const run = createRun({ path, address: p.address, action: p.action, token: p.token, marketId: p.market?.id, planJson: toJson(p) }, db);
  for (const s of p.steps) upsertStep({ runId: run.id, idx: s.idx, kind: s.kind, status: "pending" }, db);
  return run.id;
}

/** A fake agent wallet plus chain whose state changes as transactions "land". */
function world(over: { preview?: (step: Step) => unknown; orderStatuses?: string[]; allowance?: bigint } = {}) {
  const state = { allowance: over.allowance ?? 0n, collateral: 0n, borrowShares: 0n, wallet: 2n * E18 };
  const log: string[] = [];
  const byHash = new Map<string, Step>();
  let n = 0;
  let pending: Step | null = null;
  const orders = [...(over.orderStatuses ?? ["PENDING", "FINISHED"])];
  const baw = {
    contractCallPreview: vi.fn(async (p: { to: string; inputData?: string }) => {
      const step = steps.find((s) => s.data === p.inputData && s.to === getAddress(p.to))!;
      log.push(`preview:${step.kind}`);
      pending = step;
      const custom = over.preview?.(step);
      if (custom instanceof Error) throw custom;
      return (custom as object) ?? { requestId: `req-${step.idx}`, risks: { riskDetails: [], addresses: {}, riskBehaviors: [] }, requireConfirmation: false, simulationResult: { simulationCode: "000000000" } };
    }),
    contractCallExecute: vi.fn(async () => {
      const step = pending!;
      log.push(`execute:${step.kind}`);
      const hash = `0x${(++n).toString(16).padStart(64, "0")}`;
      byHash.set(hash, step);
      if (step.kind === "approve") state.allowance = step.amount!;
      if (step.kind === "supplyCollateral") { state.collateral += step.amount!; state.wallet -= step.amount!; }
      if (step.kind === "borrow") state.borrowShares += 1n;
      return { status: "BROADCASTED", txHash: hash, orderId: `o${n}`, message: null };
    }),
    marketOrderSwap: vi.fn(async () => { log.push("swap"); return { orderId: "ord-1" }; }),
    marketOrderList: vi.fn(async () => ({ orderId: "ord-1", status: orders.length > 1 ? orders.shift()! : orders[0], txHash: `0x${"cd".repeat(32)}` })),
  };
  const chain: ChainReader = {
    allowance: async () => state.allowance,
    balance: async () => state.wallet,
    position: async () => ({ collateral: state.collateral, borrowShares: state.borrowShares }),
    waitForTx: async (hash) => {
      const step = byHash.get(hash);
      return step ? { status: "success", from: AGENT, to: step.to!, input: step.data! } : null;
    },
  };
  const deps: Partial<ExecutorDeps> = {
    baw: baw as unknown as Baw,
    chain,
    db,
    ready: async () => ({ ok: true, blockers: [], address: AGENT }),
    simulate: vi.fn(async () => ({ ok: true })),
    evaluateSwap: vi.fn(async () => ({ acceptable: true, costPct: 0.1, minOut: 99n * E18, quote: {} as never, valueRatio: 0.999 })),
    maxUsdPerRun: 200,
    sleep: async () => {},
    receiptTimeoutMs: 50,
    orderPollIntervalMs: 0,
    orderTimeoutMs: 40,
  };
  return { state, log, baw, deps, byHash };
}

const statuses = (id: string) => getRun(id, db)!.steps.map((s) => s.status);

describe("runAgentPlan", () => {
  it("runs every step in order and finishes the run", async () => {
    const w = world();
    const id = makeRun();
    expect(await runAgentPlan(id, w.deps)).toEqual({ status: "done" });
    expect(w.log).toEqual(["preview:approve", "execute:approve", "preview:supplyCollateral", "execute:supplyCollateral", "preview:borrow", "execute:borrow", "swap"]);
    expect(statuses(id)).toEqual(["confirmed", "confirmed", "confirmed", "confirmed"]);
    expect(getRun(id, db)!.status).toBe("done");
    const rec = getRun(id, db)!.steps;
    expect(rec[0].txHash).toMatch(/^0x0+1$/);
    expect(rec[3].orderId).toBe("ord-1");
    expect(rec[3].txHash).toBe(`0x${"cd".repeat(32)}`);
    expect(w.baw.marketOrderSwap).toHaveBeenCalledWith({ fromTokenQty: "100", fromToken: usd1, toToken: usdt, slippage: 0.5 });
    expect(w.baw.contractCallPreview.mock.calls[0][0]).toMatchObject({ from: AGENT, to: nvdab, value: 0n });
  });

  it("stops the run on a failed preview and relays the CLI message", async () => {
    const w = world({ preview: (s) => (s.kind === "supplyCollateral" ? new AgentError("contract-call preview", "Transaction simulation failed: Insufficient balance.", { code: 351805 }) : undefined) });
    const id = makeRun();
    const out = await runAgentPlan(id, w.deps);
    expect(out).toEqual({ status: "failed", idx: 1, reason: "Transaction simulation failed: Insufficient balance." });
    expect(statuses(id)).toEqual(["confirmed", "failed", "pending", "pending"]);
    expect(getRun(id, db)!.status).toBe("failed");
    expect(getRun(id, db)!.steps[1].error).toBe("Transaction simulation failed: Insufficient balance.");
    expect(w.log).not.toContain("execute:supplyCollateral");
  });

  it("stops on risk findings and on App-confirmation requirements without executing", async () => {
    const risky = world({ preview: (s) => (s.kind === "approve" ? { requestId: "r", risks: { riskDetails: [{ title: "High Risk Address", description: "flagged", riskType: "RISK" }] }, requireConfirmation: false } : undefined) });
    const id = makeRun();
    const out = await runAgentPlan(id, risky.deps);
    expect(out).toMatchObject({ status: "failed", idx: 0 });
    expect((out as { reason: string }).reason).toContain("High Risk Address: flagged");
    expect(risky.log).toEqual(["preview:approve"]);

    const needsApp = world({ preview: () => ({ requestId: "r", risks: { riskDetails: [] }, requireConfirmation: true }) });
    const id2 = makeRun();
    const out2 = await runAgentPlan(id2, needsApp.deps);
    expect((out2 as { reason: string }).reason).toContain("Binance App");
    expect(needsApp.log).toEqual(["preview:approve"]);

    const caution = world({ preview: (s) => (s.kind === "approve" ? { requestId: "r", risks: { riskDetails: [{ title: "Heads up", riskType: "CAUTION" }] }, requireConfirmation: false } : undefined) });
    expect(await runAgentPlan(makeRun(), caution.deps)).toEqual({ status: "done" });
  });

  it("stops on a failed swap order with the terminal status", async () => {
    const w = world({ orderStatuses: ["PENDING", "FAILED"] });
    const id = makeRun();
    const out = await runAgentPlan(id, w.deps);
    expect(out).toMatchObject({ status: "failed", idx: 3 });
    expect((out as { reason: string }).reason).toContain("FAILED");
    expect(statuses(id)).toEqual(["confirmed", "confirmed", "confirmed", "failed"]);
    expect(getRun(id, db)!.steps[3].orderId).toBe("ord-1");
  });

  it("fails a swap that stays pending past the timeout, keeping the order id for a later resume", async () => {
    const w = world({ orderStatuses: ["PENDING"] });
    w.deps.sleep = () => new Promise((r) => setTimeout(r, 5));
    const id = makeRun();
    const out = await runAgentPlan(id, w.deps);
    expect((out as { reason: string }).reason).toContain("still pending");
    expect(getRun(id, db)!.steps[3]).toMatchObject({ status: "failed", orderId: "ord-1" });
  });

  it("refuses a swap whose fresh quote is no longer acceptable, without swapping", async () => {
    const w = world();
    w.deps.evaluateSwap = vi.fn(async () => ({ acceptable: false, costPct: 12.5, minOut: 0n, quote: {} as never, valueRatio: 0.875 }));
    const out = await runAgentPlan(makeRun(), w.deps);
    expect((out as { reason: string }).reason).toContain("12.50%");
    expect(w.baw.marketOrderSwap).not.toHaveBeenCalled();
  });

  it("stops on a failed simulation before asking the wallet", async () => {
    const w = world();
    w.deps.simulate = vi.fn(async () => ({ ok: false, reason: "execution reverted" }));
    const out = await runAgentPlan(makeRun(), w.deps);
    expect(out).toEqual({ status: "failed", idx: 0, reason: "Simulation failed: execution reverted" });
    expect(w.baw.contractCallPreview).not.toHaveBeenCalled();
  });

  it("fails when the transaction is not the planned call", async () => {
    const w = world();
    const original = w.deps.chain!.waitForTx;
    w.deps.chain!.waitForTx = async (h, t) => {
      const o = await original(h, t);
      return o ? { ...o, to: "0x2222222222222222222222222222222222222222" } : o;
    };
    const out = await runAgentPlan(makeRun(), w.deps);
    expect((out as { reason: string }).reason).toContain("different contract");
  });

  it("fails when the receipt never arrives", async () => {
    const w = world();
    w.deps.chain!.waitForTx = async () => null;
    const out = await runAgentPlan(makeRun(), w.deps);
    expect((out as { reason: string }).reason).toContain("was not mined");
  });
});

describe("retry and resume", () => {
  it("skips confirmed steps and never resends them", async () => {
    const w = world({ allowance: 2n * E18 });
    w.state.collateral = 2n * E18;
    w.state.wallet = 0n;
    const id = makeRun();
    upsertStep({ runId: id, idx: 0, kind: "approve", status: "confirmed", txHash: `0x${"11".repeat(32)}` }, db);
    upsertStep({ runId: id, idx: 1, kind: "supplyCollateral", status: "confirmed", txHash: `0x${"22".repeat(32)}` }, db);
    upsertStep({ runId: id, idx: 2, kind: "borrow", status: "failed", error: "earlier failure" }, db);
    expect(await runAgentPlan(id, w.deps)).toEqual({ status: "done" });
    expect(w.log).toEqual(["preview:borrow", "execute:borrow", "swap"]);
  });

  it("skips an approve whose allowance is already enough", async () => {
    const w = world({ allowance: 5n * E18 });
    const id = makeRun();
    expect(await runAgentPlan(id, w.deps)).toEqual({ status: "done" });
    expect(w.log).not.toContain("execute:approve");
    expect(getRun(id, db)!.steps[0]).toMatchObject({ status: "skipped", error: "Already approved" });
  });

  it("resumes a step that was sent by checking its receipt instead of resending", async () => {
    const w = world({ allowance: 2n * E18 });
    const id = makeRun();
    const hash = `0x${"ab".repeat(32)}`;
    w.byHash.set(hash, steps[1]);
    w.state.collateral = 2n * E18;
    upsertStep({ runId: id, idx: 1, kind: "supplyCollateral", status: "sent", txHash: hash }, db);
    expect(await runAgentPlan(id, w.deps)).toEqual({ status: "done" });
    expect(w.log).not.toContain("execute:supplyCollateral");
    expect(w.log).not.toContain("preview:supplyCollateral");
    expect(statuses(id)[1]).toBe("confirmed");
  });

  it("detects a borrow that already landed from the recorded baseline and does not borrow twice", async () => {
    const w = world({ allowance: 2n * E18 });
    w.state.collateral = 2n * E18;
    w.state.wallet = 0n;
    w.state.borrowShares = 7n;
    const id = makeRun();
    upsertStep({ runId: id, idx: 0, kind: "approve", status: "confirmed" }, db);
    upsertStep({ runId: id, idx: 1, kind: "supplyCollateral", status: "confirmed" }, db);
    // the earlier attempt recorded a baseline of 6 borrow shares, then the wallet answered but the write was lost
    upsertStep({ runId: id, idx: 2, kind: "borrow", status: "pending", simJson: toJson({ baseline: { collateral: 2n * E18, borrowShares: 6n } }) }, db);
    expect(await runAgentPlan(id, w.deps)).toEqual({ status: "done" });
    expect(w.log).toEqual(["swap"]);
    expect(getRun(id, db)!.steps[2]).toMatchObject({ status: "skipped", error: "Loan already opened" });
  });

  it("resumes a swap that was submitted by polling the same order", async () => {
    const w = world({ allowance: 2n * E18 });
    w.state.collateral = 2n * E18;
    const id = makeRun();
    for (const i of [0, 1, 2]) upsertStep({ runId: id, idx: i, kind: steps[i].kind, status: "confirmed" }, db);
    upsertStep({ runId: id, idx: 3, kind: "swap", status: "sent", orderId: "ord-1" }, db);
    expect(await runAgentPlan(id, w.deps)).toEqual({ status: "done" });
    expect(w.baw.marketOrderSwap).not.toHaveBeenCalled();
  });

  it("refuses to double-run the same run at once", async () => {
    const w = world();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    w.deps.ready = async () => { await gate; return { ok: true, blockers: [], address: AGENT }; };
    const id = makeRun();
    const first = runAgentPlan(id, w.deps);
    expect(await runAgentPlan(id, w.deps)).toEqual({ status: "busy" });
    release();
    expect((await first).status).toBe("done");
  });
});

describe("limits and readiness", () => {
  it("enforces the per-run USD cap before touching the wallet", async () => {
    const w = world();
    w.deps.maxUsdPerRun = 10;
    const out = await runAgentPlan(makeRun(), w.deps);
    expect((out as { reason: string }).reason).toContain("per-run limit of $10");
    expect(w.baw.contractCallPreview).not.toHaveBeenCalled();
  });

  it("stops with the readiness blockers", async () => {
    const w = world();
    w.deps.ready = async () => ({ ok: false, blockers: [{ code: "DEV_MODE_OFF", message: "Developer Mode is off or expired." }] });
    const id = makeRun();
    const out = await runAgentPlan(id, w.deps);
    expect(out).toMatchObject({ status: "failed", reason: "Developer Mode is off or expired." });
    expect(getRun(id, db)!.status).toBe("failed");
  });

  it("refuses a plan for a wallet other than the agent's", async () => {
    const w = world();
    w.deps.ready = async () => ({ ok: true, blockers: [], address: getAddress("0x1111111111111111111111111111111111111111") });
    const out = await runAgentPlan(makeRun(), w.deps);
    expect((out as { reason: string }).reason).toContain("different wallet");
  });

  it("rejects non-agent runs and blocked plans", async () => {
    const w = world();
    await expect(runAgentPlan(makeRun(plan, "browser"), w.deps)).rejects.toThrow(/not an agent run/);
    const blocked = { ...plan, blockers: [{ code: "X", message: "x" }] };
    expect((await runAgentPlan(makeRun(blocked), w.deps)).status).toBe("failed");
  });

  it("computes the plan USD value from the largest moving step", () => {
    // the deposit counts toward wallet quotas at the position's collateral value, but not toward the per-run cap
    expect(planUsdValue(plan)).toEqual({ spendUsd: 100, quotaUsd: 456 });
    expect(planUsdValue({ ...plan, steps: [steps[2], steps[3]] })).toEqual({ spendUsd: 100, quotaUsd: 100 });
    expect(planUsdValue({ ...plan, steps: [steps[0]] })).toEqual({ spendUsd: 0, quotaUsd: 0 });
  });
});
