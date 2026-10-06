import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAddress } from "viem";
import type { Plan, Step } from "@/lib/engine/planner";

const dir = mkdtempSync(join(tmpdir(), "lendhold-routes-"));
vi.stubEnv("DATABASE_URL", "");
vi.stubEnv("DATABASE_PATH", join(dir, "routes.db"));

const OWNER = getAddress("0xAbf039f2DC31084F5E0713708C96068126a043e9");
const TOKEN = getAddress("0x5b1910eAaD6450E50f816082Aa078C41F10C292f");
const MOOLAH = getAddress("0x8F73b65B4caAf64FBA2aF91cC5D4a2A1318E5D8C");
const APPROVE = "0x095ea7b3";
const hash = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;

interface FakeTx {
  status: "success" | "reverted";
  from: string;
  to: string;
  input: string;
  /** Seconds. */
  timestamp: number;
}
const txs = new Map<string, FakeTx>();

vi.mock("@/lib/chain", () => ({
  getChain: () => ({
    getTransactionReceipt: async ({ hash: h }: { hash: string }) => {
      const t = txs.get(h);
      if (!t) throw new Error("not found");
      return { status: t.status, from: t.from, to: t.to, blockNumber: BigInt(t.timestamp) };
    },
    getTransaction: async ({ hash: h }: { hash: string }) => ({ input: txs.get(h)!.input }),
    getBlock: async ({ blockNumber }: { blockNumber: bigint }) => ({ timestamp: blockNumber }),
  }),
}));

const { POST: postStep } = await import("@/app/api/runs/[id]/steps/route");
const { createRunFromPlan } = await import("@/lib/run-factory");

let ip = 0;
const req = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `10.0.0.${++ip % 250}`, ...headers },
    body: JSON.stringify(body),
  });

const step: Step = {
  id: "p:0", idx: 0, kind: "approve", label: "Allow TSLAB", to: TOKEN,
  data: `${APPROVE}${"00".repeat(64)}` as `0x${string}`, value: 0n, selector: APPROVE as `0x${string}`, token: TOKEN, amount: 1n,
};
const plan = { id: "plan-1", action: "deposit", address: OWNER, token: TOKEN, market: null, steps: [step], blockers: [] } as unknown as Plan;

async function newRun() {
  return createRunFromPlan(plan, "browser");
}
const send = (runId: string, txHash: string) =>
  postStep(req(`http://x/api/runs/${runId}/steps`, { idx: 0, txHash }), { params: Promise.resolve({ id: runId }) });

