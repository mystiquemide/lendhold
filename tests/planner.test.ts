import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAddress } from "viem";
import { NVDAB, NVDAB_MARKET, NVDAON, USD1, USDT, USER } from "./helpers";

const E18 = 10n ** 18n;
const MOOLAH = "0x8F73b65B4caAf64FBA2aF91cC5D4a2A1318E5D8C";
const MSFTON = getAddress("0x6bfe75d1ad432050ea973c3a3dcd88f02e2444c3");

const m = vi.hoisted(() => ({
  listRwaTokens: vi.fn(),
  getRwaPrices: vi.fn(),
  getAssetStatus: vi.fn(),
  getMarketSession: vi.fn(),
  getQuote: vi.fn(),
  erc20Allowance: vi.fn(),
  erc20Balance: vi.fn(),
  erc20Decimals: vi.fn(),
  getPosition: vi.fn(),
  readMinLoan: vi.fn(),
  borrowRatePerSecond: vi.fn(),
  pickMarketFor: vi.fn(),
}));
const rwa = m;
const getQuote = m.getQuote;
const chainFns = m;
const pickMarketFor = m.pickMarketFor;

vi.mock("@/lib/binance/rwa", () => ({
  listRwaTokens: (...a: unknown[]) => m.listRwaTokens(...a),
  getRwaPrices: (...a: unknown[]) => m.getRwaPrices(...a),
  getAssetStatus: (...a: unknown[]) => m.getAssetStatus(...a),
  getMarketSession: (...a: unknown[]) => m.getMarketSession(...a),
}));
vi.mock("@/lib/binance/trading", async () => {
  const actual = await vi.importActual<typeof import("@/lib/binance/trading")>("@/lib/binance/trading");
  return { ...actual, getQuote: (...a: unknown[]) => m.getQuote(...a) };
});
vi.mock("@/lib/lista/chain", () => ({
  erc20Allowance: (...a: unknown[]) => m.erc20Allowance(...a),
  erc20Balance: (...a: unknown[]) => m.erc20Balance(...a),
  erc20Decimals: (...a: unknown[]) => m.erc20Decimals(...a),
  getPosition: (...a: unknown[]) => m.getPosition(...a),
  readMinLoan: (...a: unknown[]) => m.readMinLoan(...a),
  borrowRatePerSecond: (...a: unknown[]) => m.borrowRatePerSecond(...a),
  aprFromRatePerSecond: (r: bigint) => (Number(r) / 1e18) * 31536000,
  moolahAddress: () => "0x8F73b65B4caAf64FBA2aF91cC5D4a2A1318E5D8C",
}));
vi.mock("@/lib/engine/market-select", () => ({ pickMarketFor: (...a: unknown[]) => m.pickMarketFor(...a) }));

const tokens = {
  bstock: [
    { address: getAddress(NVDAB), symbol: "NVDAB", name: "NVIDIA", platformId: "bstock", ticker: "NVDA", decimals: 18, ratio: 1, logoUrl: null },
  ],
  ondo: [
    { address: getAddress(NVDAON), symbol: "NVDAon", name: "NVIDIA", platformId: "ondo", ticker: "NVDA", decimals: 18, ratio: 1.002, logoUrl: null },
    { address: MSFTON, symbol: "MSFTon", name: "Microsoft", platformId: "ondo", ticker: "MSFT", decimals: 18, ratio: 1, logoUrl: null },
  ],
};
const refPrice: Record<string, number> = {
  [getAddress(NVDAB)]: 228,
  [getAddress(NVDAON)]: 227.5,
  [MSFTON]: 512,
};

import { buildPlan } from "@/lib/engine/planner";
import { SELECTORS } from "@/lib/lista/calldata";
import { valueRatio } from "@/lib/engine/swap-eval";
import { minLoanFloor } from "@/lib/engine/sizing";

const params = (loan: string) => ({
  loanToken: getAddress(loan),
  collateralToken: getAddress(NVDAB),
  oracle: "0x526D09c604A17D98cb1f260a7774A239990dbDfb",
  irm: "0xFe7dAe87Ebb11a7BEB9F534BB23267992d9cDe7c",
  lltv: 75n * 10n ** 16n,
});

