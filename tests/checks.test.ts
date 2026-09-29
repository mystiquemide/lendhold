import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAddress } from "viem";
import { NVDAB, NVDAB_MARKET, USD1, USER } from "./helpers";

const m = vi.hoisted(() => ({
  simulate: vi.fn(),
  getGasPrice: vi.fn(),
  buildSwap: vi.fn(),
  evaluateSwap: vi.fn(),
  erc20Allowance: vi.fn(),
  erc20Balance: vi.fn(),
  erc20Decimals: vi.fn(),
  getMarketState: vi.fn(),
  getPosition: vi.fn(),
  peekPrice: vi.fn(),
  getBalance: vi.fn(),
}));
vi.mock("@/lib/chain", () => ({ getChain: () => ({ getBalance: (...a: unknown[]) => m.getBalance(...a) }) }));
vi.mock("@/lib/binance/transaction", () => ({ simulate: (...a: unknown[]) => m.simulate(...a), getGasPrice: () => m.getGasPrice() }));
vi.mock("@/lib/binance/trading", () => ({ buildSwap: (...a: unknown[]) => m.buildSwap(...a) }));
vi.mock("@/lib/engine/swap-eval", () => ({
  evaluateSwap: (...a: unknown[]) => m.evaluateSwap(...a),
  SLIPPAGE_PERCENT: 0.5,
}));
vi.mock("@/lib/lista/chain", () => ({
  moolahAddress: () => "0x8F73b65B4caAf64FBA2aF91cC5D4a2A1318E5D8C",
  erc20Allowance: (...a: unknown[]) => m.erc20Allowance(...a),
  erc20Balance: (...a: unknown[]) => m.erc20Balance(...a),
  erc20Decimals: (...a: unknown[]) => m.erc20Decimals(...a),
  getMarketState: (...a: unknown[]) => m.getMarketState(...a),
  getPosition: (...a: unknown[]) => m.getPosition(...a),
  peekPrice: (...a: unknown[]) => m.peekPrice(...a),
}));

import { prepareForReview, simulateStep } from "@/lib/engine/checks";
import type { Plan, Step } from "@/lib/engine/planner";

const E18 = 10n ** 18n;
const MOOLAH = getAddress("0x8F73b65B4caAf64FBA2aF91cC5D4a2A1318E5D8C");
const owner = getAddress(USER);
const nvdab = getAddress(NVDAB);
const usd1 = getAddress(USD1);

const step = (idx: number, s: Partial<Step>): Step => ({ id: `p:${idx}`, idx, kind: "approve", label: "x", ...s });

function plan(steps: Step[]): Plan {
  return {
    id: "p",
    action: "borrow",
    address: owner,
    token: nvdab,
    market: {
      id: NVDAB_MARKET as `0x${string}`,
      params: { loanToken: usd1, collateralToken: nvdab, oracle: MOOLAH, irm: MOOLAH, lltv: 75n * 10n ** 16n },
      loanSymbol: "USD1",
      loanDecimals: 18,
    },
    display: {} as Plan["display"],
    sizing: null,
    steps,
    notices: [],
    blockers: [],
    createdAt: 0,
  };
}

const approve = step(0, { kind: "approve", to: nvdab, data: "0x095ea7b3", selector: "0x095ea7b3", token: nvdab, amount: 2n * E18, value: 0n });
const supply = step(1, { kind: "supplyCollateral", to: MOOLAH, data: "0x238d6579", token: nvdab, amount: 2n * E18 });
const borrow = (amount: bigint) => step(2, { kind: "borrow", to: MOOLAH, data: "0x50d8cd4b", token: usd1, amount });

beforeEach(() => {
  vi.resetAllMocks();
  m.erc20Balance.mockImplementation(async (t: string) => (getAddress(t) === nvdab ? 2n * E18 : 0n));
  m.erc20Allowance.mockResolvedValue(0n);
  m.erc20Decimals.mockResolvedValue(18);
  m.getMarketState.mockResolvedValue({ totalSupplyAssets: 1000n * E18, totalBorrowAssets: 0n, totalSupplyShares: 0n, totalBorrowShares: 0n, lastUpdate: 0n, fee: 0n });
  m.getPosition.mockResolvedValue({ supplyShares: 0n, borrowShares: 0n, collateral: 0n });
  m.peekPrice.mockImplementation(async (_o: string, t: string) => (getAddress(t) === nvdab ? 228n * 10n ** 8n : 10n ** 8n));
  m.getBalance.mockResolvedValue(10n ** 17n);
  m.getGasPrice.mockResolvedValue(3n * 10n ** 9n);
  m.simulate.mockResolvedValue({ ok: true, raw: { status: "SUCCESS" } });
});