const now = () => Math.floor(Date.now() / 1000);
const good = (over: Partial<FakeTx> = {}): FakeTx => ({
  status: "success", from: OWNER, to: TOKEN, input: `${APPROVE}${"00".repeat(64)}`, timestamp: now(), ...over,
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe("POST /api/runs/:id/steps", () => {
  beforeEach(() => txs.clear());

  it("confirms a matching transaction and finishes the run", async () => {
    const run = await newRun();
    txs.set(hash(1), good());
    const res = await send(run.id, hash(1));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.run.status).toBe("done");
    expect(body.run.steps[0]).toMatchObject({ status: "confirmed", txHash: hash(1) });
  });

  it("is idempotent for the same hash on the same step", async () => {
    const run = await newRun();
    txs.set(hash(2), good());
    await send(run.id, hash(2));
    expect((await send(run.id, hash(2))).status).toBe(200);
  });

  it("refuses a hash that already proved another run's step", async () => {
    const first = await newRun();
    txs.set(hash(3), good());
    await send(first.id, hash(3));
    const second = await newRun();
    const res = await send(second.id, hash(3));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("TX_ALREADY_USED");
  });

  it("refuses a transaction mined before the run started", async () => {
    const run = await newRun();
    txs.set(hash(4), good({ timestamp: now() - 24 * 3600 }));
    const res = await send(run.id, hash(4));
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("TX_BEFORE_RUN");
  });

  it("fails the step for a different sender, target or function", async () => {
    for (const [n, over, code] of [
      [5, { from: MOOLAH }, "TX_WRONG_SENDER"],
      [6, { to: MOOLAH }, "TX_WRONG_TARGET"],
      [7, { input: "0xdeadbeef" }, "TX_WRONG_CALL"],
      [8, { status: "reverted" }, "TX_REVERTED"],
    ] as const) {
      const run = await newRun();
      txs.set(hash(n), good(over as Partial<FakeTx>));
      const res = await send(run.id, hash(n));
      expect(res.status).toBe(422);
      expect((await res.json()).error.code).toBe(code);
    }
  });

  it("records an unmined hash as sent and answers 202", async () => {
    const run = await newRun();
    const res = await send(run.id, hash(9));
    expect(res.status).toBe(202);
    expect((await res.json()).run.steps[0]).toMatchObject({ status: "sent", txHash: hash(9) });
  });

  it("404 for an unknown run, 400 for a malformed hash", async () => {
    expect((await send("nope", hash(10))).status).toBe(404);
    const run = await newRun();
    expect((await send(run.id, "0x1234")).status).toBe(400);
  });
});

describe("secret-protected routes", () => {
  beforeAll(() => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "webhook-secret");
    vi.stubEnv("ALERTS_CRON_SECRET", "cron-secret");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
  });

  it("secretMatches: exact match only, never when unset", async () => {
    const { secretMatches } = await import("@/lib/alerts/secret");
    expect(secretMatches("cron-secret", "ALERTS_CRON_SECRET")).toBe(true);
    expect(secretMatches("cron-secreT", "ALERTS_CRON_SECRET")).toBe(false);
    expect(secretMatches("cron", "ALERTS_CRON_SECRET")).toBe(false);
    expect(secretMatches(null, "ALERTS_CRON_SECRET")).toBe(false);
    expect(secretMatches("", "UNSET_SECRET_NAME")).toBe(false);
    expect(secretMatches("anything", "UNSET_SECRET_NAME")).toBe(false);
  });

  it("telegram webhook rejects a missing or wrong secret", async () => {
    const { POST } = await import("@/app/api/telegram/route");
    const update = { message: { chat: { id: 1, type: "private" }, text: "/status" } };
    expect((await POST(req("http://x/api/telegram", update))).status).toBe(401);
    expect((await POST(req("http://x/api/telegram", update, { "x-telegram-bot-api-secret-token": "wrong" }))).status).toBe(401);
  });

  it("telegram webhook answers 200 and ignores group chats", async () => {
    const { POST } = await import("@/app/api/telegram/route");
    const update = { message: { chat: { id: -5, type: "group" }, text: "/status" } };
    const res = await POST(req("http://x/api/telegram", update, { "x-telegram-bot-api-secret-token": "webhook-secret" }));
    expect(res.status).toBe(200);
  });

  it("alert check rejects a missing or wrong bearer token", async () => {
    const { POST } = await import("@/app/api/alerts/check/route");
    expect((await POST(req("http://x/api/alerts/check", {}), undefined)).status).toBe(401);
    expect((await POST(req("http://x/api/alerts/check", {}, { authorization: "Bearer nope" }), undefined)).status).toBe(401);
    // Right token, but no bot configured.
    expect((await POST(req("http://x/api/alerts/check", {}, { authorization: "Bearer cron-secret" }), undefined)).status).toBe(503);
  });
});

describe("plan store expiry", () => {
  it("loads a fresh plan and refuses it after the TTL", async () => {
    const { persistPlan, loadPlan, PLAN_TTL_MS } = await import("@/lib/plan-store");
    const p = { ...plan, id: "00000000-0000-4000-8000-000000000001", createdAt: Date.now() } as Plan;
    await persistPlan(p);
    expect((await loadPlan(p.id)).id).toBe(p.id);
    vi.useFakeTimers({ now: Date.now() + PLAN_TTL_MS + 1000 });
    try {
      await expect(loadPlan(p.id)).rejects.toMatchObject({ code: "PLAN_EXPIRED" });
      expect((await loadPlan(p.id, { allowExpired: true })).id).toBe(p.id);
    } finally {
      vi.useRealTimers();
    }
    await expect(loadPlan("00000000-0000-4000-8000-000000000002")).rejects.toMatchObject({ code: "PLAN_NOT_FOUND" });
  });
});
