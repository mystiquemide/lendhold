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
vi.mock("@/lib/lista/markets", () => ({ getEligibleMarkets: (...a: unknown[]) => m.getEligibleMarkets(...a) }));
vi.mock("@/lib/engine/market-select", async (orig) => ({
  ...(await orig<typeof import("@/lib/engine/market-select")>()),
  loadChainStates: (...a: unknown[]) => m.loadChainStates(...a),
}));

import { clearCache } from "@/lib/cache";
import { getStockSnapshot, marketLabel, stripIssuerSuffix } from "@/lib/engine/snapshot";
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
