import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAddress } from "viem";
import { NVDAB } from "./helpers";

const m = vi.hoisted(() => ({
  listRwaTokens: vi.fn(),
  getRwaPrices: vi.fn(),
  getAssetStatus: vi.fn(),
  getMarketSession: vi.fn(),
  getEligibleMarkets: vi.fn(),
  loadChainStates: vi.fn(),
}));
vi.mock("@/lib/binance/rwa", () => ({
  listRwaTokens: (...a: unknown[]) => m.listRwaTokens(...a),
  getRwaPrices: (...a: unknown[]) => m.getRwaPrices(...a),
  getAssetStatus: (...a: unknown[]) => m.getAssetStatus(...a),
  getMarketSession: (...a: unknown[]) => m.getMarketSession(...a),
}));
const chainM = vi.hoisted(() => ({ readMinLoan: vi.fn(), borrowRatePerSecond: vi.fn() }));
vi.mock("@/lib/lista/chain", () => ({
  readMinLoan: (...a: unknown[]) => chainM.readMinLoan(...a),
  borrowRatePerSecond: (...a: unknown[]) => chainM.borrowRatePerSecond(...a),
  aprFromRatePerSecond: (r: bigint) => (Number(r) / 1e18) * 31_536_000,
}));
vi.mock("@/lib/lista/markets", () => ({ getEligibleMarkets: (...a: unknown[]) => m.getEligibleMarkets(...a) }));
vi.mock("@/lib/engine/market-select", async (orig) => ({
  ...(await orig<typeof import("@/lib/engine/market-select")>()),
  loadChainStates: (...a: unknown[]) => m.loadChainStates(...a),
}));

import { clearCache } from "@/lib/cache";
import { getShareExample, getStockSnapshot, marketLabel, stripIssuerSuffix } from "@/lib/engine/snapshot";
import { bufferBps, BUFFER_CLOSED, BUFFER_OPEN } from "@/lib/engine/sizing";

const bstock = { address: getAddress(NVDAB), symbol: "NVDAB", name: "NVIDIA (bStocks)", platformId: "bstock", ticker: "NVDA", decimals: 18, ratio: 1, logoUrl: null };
const market = { id: "0xaa", loanSymbol: "USD1", params: { lltv: 75n * 10n ** 16n } };

function setup(over: { open?: boolean | null; sessionOpen?: boolean | null; reason?: string | null; status?: string | null; ref?: number | null; markets?: unknown[]; liquidity?: number } = {}) {
  m.getAssetStatus.mockResolvedValue({ openState: over.open === undefined ? true : over.open, marketStatus: over.status ?? null, reasonCode: over.reason === undefined ? "TRADING" : over.reason });
  m.getMarketSession.mockResolvedValue({ openState: over.sessionOpen ?? null, marketStatus: null });
  m.getRwaPrices.mockResolvedValue(new Map([[bstock.address.toLowerCase(), { tokenPrice: 228, referencePrice: over.ref === undefined ? 227.5 : over.ref, updatedAt: 99 }]]));
  m.getEligibleMarkets.mockResolvedValue(over.markets ?? [market]);
  m.loadChainStates.mockResolvedValue(new Map([["0xaa", { availableUsd: over.liquidity ?? 1000 }]]));
}

beforeEach(() => {
  vi.resetAllMocks();
  clearCache();
  m.listRwaTokens.mockResolvedValue([bstock]);
});

describe("bufferBps", () => {
  it("is open only when the market is open and the asset trades", () => {
    expect(bufferBps({ marketOpen: true, assetReasonCode: "TRADING" })).toBe(BUFFER_OPEN);
    expect(bufferBps({ marketOpen: true, assetReasonCode: null })).toBe(BUFFER_OPEN);
    expect(bufferBps({ marketOpen: false, assetReasonCode: "TRADING" })).toBe(BUFFER_CLOSED);
    expect(bufferBps({ marketOpen: true, assetReasonCode: "cash_dividend" })).toBe(BUFFER_CLOSED);
  });
});

