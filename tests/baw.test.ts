import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { AgentError, createBaw, ensureAgentReady, type Baw, type RunResult, type Runner } from "@/lib/agent/baw";

const fixture = (name: string) => readFileSync(`tests/fixtures/baw/${name}.json`, "utf8");
const AGENT = "0x40F93Eca205086b4ccbF722C871c2815c266550a";

function fake(stdout: string, extra: Partial<RunResult> = {}) {
  const run = vi.fn<Runner>(async () => ({ stdout, stderr: "", exitCode: 0, timedOut: false, ...extra }));
  return { run, baw: createBaw({ bin: "baw-test", run }) };
}

describe("baw wrapper, real recorded outputs", () => {
  it("wallet status", async () => {
    const { baw, run } = fake(fixture("wallet-status"));
    expect(await baw.walletStatus()).toBe("CONNECTED");
    expect(run).toHaveBeenCalledWith("baw-test", ["wallet", "status", "--json"], 30_000);
  });

  it("wallet address returns the checksummed BSC address", async () => {
    const { baw } = fake(fixture("wallet-address"));
    expect(await baw.walletAddress("56")).toBe(AGENT);
    await expect(baw.walletAddress("999")).rejects.toMatchObject({ command: "wallet address", details: { name: "NO_ADDRESS" } });
  });

  it("wallet settings", async () => {
    const { baw } = fake(fixture("wallet-settings"));
    const s = await baw.walletSettings();
    expect(s).toMatchObject({ quotaLeft: 50000, tradeAllTokens: false, abnormalTxnHandling: "AutoReject" });
    expect(s.devMode).toMatchObject({ enabled: true, dailyLimit: 1000 });
  });

  it("wallet balance passes chain and filters and accepts an empty wallet", async () => {
    const { baw, run } = fake(fixture("wallet-balance"));
    expect(await baw.walletBalance({ symbol: "USDT" })).toEqual([]);
    expect(run.mock.calls[0][1]).toEqual(["wallet", "balance", "--symbol", "USDT", "--binanceChainId", "56", "--json"]);
  });

  it("market-order quote builds exact argv", async () => {
    const { baw, run } = fake(fixture("quote"));
    const q = await baw.marketOrderQuote({
      fromTokenQty: "1",
      fromToken: "0x55d398326f99059fF775485246999027B3197955",
      toToken: "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d",
      slippage: 0.5,
    });
    expect(q).toMatchObject({ fromCoinSymbol: "USDT", toCoinSymbol: "USD1", slippage: 0.005 });
    expect(run.mock.calls[0][1]).toEqual([
      "market-order", "quote",
      "--fromTokenQty", "1",
      "--fromToken", "0x55d398326f99059fF775485246999027B3197955",
      "--toToken", "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d",
      "--binanceChainId", "56",
      "--slippage", "0.5",
      "--json",
    ]);
  });

  it("contract-call preview keeps the requestId, parsed tx and risks", async () => {
    const { baw, run } = fake(fixture("preview-approve"));
    const p = await baw.contractCallPreview({ from: AGENT, to: "0x55d398326f99059fF775485246999027B3197955", inputData: "0x095ea7b3" });
    expect(p.requestId).toBe("9f35bfd0a1be43598430adbce8ba5498");
    expect(p.parsedTx?.transactionType).toBe("Approve");
    expect(p.risks?.riskDetails).toEqual([]);
    expect(p.requireConfirmation).toBe(false);
    expect(run.mock.calls[0][1]).toEqual([
      "contract-call", "preview", "--binanceChainId", "56", "--from", AGENT,
      "--to", "0x55d398326f99059fF775485246999027B3197955", "--value", "0", "--inputData", "0x095ea7b3", "--json",
    ]);
    expect(run.mock.calls[0][2]).toBe(90_000);
  });

  it("execute, swap and order list shapes", async () => {
    expect(await fake(fixture("execute-broadcasted")).baw.contractCallExecute("r")).toMatchObject({ status: "BROADCASTED" });
    expect(await fake(fixture("execute-pending-confirmation")).baw.contractCallExecute("r")).toMatchObject({
      status: "PENDING_CONFIRMATION",
      txHash: null,
    });
    expect(await fake(fixture("swap-submitted")).baw.marketOrderSwap({ fromTokenQty: "1", fromToken: "a", toToken: "b", slippage: 0.5 })).toEqual({
      orderId: "1234567890",
    });
    const order = await fake(fixture("order-list-finished")).baw.marketOrderList("1234567890");
    expect(order).toMatchObject({ status: "FINISHED" });
    expect(await fake(fixture("order-list-finished")).baw.marketOrderList("other")).toBeNull();
  });
});