describe("prepareForReview", () => {
  it("simulates step 0 and checks later steps against expected deltas", async () => {
    const r = await prepareForReview(plan([approve, supply, borrow(100n * E18)]));
    expect(r.ok).toBe(true);
    expect(r.steps.map((s) => s.status)).toEqual(["simulated_ok", "checked", "checked"]);
    expect(m.simulate).toHaveBeenCalledTimes(1);
    expect(m.simulate).toHaveBeenCalledWith({ from: owner, to: nvdab, data: "0x095ea7b3", value: 0n });
  });

  it("reports a failed step-0 simulation with its reason", async () => {
    m.simulate.mockResolvedValue({ ok: false, revertReason: "execution reverted", raw: {} });
    const r = await prepareForReview(plan([approve, supply, borrow(100n * E18)]));
    expect(r.ok).toBe(false);
    expect(r.steps[0]).toMatchObject({ status: "simulated_failed", reason: "execution reverted" });
    expect(r.problems[0]).toContain("execution reverted");
  });

  it("fails a deposit that exceeds the wallet balance", async () => {
    m.erc20Balance.mockResolvedValue(1n * E18);
    const r = await prepareForReview(plan([approve, supply, borrow(10n * E18)]));
    expect(r.steps[1].status).toBe("check_failed");
    expect(r.ok).toBe(false);
  });

  it("fails a deposit with no approval in the plan and no allowance", async () => {
    const r = await prepareForReview(plan([supply, borrow(10n * E18)]));
    expect(r.steps[0]).toMatchObject({ status: "check_failed", reason: "Collateral is not approved yet" });
  });

  it("fails a borrow above liquidity and above the loan limit", async () => {
    m.getMarketState.mockResolvedValue({ totalSupplyAssets: 50n * E18, totalBorrowAssets: 0n, totalSupplyShares: 0n, totalBorrowShares: 0n, lastUpdate: 0n, fee: 0n });
    const liq = await prepareForReview(plan([approve, supply, borrow(100n * E18)]));
    expect(liq.steps[2].reason).toMatch(/available to borrow/);
    m.getMarketState.mockResolvedValue({ totalSupplyAssets: 5000n * E18, totalBorrowAssets: 0n, totalSupplyShares: 0n, totalBorrowShares: 0n, lastUpdate: 0n, fee: 0n });
    const ltv = await prepareForReview(plan([approve, supply, borrow(400n * E18)])); // max is 342
    expect(ltv.steps[2].reason).toBe("That borrow would go past the loan limit");
  });

  it("flags too little BNB for network fees", async () => {
    m.getBalance.mockResolvedValue(1n);
    const r = await prepareForReview(plan([approve, supply, borrow(10n * E18)]));
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes("BNB"))).toBe(true);
  });

  it("re-quotes swap steps and fails when the quote is no longer acceptable", async () => {
    const swap = step(0, {
      kind: "swap", token: usd1, amount: 5n * E18,
      swap: { from: usd1, to: getAddress("0x55d398326f99059fF775485246999027B3197955"), fromSymbol: "USD1", toSymbol: "USDT", amountIn: 5n * E18, minOut: 1n, fromDecimals: 18, toDecimals: 18, fromUsd: 1, toUsd: 1, quote: { quoteId: "q", vendor: "v", priceImpact: 0, expectedOut: 1n, valueRatio: 1 } },
    });
    m.erc20Balance.mockResolvedValue(5n * E18);
    m.evaluateSwap.mockResolvedValueOnce({ acceptable: true, minOut: 4n * E18, costPct: 0.1 });
    expect((await prepareForReview({ ...plan([swap]), market: null })).steps[0].status).toBe("checked");
    m.evaluateSwap.mockResolvedValueOnce({ acceptable: false, minOut: 0n, costPct: 12.5 });
    const bad = await prepareForReview({ ...plan([swap]), market: null });
    expect(bad.steps[0]).toMatchObject({ status: "check_failed" });
    expect(bad.steps[0].reason).toContain("12.50%");
    m.evaluateSwap.mockResolvedValueOnce(null);
    expect((await prepareForReview({ ...plan([swap]), market: null })).steps[0].reason).toMatch(/No route/);
  });

  it("returns not ok for a blocked plan without touching the network", async () => {
    const blocked = { ...plan([]), blockers: [{ code: "NO_MARKET", message: "No market" }] };
    const r = await prepareForReview(blocked);
    expect(r).toMatchObject({ ok: false, problems: ["No market"] });
    expect(m.erc20Balance).not.toHaveBeenCalled();
  });
});

describe("simulateStep", () => {
  it("simulates contract steps from the plan address", async () => {
    const r = await simulateStep(plan([approve]), 0);
    expect(r.ok).toBe(true);
    expect(m.simulate).toHaveBeenCalledWith({ from: owner, to: nvdab, data: "0x095ea7b3", value: 0n });
    expect(await simulateStep(plan([approve]), 4)).toEqual({ ok: false, reason: "No such step" });
  });

  it("rebuilds and simulates a swap step, and treats RFQ as ok", async () => {
    const swap = step(0, {
      kind: "swap",
      swap: { from: usd1, to: nvdab, fromSymbol: "USD1", toSymbol: "NVDAB", amountIn: 5n * E18, minOut: 1n, fromDecimals: 18, toDecimals: 18, fromUsd: 1, toUsd: 228, quote: { quoteId: "q", vendor: "v", priceImpact: 0, expectedOut: 1n, valueRatio: 1 } },
    });
    m.evaluateSwap.mockResolvedValue({ acceptable: true, quote: { quoteId: "q" }, minOut: 1n, costPct: 0 });
    m.buildSwap.mockResolvedValueOnce({ tx: { to: nvdab, data: "0xad43f73d", value: 0n } });
    expect((await simulateStep(plan([swap]), 0)).ok).toBe(true);
    expect(m.simulate).toHaveBeenLastCalledWith({ from: owner, to: nvdab, data: "0xad43f73d", value: 0n });
    m.buildSwap.mockResolvedValueOnce({ tx: null, rfq: { vendor: "PcsXRfq" } });
    expect(await simulateStep(plan([swap]), 0)).toMatchObject({ ok: true, raw: { rfq: true } });
    m.evaluateSwap.mockResolvedValue({ acceptable: false, costPct: 3, quote: {}, minOut: 0n });
    expect((await simulateStep(plan([swap]), 0)).ok).toBe(false);
  });
});
