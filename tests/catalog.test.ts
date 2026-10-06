import { describe, expect, it } from "vitest";
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
