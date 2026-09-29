import { describe, expect, it } from "vitest";
import { selectMarket, availableLiquidity, availableUsdOf, type MarketChainState } from "@/lib/engine/market-select";
import type { EligibleMarket } from "@/lib/lista/markets";

const market = (id: string, loanSymbol: string): EligibleMarket =>
  ({ id, loanSymbol } as unknown as EligibleMarket);

const state = (usd: number): MarketChainState =>
  ({ availableUsd: usd, availableLoan: BigInt(Math.round(usd)) }) as MarketChainState;

const chain = (entries: Record<string, number>) =>
  new Map(Object.entries(entries).map(([id, usd]) => [id, state(usd)]));

describe("selectMarket", () => {
  const markets = [market("a", "USDC"), market("b", "USD1"), market("c", "USDT"), market("d", "U")];

  it("picks the most liquid market when the gap is over 10%", () => {
    expect(selectMarket(markets, chain({ a: 100, b: 5000, c: 1000, d: 800 }))?.id).toBe("b");
  });

  it("prefers USDT within 10% of the best", () => {
    expect(selectMarket(markets, chain({ a: 100, b: 1000, c: 910, d: 500 }))?.id).toBe("c");
  });

  it("then USD1, then U, then USDC", () => {
    expect(selectMarket(markets, chain({ a: 1000, b: 950, c: 10, d: 990 }))?.id).toBe("b");
    expect(selectMarket(markets, chain({ a: 1000, b: 10, c: 10, d: 990 }))?.id).toBe("d");
    expect(selectMarket(markets, chain({ a: 1000, b: 10, c: 10, d: 100 }))?.id).toBe("a");
  });

  it("treats exactly 10% below as within range and just beyond as out", () => {
    expect(selectMarket(markets, chain({ a: 10, b: 10, c: 900, d: 1000 }))?.id).toBe("c");
    expect(selectMarket(markets, chain({ a: 10, b: 10, c: 899, d: 1000 }))?.id).toBe("d");
  });

  it("ignores markets with nothing to borrow and returns null when none", () => {
    expect(selectMarket(markets, chain({ a: 0, b: 0, c: 0, d: 0 }))).toBeNull();
    expect(selectMarket(markets, chain({ a: 0, b: 0, c: 0, d: 5 }))?.id).toBe("d");
    expect(selectMarket([], new Map())).toBeNull();
    expect(selectMarket(markets, new Map())).toBeNull();
  });
});

describe("liquidity helpers", () => {
  it("floors available liquidity at zero", () => {
    const s = { totalSupplyAssets: 5n, totalBorrowAssets: 9n } as never;
    expect(availableLiquidity(s)).toBe(0n);
    expect(availableLiquidity({ totalSupplyAssets: 9n, totalBorrowAssets: 5n } as never)).toBe(4n);
  });
  it("converts to USD with the 8-decimal oracle price", () => {
    expect(availableUsdOf(2n * 10n ** 18n, 18, 99_956_000n)).toBeCloseTo(1.99912, 6);
  });
});