describe("baw wrapper, failures", () => {
  it("relays the CLI error verbatim with the command name", async () => {
    const { baw } = fake(fixture("error-quote"), { exitCode: 1 });
    const err = await baw.marketOrderQuote({ fromTokenQty: "1", fromToken: "a", toToken: "b", slippage: 0.5 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AgentError);
    expect(err).toMatchObject({
      command: "market-order quote",
      message: "This token pair is not available for trading at this time. Please choose a different pair and retry.",
      details: { code: 6, name: "SERVICE_ERROR" },
    });
  });

  it("carries the intercepted-preview error data", async () => {
    const { baw } = fake(fixture("preview-blocked"), { exitCode: 1 });
    await expect(baw.contractCallPreview({ from: AGENT, to: AGENT })).rejects.toMatchObject({
      message: "High risk transaction",
      details: { code: 351803, name: "AGENT_DEV_MODE_RISK_BLOCKED", data: { blockLevel: "Block" } },
    });
  });

  it("reports timeouts, non-JSON output and unexpected shapes", async () => {
    await expect(fake("", { timedOut: true, exitCode: null }).baw.walletStatus()).rejects.toMatchObject({ details: { name: "TIMEOUT" } });
    await expect(fake("segfault", { exitCode: 139, stderr: "boom" }).baw.walletStatus()).rejects.toMatchObject({ message: "boom", details: { name: "NO_JSON" } });
    await expect(fake('{"success":true,"data":{"nope":1}}').baw.walletStatus()).rejects.toMatchObject({ details: { name: "BAD_SHAPE" } });
    await expect(fake('{"success":true,"data":{"status":"CONNECTED"}}', { exitCode: 2 }).baw.walletStatus()).rejects.toMatchObject({ details: { name: "BAD_ENVELOPE" } });
  });

  it("ignores log noise before the JSON body", async () => {
    expect(await fake('update available\n{"success":true,"data":{"status":"CONNECTED"}}').baw.walletStatus()).toBe("CONNECTED");
  });
});

describe("ensureAgentReady", () => {
  const settings = JSON.parse(fixture("wallet-settings")).data;
  const make = (over: Partial<Record<string, unknown>> = {}, status = "CONNECTED"): Baw => {
    const s = { ...settings, ...over };
    return {
      walletStatus: async () => status,
      walletSettings: async () => s,
      walletAddress: async () => AGENT,
    } as unknown as Baw;
  };
  const now = Date.parse("2026-09-29T23:30:00Z");

  it("is ready with the recorded settings", async () => {
    const r = await ensureAgentReady(50, make(), now);
    expect(r).toMatchObject({ ok: true, blockers: [], address: AGENT });
  });

  it("flags a missing session", async () => {
    expect((await ensureAgentReady(1, make({}, "UNCONNECTED"), now)).blockers.map((b) => b.code)).toEqual(["SESSION_MISSING"]);
    const broken = { walletStatus: async () => { throw new AgentError("wallet status", "Not signed in"); } } as unknown as Baw;
    expect(await ensureAgentReady(1, broken, now)).toMatchObject({ ok: false, blockers: [{ code: "SESSION_MISSING", message: "Not signed in" }] });
  });

  it("flags Developer Mode off, expired, or over its balance limit", async () => {
    expect((await ensureAgentReady(1, make({ devMode: { ...settings.devMode, enabled: false } }), now)).blockers[0].code).toBe("DEV_MODE_OFF");
    expect((await ensureAgentReady(1, make({ devMode: { ...settings.devMode, expiresAt: "2026-09-01T00:00:00+00:00" } }), now)).blockers[0].code).toBe("DEV_MODE_OFF");
    expect((await ensureAgentReady(1, make({ devMode: { ...settings.devMode, balanceExceeded: true } }), now)).blockers.map((b) => b.code)).toEqual(["DEV_MODE_BALANCE_EXCEEDED"]);
  });

  it("flags exhausted swap or Developer Mode quota", async () => {
    expect((await ensureAgentReady(10, make({ quotaLeft: 5 }), now)).blockers.map((b) => b.code)).toEqual(["QUOTA_EXHAUSTED"]);
    expect((await ensureAgentReady(500, make({ developerModeQuotaUsed: 700 }), now)).blockers.map((b) => b.code)).toEqual(["QUOTA_EXHAUSTED"]);
    expect((await ensureAgentReady(1000, make(), now)).ok).toBe(true);
    expect((await ensureAgentReady(1001, make(), now)).ok).toBe(false);
  });
});