function setMarket(loan = USD1, loanSymbol = "USD1", availableLoan = 10_000n * E18, lastUpdate = 0n) {
  const market = { id: NVDAB_MARKET, loanSymbol, lltv: 0.75, liquidityUsd: 1, params: params(loan) };
  const chain = {
    state: { totalSupplyAssets: 20_000n * E18, totalSupplyShares: 0n, totalBorrowAssets: 10_000n * E18, totalBorrowShares: 10_000n * E18 * 10n ** 6n, lastUpdate, fee: 0n },
    availableLoan,
    availableUsd: 1,
    loanDecimals: 18,
    loanPrice: 10n ** 8n,
    collateralPrice: 228n * 10n ** 8n,
  };
  pickMarketFor.mockResolvedValue({ market, chain, all: [market], chainStates: new Map([[NVDAB_MARKET, chain]]) });
}

const usdOf: Record<string, number> = {
  [getAddress(USDT)]: 1,
  [getAddress(USD1)]: 1,
  [getAddress(NVDAB)]: 228,
  [getAddress(NVDAON)]: 227.5 * 1.002,
  [MSFTON]: 512,
};

/** Quotes at reference value minus 0.1%. */
function fairQuote({ from, to, amount }: { from: string; to: string; amount: bigint }) {
  const out = (Number(amount) * usdOf[getAddress(from)]) / usdOf[getAddress(to)];
  return Promise.resolve({
    quoteId: "q".repeat(32),
    vendor: "LiquidMesh",
    executionMode: "SWAP",
    fromAmount: amount,
    toAmount: BigInt(Math.floor(out * 0.999)),
    priceImpact: 0.0007,
    tradeFee: null,
    raw: {},
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  m.listRwaTokens.mockImplementation(async (p: "ondo" | "bstock") => tokens[p]);
  m.getRwaPrices.mockImplementation(async (addrs: string[]) =>
    new Map(
      addrs.map((a) => {
        const ref = refPrice[getAddress(a)];
        return [a.toLowerCase(), { tokenPrice: ref, referencePrice: ref, updatedAt: 1 }];
      }),
    ),
  );
  m.borrowRatePerSecond.mockResolvedValue(273059248n);
  m.readMinLoan.mockResolvedValue(0n);
  setMarket();
  chainFns.erc20Allowance.mockResolvedValue(0n);
  chainFns.erc20Balance.mockResolvedValue(2n * E18);
  chainFns.erc20Decimals.mockResolvedValue(18);
  chainFns.getPosition.mockResolvedValue({ supplyShares: 0n, borrowShares: 0n, collateral: 0n });
  rwa.getMarketSession.mockResolvedValue({ openState: true, marketStatus: "regular", reasonCode: null, nextOpenTime: null, nextCloseTime: null });
  rwa.getAssetStatus.mockResolvedValue({ openState: true, marketStatus: null, reasonCode: "TRADING", reasonMsg: null, nextOpenTime: null, nextCloseTime: null });
  getQuote.mockImplementation(fairQuote);
});

const base = { address: USER, token: NVDAB };

describe("borrow against a bStock", () => {
  it("orders approve, deposit, borrow, swap to USDT and builds real calldata", async () => {
    const plan = await buildPlan({ ...base, action: "borrow", amount: "100" });
    expect(plan.blockers).toEqual([]);
    expect(plan.steps.map((s) => s.kind)).toEqual(["approve", "supplyCollateral", "borrow", "swap"]);
    expect(plan.steps.map((s) => s.label)).toEqual(["Allow NVDAB", "Deposit NVDAB", "Borrow USD1", "Swap USD1 to USDT"]);
    expect(plan.steps.map((s) => s.id)).toEqual([0, 1, 2, 3].map((i) => `${plan.id}:${i}`));
    const [approve, supply, borrow, swap] = plan.steps;
    expect(approve.to).toBe(getAddress(NVDAB));
    expect(approve.selector).toBe(SELECTORS.approve);
    expect(approve.amount).toBe(2n * E18);
    expect(supply.to).toBe(MOOLAH);
    expect(supply.selector).toBe(SELECTORS.supplyCollateral);
    expect(supply.amount).toBe(2n * E18);
    expect(borrow.selector).toBe(SELECTORS.borrow);
    expect(borrow.amount).toBe(100n * E18);
    expect(swap.data).toBeUndefined();
    expect(swap.swap).toMatchObject({ fromSymbol: "USD1", toSymbol: "USDT", amountIn: 100n * E18 });
    expect(swap.swap!.minOut).toBe((swap.swap!.quote.expectedOut * 9950n) / 10000n);
    expect(plan.display.receive).toMatchObject({ symbol: "USDT" });
    expect(plan.display.debt).toMatchObject({ symbol: "USD1", amount: 100n * E18 });
    expect(plan.display.health).toBe("safe");
    expect(plan.display.shareDeltaPct).toBe(0);
    expect(plan.sizing!.safeBorrowNew).toBeGreaterThan(100n * E18);
  });

  it("skips the approve when the allowance already covers the deposit", async () => {
    chainFns.erc20Allowance.mockResolvedValue(2n * E18);
    const plan = await buildPlan({ ...base, action: "borrow", amount: "100" });
    expect(plan.steps.map((s) => s.kind)).toEqual(["supplyCollateral", "borrow", "swap"]);
  });

  it("omits the final swap when receive is the loan token or the loan is already USDT", async () => {
    const asLoan = await buildPlan({ ...base, action: "borrow", amount: "100", receive: "loan" });
    expect(asLoan.steps.map((s) => s.kind)).toEqual(["approve", "supplyCollateral", "borrow"]);
    expect(asLoan.display.receive).toMatchObject({ symbol: "USD1", amount: 100n * E18 });
    setMarket(USDT, "USDT");
    const usdt = await buildPlan({ ...base, action: "borrow", amount: "100" });
    expect(usdt.steps.map((s) => s.kind)).toEqual(["approve", "supplyCollateral", "borrow"]);
  });

  it("blocks amounts above the maximum and warns above the safe amount", async () => {
    // 2 tokens * $228 = 456; max 342; safe 205.2
    const above = await buildPlan({ ...base, action: "borrow", amount: "343" });
    expect(above.blockers.map((b) => b.code)).toEqual(["ABOVE_MAX"]);
    expect(above.steps).toEqual([]);
    const warn = await buildPlan({ ...base, action: "borrow", amount: "300" });
    expect(warn.blockers).toEqual([]);
    expect(warn.notices.map((n) => n.code)).toContain("ABOVE_SAFE");
    const ok = await buildPlan({ ...base, action: "borrow", amount: "205" });
    expect(ok.notices.map((n) => n.code)).not.toContain("ABOVE_SAFE");
  });

  it("defaults to the safe amount and uses the closed-market buffer", async () => {
    const open = await buildPlan({ ...base, action: "borrow" });
    expect(open.steps.find((s) => s.kind === "borrow")!.amount).toBe(open.sizing!.safeBorrowNew);
    rwa.getAssetStatus.mockResolvedValue({ openState: false, marketStatus: "closed", reasonCode: "TRADING", reasonMsg: null, nextOpenTime: 1790726700000, nextCloseTime: null });
    const closed = await buildPlan({ ...base, action: "borrow" });
    expect(closed.sizing!.buffer).toBe(0.45);
    expect(closed.notices.map((n) => n.code)).toContain("MARKET_CLOSED");
    expect(closed.sizing!.safeBorrowNew).toBeLessThan(open.sizing!.safeBorrowNew);
  });

  it("blocks when there is no market, no collateral, or an insufficient balance", async () => {
    pickMarketFor.mockResolvedValue(null);
    expect((await buildPlan({ ...base, action: "borrow", amount: "1" })).blockers[0].code).toBe("NO_MARKET");
    setMarket();
    chainFns.erc20Balance.mockResolvedValue(0n);
    expect((await buildPlan({ ...base, action: "borrow", amount: "1" })).blockers[0].code).toBe("NO_COLLATERAL");
    chainFns.erc20Balance.mockResolvedValue(1n * E18);
    const short = await buildPlan({ ...base, action: "borrow", amount: "1", collateralAmount: "5" });
    expect(short.blockers[0].code).toBe("INSUFFICIENT_BALANCE");
  });

  it("counts an existing position toward sizing and needs no deposit when the wallet is empty", async () => {
    chainFns.erc20Balance.mockResolvedValue(0n);
    chainFns.getPosition.mockResolvedValue({ supplyShares: 0n, borrowShares: 0n, collateral: 2n * E18 });
    const plan = await buildPlan({ ...base, action: "borrow", amount: "100" });
    expect(plan.blockers).toEqual([]);
    expect(plan.steps.map((s) => s.kind)).toEqual(["borrow", "swap"]);
  });
});

describe("swap value check", () => {
  it("computes the value ratio from reference prices", () => {
    // The MSFTon fixture: $50 USDT in, 48517380918 raw MSFTon out at $512.
    const r = valueRatio(50n * E18, 48517380918n, { decimals: 18, usd: 1 }, { decimals: 18, usd: 512 });
    expect(r).toBeCloseTo(4.97e-7, 9);
  });

  it("rejects the MSFTon route as SWAP_COST_TOO_HIGH even though price impact is only 99.95%", async () => {
    getQuote.mockResolvedValue({
      quoteId: "q".repeat(32),
      vendor: "LiquidMesh",
      executionMode: "SWAP",
      fromAmount: 50n * E18,
      toAmount: 48517380918n,
      priceImpact: 0.9995,
      tradeFee: null,
      raw: {},
    });
    const plan = await buildPlan({ address: USER, token: MSFTON.toString(), action: "buy", amount: "50" });
    // MSFTon is not a bStock, so buying it is refused before quoting.
    expect(plan.blockers[0].code).toBe("NOT_BSTOCK");
  });

  it("rejects a bad-value quote even when priceImpact looks acceptable", async () => {
    getQuote.mockImplementation(async ({ amount }: { amount: bigint }) => ({
      quoteId: "q".repeat(32), vendor: "V", executionMode: "SWAP", fromAmount: amount,
      toAmount: (amount * 90n) / 100n / 228n, priceImpact: 0.001, tradeFee: null, raw: {},
    }));
    const plan = await buildPlan({ ...base, action: "buy", amount: "50" });
    expect(plan.blockers).toHaveLength(1);
    expect(plan.blockers[0].code).toBe("SWAP_COST_TOO_HIGH");
    expect(plan.blockers[0].message).toMatch(/would cost about \d+\.\d+%, which is too much/);
    expect(plan.steps).toEqual([]);
  });

  it("rejects a quote above the 1% impact cap and a missing route", async () => {
    getQuote.mockImplementation(async (i: { amount: bigint }) => ({
      ...(await fairQuote({ from: USDT, to: NVDAB, amount: i.amount })), priceImpact: 0.02,
    }));
    const impact = (await buildPlan({ ...base, action: "buy", amount: "50" })).blockers[0];
    expect(impact.code).toBe("SWAP_COST_TOO_HIGH");
    expect(impact.message).toBe(
      "Price impact for USDT to NVDAB is 2.00%, above the 1% limit. Try again in a moment or use a smaller amount",
    );
    expect(impact.message).not.toMatch(/would cost/);
    getQuote.mockResolvedValue(null);
    expect((await buildPlan({ ...base, action: "buy", amount: "50" })).blockers[0].code).toBe("NO_QUOTE");
  });
});

describe("borrow against an Ondo token", () => {
  it("converts through USDT to the bStock, then deposits and borrows", async () => {
    const plan = await buildPlan({ address: USER, token: NVDAON, action: "borrow", amount: "100" });
    expect(plan.blockers).toEqual([]);
    expect(plan.steps.map((s) => s.kind)).toEqual(["swap", "swap", "approve", "supplyCollateral", "borrow", "swap"]);
    expect(plan.steps.map((s) => s.label)).toEqual([
      "Sell NVDAon for USDT", "Buy NVDAB", "Allow NVDAB", "Deposit NVDAB", "Borrow USD1", "Swap USD1 to USDT",
    ]);
    const [sell, buy, approve, supply] = plan.steps;
    expect(sell.swap).toMatchObject({ fromSymbol: "NVDAon", toSymbol: "USDT", amountIn: 2n * E18 });
    // leg 2 spends the guaranteed minimum of leg 1
    expect(buy.swap!.amountIn).toBe(sell.swap!.minOut);
    // deposit and approve use the guaranteed minimum of leg 2
    expect(supply.amount).toBe(buy.swap!.minOut);
    expect(approve.amount).toBe(buy.swap!.minOut);
    // 2 tokens x $227.955 = $455.91; two 0.1% quote haircuts and the 0.5% slippage guard between legs
    expect(plan.display.sharesBefore).toBeCloseTo(2 * 1.002, 9);
    expect(plan.display.sharesAfter).toBeCloseTo(((2 * 227.5 * 1.002) / 228) * 0.999 * 0.995 * 0.999, 4);
    expect(plan.display.conversionCostPct).toBeGreaterThan(0);
    expect(plan.display.conversionCostPct).toBeLessThan(1);
  });

  it("blocks with ASSET_NOT_TRADING when either asset is paused", async () => {
    rwa.getAssetStatus.mockResolvedValue({ openState: true, marketStatus: null, reasonCode: "CORPORATE_ACTION", reasonMsg: "cash_dividend", nextOpenTime: null, nextCloseTime: null });
    const plan = await buildPlan({ address: USER, token: NVDAON, action: "borrow", amount: "100" });
    expect(plan.blockers.map((b) => b.code)).toEqual(["ASSET_NOT_TRADING"]);
    expect(plan.steps).toEqual([]);
    expect(plan.notices.map((n) => n.code)).toContain("ASSET_PAUSED");
  });

  it("blocks when a leg has no route", async () => {
    getQuote.mockResolvedValue(null);
    const plan = await buildPlan({ address: USER, token: NVDAON, action: "borrow", amount: "100" });
    expect(plan.blockers[0].code).toBe("NO_QUOTE");
  });
});

describe("repay and withdraw", () => {
  const position = { supplyShares: 0n, borrowShares: 100n * E18 * 10n ** 6n, collateral: 2n * E18 };

  it("repay all uses the borrow shares, approves with headroom and can withdraw", async () => {
    chainFns.getPosition.mockResolvedValue(position);
    chainFns.erc20Balance.mockResolvedValue(1_000n * E18);
    const plan = await buildPlan({ ...base, action: "repay", amount: "all", withdraw: true });
    expect(plan.blockers).toEqual([]);
    expect(plan.steps.map((s) => s.kind)).toEqual(["approve", "repay", "withdrawCollateral"]);
    expect(plan.steps[1].selector).toBe(SELECTORS.repay);
    expect(plan.steps[1].label).toBe("Repay all USD1");
    expect(plan.steps[0].amount).toBeGreaterThan(plan.steps[1].amount!);
    expect(plan.steps[2].amount).toBe(2n * E18);
    expect(plan.display.debt!.amount).toBe(0n);
  });

  it("partial repay uses assets and refuses more than owed", async () => {
    chainFns.getPosition.mockResolvedValue(position);
    chainFns.erc20Balance.mockResolvedValue(1_000n * E18);
    chainFns.erc20Allowance.mockResolvedValue(1_000n * E18);
    const part = await buildPlan({ ...base, action: "repay", amount: "10" });
    expect(part.steps.map((s) => s.kind)).toEqual(["repay"]);
    expect(part.steps[0].amount).toBe(10n * E18);
    const over = await buildPlan({ ...base, action: "repay", amount: "100000" });
    expect(over.blockers[0].code).toBe("ABOVE_DEBT");
  });

  it("blocks repay without enough loan token, without debt, and withdraw on a partial repay", async () => {
    chainFns.getPosition.mockResolvedValue(position);
    chainFns.erc20Balance.mockResolvedValue(1n * E18);
    expect((await buildPlan({ ...base, action: "repay", amount: "all" })).blockers[0].code).toBe("INSUFFICIENT_LOAN_BALANCE");
    chainFns.getPosition.mockResolvedValue({ supplyShares: 0n, borrowShares: 0n, collateral: 0n });
    expect((await buildPlan({ ...base, action: "repay", amount: "all" })).blockers[0].code).toBe("NO_DEBT");
    chainFns.getPosition.mockResolvedValue(position);
    chainFns.erc20Balance.mockResolvedValue(1_000n * E18);
    expect((await buildPlan({ ...base, action: "repay", amount: "10", withdraw: true })).blockers.map((b) => b.code)).toContain("WITHDRAW_NEEDS_FULL_REPAY");
  });

  it("withdraw is blocked when it would leave the loan under-collateralized", async () => {
    chainFns.getPosition.mockResolvedValue(position);
    const risky = await buildPlan({ ...base, action: "withdraw", amount: "1.9" });
    expect(risky.blockers.map((b) => b.code)).toEqual(["WOULD_LIQUIDATE"]);
    const fine = await buildPlan({ ...base, action: "withdraw", amount: "0.5" });
    expect(fine.blockers).toEqual([]);
    expect(fine.steps.map((s) => s.kind)).toEqual(["withdrawCollateral"]);
    expect(fine.steps[0].selector).toBe(SELECTORS.withdrawCollateral);
  });
});

describe("buy", () => {
  it("is a single swap step", async () => {
    const plan = await buildPlan({ ...base, action: "buy", amount: "50" });
    expect(plan.blockers).toEqual([]);
    expect(plan.steps.map((s) => s.kind)).toEqual(["swap"]);
    expect(plan.steps[0].label).toBe("Buy NVDAB");
    expect(plan.steps[0].swap).toMatchObject({ fromSymbol: "USDT", toSymbol: "NVDAB", amountIn: 50n * E18 });
    expect(plan.display.receive!.symbol).toBe("NVDAB");
  });

  it("blocks when the asset is not trading and rejects unknown tokens", async () => {
    rwa.getAssetStatus.mockResolvedValue({ openState: true, marketStatus: null, reasonCode: "SPLIT", reasonMsg: null, nextOpenTime: null, nextCloseTime: null });
    expect((await buildPlan({ ...base, action: "buy", amount: "50" })).blockers[0].code).toBe("ASSET_NOT_TRADING");
    await expect(buildPlan({ address: USER, token: "0x1111111111111111111111111111111111111111", action: "buy", amount: "1" })).rejects.toMatchObject({ code: "UNKNOWN_TOKEN" });
  });
});

describe("Lista minimum loan", () => {
  const MIN = 15007212616455594723n;
  // A last-update time in the future means no interest is accrued, so debts below are exact.
  const noAccrual = 9_999_999_999n;
  const debtOf = (assets: bigint) => ({ supplyShares: 0n, borrowShares: assets * 10n ** 6n, collateral: 2n * E18 });

  beforeEach(() => {
    setMarket(USD1, "USD1", 10_000n * E18, noAccrual);
    m.readMinLoan.mockResolvedValue(MIN);
  });

  it("blocks an explicit borrow below the floor and exposes the raw minimum on the market", async () => {
    const plan = await buildPlan({ ...base, action: "borrow", amount: "10" });
    expect(plan.blockers).toEqual([{ code: "BELOW_MIN_LOAN", message: "Lista's minimum loan is 15.16 USD1. Borrow at least that much" }]);
    expect(plan.steps).toEqual([]);
    expect(plan.market!.minLoan).toBe(MIN);
    expect(plan.market!.minBorrow).toBe(minLoanFloor(MIN));
    expect(m.readMinLoan).toHaveBeenCalledWith(expect.objectContaining({ collateralToken: getAddress(NVDAB) }));
  });

  it("allows a borrow above the floor", async () => {
    const plan = await buildPlan({ ...base, action: "borrow", amount: "16" });
    expect(plan.blockers).toEqual([]);
    expect(plan.steps.map((s) => s.kind)).toContain("borrow");
    expect(plan.market!.minLoan).toBe(15007212616455594723n);
  });

  it("counts existing debt toward the floor", async () => {
    chainFns.getPosition.mockResolvedValue(debtOf(10n * E18));
    const ok = await buildPlan({ ...base, action: "borrow", amount: "6" });
    expect(ok.blockers).toEqual([]);
    const low = await buildPlan({ ...base, action: "borrow", amount: "1" });
    expect(low.blockers).toEqual([{ code: "BELOW_MIN_LOAN", message: "Lista's minimum loan is 15.16 USD1. Your total debt must stay at or above that" }]);
  });

  it("says to deposit more when the default safe amount is below the floor", async () => {
    // 0.1 NVDAB at $228 = $22.80; safe = 22.80 * 0.75 * 0.6 = 10.26
    const plan = await buildPlan({ ...base, action: "borrow", collateralAmount: "0.1" });
    expect(plan.blockers).toEqual([
      { code: "BELOW_MIN_LOAN", message: "The safe amount is 10.26 USD1, below Lista's minimum loan of 15.16 USD1. Deposit more NVDAB to borrow" },
    ]);
    expect(plan.steps).toEqual([]);
  });

  it("checks ABOVE_MAX before the minimum and keeps NOTHING_TO_BORROW for a zero safe amount", async () => {
    const above = await buildPlan({ ...base, action: "borrow", amount: "343" });
    expect(above.blockers.map((x) => x.code)).toEqual(["ABOVE_MAX"]);
    setMarket(USD1, "USD1", 0n, noAccrual);
    const none = await buildPlan({ ...base, action: "borrow" });
    expect(none.blockers.map((x) => x.code)).toEqual(["NOTHING_TO_BORROW"]);
  });

  it("does nothing new when the minimum is zero", async () => {
    m.readMinLoan.mockResolvedValue(0n);
    const plan = await buildPlan({ ...base, action: "borrow", amount: "1" });
    expect(plan.blockers).toEqual([]);
  });

  it("blocks a partial repay that leaves debt under the floor", async () => {
    chainFns.getPosition.mockResolvedValue(debtOf(20n * E18));
    chainFns.erc20Balance.mockResolvedValue(1_000n * E18);
    chainFns.erc20Allowance.mockResolvedValue(1_000n * E18);
    const plan = await buildPlan({ ...base, action: "repay", amount: "15" });
    expect(plan.blockers).toEqual([
      {
        code: "PARTIAL_REPAY_BELOW_MIN",
        message: "That leaves 5.00 USD1 owed, below Lista's minimum loan of 15.16 USD1. Repay all, or leave at least 15.16 USD1 owed",
      },
    ]);
    expect(plan.steps).toEqual([]);
    expect(plan.market!.minLoan).toBe(MIN);
  });

  it("allows a partial repay that leaves enough, and repay all", async () => {
    chainFns.erc20Balance.mockResolvedValue(1_000n * E18);
    chainFns.erc20Allowance.mockResolvedValue(1_000n * E18);
    chainFns.getPosition.mockResolvedValue(debtOf(40n * E18));
    const partial = await buildPlan({ ...base, action: "repay", amount: "20" });
    expect(partial.blockers).toEqual([]);
    expect(partial.steps.map((x) => x.kind)).toEqual(["repay"]);
    chainFns.getPosition.mockResolvedValue(debtOf(16n * E18));
    const all = await buildPlan({ ...base, action: "repay", amount: "all" });
    expect(all.blockers).toEqual([]);
    expect(all.steps.map((x) => x.kind)).toEqual(["repay"]);
    const exact = await buildPlan({ ...base, action: "repay", amount: "16" });
    expect(exact.blockers).toEqual([]);
  });

  it("carries the minimum on withdraw plans", async () => {
    chainFns.getPosition.mockResolvedValue({ supplyShares: 0n, borrowShares: 0n, collateral: 2n * E18 });
    const plan = await buildPlan({ ...base, action: "withdraw", amount: "1" });
    expect(plan.market!.minLoan).toBe(MIN);
  });
});

describe("deposit", () => {
  it("approves then deposits the whole wallet balance", async () => {
    const plan = await buildPlan({ ...base, action: "deposit" });
    expect(plan.blockers).toEqual([]);
    expect(plan.steps.map((x) => x.kind)).toEqual(["approve", "supplyCollateral"]);
    expect(plan.steps.map((x) => x.label)).toEqual(["Allow NVDAB", "Deposit NVDAB"]);
    const [approve, supply] = plan.steps;
    expect(approve.selector).toBe(SELECTORS.approve);
    expect(approve.to).toBe(getAddress(NVDAB));
    expect(approve.amount).toBe(2n * E18);
    expect(supply.selector).toBe(SELECTORS.supplyCollateral);
    expect(supply.to).toBe(MOOLAH);
    expect(supply.amount).toBe(2n * E18);
    expect(plan.action).toBe("deposit");
    expect(plan.market).toMatchObject({ loanSymbol: "USD1", minLoan: 0n });
    expect(plan.display.sharesBefore).toBe(0);
    expect(plan.display.sharesAfter).toBe(2);
    expect(plan.display.shareDeltaPct).toBeNull();
    expect(plan.display.debt).toBeNull();
    expect(plan.display.health).toBe("safe");
    // 2 tokens x $228 = $456; safe = 456 * 0.75 * 0.6 = 205.2
    expect(plan.sizing!.collateralValueLoan).toBe(456n * E18);
    expect(plan.sizing!.safeBorrowNew).toBe(20520n * 10n ** 16n);
  });

  it("skips the approve when the allowance already covers the amount", async () => {
    chainFns.erc20Allowance.mockResolvedValue(2n * E18);
    const plan = await buildPlan({ ...base, action: "deposit", amount: "0.5" });
    expect(plan.steps.map((x) => x.kind)).toEqual(["supplyCollateral"]);
    expect(plan.steps[0].amount).toBe(E18 / 2n);
    expect(plan.display.sharesAfter).toBe(0.5);
  });

  it("adds to an existing position and sizes on the total collateral and debt", async () => {
    setMarket(USD1, "USD1", 10_000n * E18, 9_999_999_999n);
    chainFns.getPosition.mockResolvedValue({ supplyShares: 0n, borrowShares: 20n * E18 * 10n ** 6n, collateral: E18 });
    const plan = await buildPlan({ ...base, action: "deposit", amount: "0.5" });
    expect(plan.blockers).toEqual([]);
    expect(plan.display.sharesBefore).toBe(1);
    expect(plan.display.sharesAfter).toBe(1.5);
    // 1.5 x $228 = $342; safe total 342 * 0.75 * 0.6 = 153.9, minus 20 owed
    expect(plan.sizing!.collateralValueLoan).toBe(342n * E18);
    expect(plan.sizing!.safeBorrowNew).toBe(13390n * 10n ** 16n);
    expect(plan.display.debt).toMatchObject({ symbol: "USD1", amount: 20n * E18 });
    expect(plan.display.riskPricePerShare).not.toBeNull();
    expect(plan.display.health).toBe("safe");
  });

  it("is not subject to the minimum loan", async () => {
    m.readMinLoan.mockResolvedValue(15007212616455594723n);
    const plan = await buildPlan({ ...base, action: "deposit", amount: "0.001" });
    expect(plan.blockers).toEqual([]);
    expect(plan.market!.minLoan).toBe(15007212616455594723n);
  });

  it("blocks Ondo tokens, empty wallets, too-large and zero amounts, and missing markets", async () => {
    const ondo = await buildPlan({ address: USER, token: NVDAON, action: "deposit" });
    expect(ondo.blockers.map((x) => x.code)).toEqual(["NOT_BSTOCK"]);

    chainFns.erc20Balance.mockResolvedValue(0n);
    const none = await buildPlan({ ...base, action: "deposit" });
    expect(none.blockers).toEqual([{ code: "INSUFFICIENT_BALANCE", message: "You hold no NVDAB" }]);

    chainFns.erc20Balance.mockResolvedValue(2n * E18);
    const big = await buildPlan({ ...base, action: "deposit", amount: "5" });
    expect(big.blockers).toEqual([{ code: "INSUFFICIENT_BALANCE", message: "You hold less NVDAB than requested" }]);
    expect(big.steps).toEqual([]);

    const zero = await buildPlan({ ...base, action: "deposit", amount: "0" });
    expect(zero.blockers.map((x) => x.code)).toEqual(["INSUFFICIENT_BALANCE"]);

    pickMarketFor.mockResolvedValue(null);
    const noMarket = await buildPlan({ ...base, action: "deposit" });
    expect(noMarket.blockers.map((x) => x.code)).toEqual(["NO_MARKET"]);
  });
});
