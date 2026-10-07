import { describe, expect, it, vi } from "vitest";
import { sortCatalog, type CatalogStock } from "@/lib/engine/catalog";

const stock = (ticker: string, liquidityUsd = 0): CatalogStock => ({
  address: `0x${ticker}`, symbol: `${ticker}B`, name: ticker, ticker, logoUrl: null, perShare: 1, borrowable: liquidityUsd > 0, liquidityUsd,
});

describe("sortCatalog", () => {
  it("puts featured stocks first in their order, then the rest by borrowing room, then by ticker", () => {
    const out = sortCatalog([stock("ZZZ"), stock("ORCL", 15), stock("TSLA"), stock("AAA"), stock("NVDA"), stock("AMD", 500)]);
    expect(out.map((s) => s.ticker)).toEqual(["NVDA", "TSLA", "AMD", "ORCL", "AAA", "ZZZ"]);
  });
});

describe("listCatalog", () => {
  it("still lists every stock when Binance rate-limits the price call", async () => {
    vi.resetModules();
    vi.doMock("@/lib/binance/rwa", () => ({
      listRwaTokens: async () => [
        { address: "0xN", symbol: "NVDAB", name: "NVIDIA (bStocks)", ticker: "NVDA", logoUrl: "https://x/n.png", ratio: 1 },
        { address: "0xZ", symbol: "ZZZB", name: "Zed (bStocks)", ticker: "ZZZ", logoUrl: null, ratio: 1 },
      ],
      getRwaPrices: async () => {
        throw new Error("Rate limit exceeded");
      },
    }));
    vi.doMock("@/lib/lista/markets", () => ({ listBStockMarkets: async () => [{ collateralSymbol: "NVDAB", liquidityUsd: 1000 }] }));
    const { clearCache } = await import("@/lib/cache");
    clearCache();
    const { listCatalog } = await import("@/lib/engine/catalog");
    const out = await listCatalog();
    expect(out.map((s) => s.ticker)).toEqual(["NVDA", "ZZZ"]);
    expect(out[0]).toMatchObject({ name: "NVIDIA", perShare: null, borrowable: true, logoUrl: "https://x/n.png" });
    expect(out[1]).toMatchObject({ perShare: null, borrowable: false });
  });
});