describe("getStockSnapshot", () => {
  it("gives 45% safe at 0.75 lltv when open and trading", async () => {
    setup();
    expect(await getStockSnapshot("NVDA")).toEqual({
      ticker: "NVDA",
      name: "NVIDIA",
      perSharePrice: 227.5,
      priceUpdatedAt: 99,
      marketOpen: true,
      marketLabel: "US market open",
      lltv: 0.75,
      safePct: 45,
    });
  });

  it("floors 33.75 to 33 when closed", async () => {
    setup({ open: false });
    const s = await getStockSnapshot("NVDA");
    expect(s.safePct).toBe(33);
    expect(s.marketLabel).toBe("US market closed");
  });

  it("uses the closed buffer when open but the asset is paused", async () => {
    setup({ reason: "DIVIDEND" });
    expect((await getStockSnapshot("NVDA")).safePct).toBe(33);
  });

  it("falls back to the session open state", async () => {
    setup({ open: null, sessionOpen: true });
    expect((await getStockSnapshot("NVDA")).marketOpen).toBe(true);
  });

  it("throws without a bStock, a reference price or a market", async () => {
    setup();
    await expect(getStockSnapshot("ZZZZ")).rejects.toMatchObject({ code: "UNKNOWN_TICKER" });
    clearCache();
    setup({ ref: null });
    await expect(getStockSnapshot("NVDA")).rejects.toMatchObject({ code: "NO_PRICE" });
    clearCache();
    setup({ liquidity: 0 });
    await expect(getStockSnapshot("NVDA")).rejects.toMatchObject({ code: "NO_MARKET" });
  });
});

describe("marketLabel and name", () => {
  it("maps each session state", () => {
    expect(marketLabel(false, "premarket")).toBe("US market closed");
    expect(marketLabel(true, "PreMarket")).toBe("US pre-market open");
    expect(marketLabel(true, "pre_market")).toBe("US pre-market open");
    expect(marketLabel(true, "afterhours")).toBe("US after-hours open");
    expect(marketLabel(true, "after_hours")).toBe("US after-hours open");
    expect(marketLabel(true, "POSTMARKET")).toBe("US after-hours open");
    expect(marketLabel(true, "post_market")).toBe("US after-hours open");
    expect(marketLabel(true, "regular")).toBe("US market open");
    expect(marketLabel(true, null)).toBe("US market open");
  });

  it("strips the issuer suffix", () => {
    expect(stripIssuerSuffix("NVIDIA (bStocks)")).toBe("NVIDIA");
    expect(stripIssuerSuffix("Apple")).toBe("Apple");
  });
});

describe("getShareExample", () => {
  const E18 = 10n ** 18n;
  const ratioToken = { ...bstock, ratio: 1.25 };
  const chainState = (over: Record<string, unknown> = {}) => ({
    availableUsd: 1000,
    availableLoan: 1_000n * E18,
    loanDecimals: 18,
    loanPrice: 100_000_000n,
    collateralPrice: 200n * 100_000_000n,
    state: {},
    ...over,
  });

  function setupExample(over: { open?: boolean; reason?: string | null; chain?: Record<string, unknown> } = {}) {
    setup({ open: over.open ?? true, reason: over.reason });
    m.listRwaTokens.mockResolvedValue([ratioToken]);
    m.loadChainStates.mockResolvedValue(new Map([["0xaa", chainState(over.chain)]]));
    chainM.readMinLoan.mockResolvedValue(15n * E18);
    chainM.borrowRatePerSecond.mockResolvedValue(273059248n);
  }

  it("sizes exactly one share when the ratio is not 1, open buffer", async () => {
    setupExample();
    const e = await getShareExample("NVDA");
    // 1 share = 0.8 tokens at $200 per token = $160 of collateral
    expect(e.sharePrice).toBeCloseTo(160, 9);
    expect(e.maxBorrow).toBeCloseTo(120, 6);
    expect(e.safeBorrow).toBeCloseTo(72, 6);
    // liquidation: 72 / (0.8 * 0.75) = 120 per token, 96 per share
    expect(e.riskPricePerShare).toBeCloseTo(96, 6);
    expect(e.cushionPct).toBeCloseTo(40, 6);
    expect(e.health).toBe("safe");
    expect(e.marketOpen).toBe(true);
    expect(e.loanSymbol).toBe("USD1");
    expect(e.minLoan).toBeCloseTo(15.15, 9);
    expect(e.aprPct).toBeCloseTo((273059248 / 1e18) * 31_536_000 * 100, 9);
  });

  it("uses the closed buffer, so cushion is 1 minus the buffer", async () => {
    setupExample({ open: false });
    const e = await getShareExample("NVDA");
    expect(e.maxBorrow).toBeCloseTo(120, 6);
    expect(e.safeBorrow).toBeCloseTo(54, 6);
    expect(e.riskPricePerShare).toBeCloseTo(72, 6);
    expect(e.cushionPct).toBeCloseTo(55, 6);
  });

  it("caps borrowing at available liquidity", async () => {
    setupExample({ chain: { availableLoan: 50n * E18 } });
    const e = await getShareExample("NVDA");
    expect(e.safeBorrow).toBeCloseTo(50, 6);
    expect(e.maxBorrow).toBeCloseTo(50, 6);
  });
});
