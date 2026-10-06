import "server-only";
import { cached, LIST_TTL_MS, withLastGood } from "@/lib/cache";
import { getRwaPrices, listRwaTokens } from "@/lib/binance/rwa";
import { listBStockMarkets } from "@/lib/lista/markets";
import { cleanTokenName } from "./holdings";

export interface CatalogStock {
  address: string;
  symbol: string;
  name: string;
  ticker: string;
  logoUrl: string | null;
  /** USD per share of the underlying stock. Null when Binance has no price. */
  perShare: number | null;
  /** Lista lends against it, and how much is free to borrow across its markets. */
  borrowable: boolean;
  liquidityUsd: number;
}

/** Shown first, in this order, then the rest by free borrowing room. */
const FEATURED = ["NVDA", "TSLA", "AAPL", "MSFT", "GOOGL", "AMZN", "META", "SPY", "QQQ"];

export function sortCatalog(stocks: CatalogStock[]): CatalogStock[] {
  const rank = (t: string) => {
    const i = FEATURED.indexOf(t);
    return i === -1 ? FEATURED.length : i;
  };
  return [...stocks].sort(
    (a, b) => rank(a.ticker) - rank(b.ticker) || b.liquidityUsd - a.liquidityUsd || a.ticker.localeCompare(b.ticker),
  );
}

/** Every bStock you can buy on BNB Chain, with its share price and whether Lista lends against it. */
export async function listCatalog(): Promise<CatalogStock[]> {
  return withLastGood("catalog:bstock", () =>
    cached("catalog:bstock", LIST_TTL_MS, async () => {
      const [tokens, markets] = await Promise.all([listRwaTokens("bstock"), listBStockMarkets()]);
      const prices = await getRwaPrices(tokens.map((t) => t.address));
      const liquidity = new Map<string, number>();
      for (const m of markets) {
        const key = m.collateralSymbol.toUpperCase();
        liquidity.set(key, (liquidity.get(key) ?? 0) + Math.max(0, m.liquidityUsd));
      }
      return sortCatalog(
        tokens.map((t) => {
          const p = prices.get(t.address.toLowerCase());
          const liq = liquidity.get(t.symbol.toUpperCase());
          return {
            address: t.address,
            symbol: t.symbol,
            name: cleanTokenName(t.name),
            ticker: t.ticker,
            logoUrl: t.logoUrl,
            perShare: p ? (p.referencePrice ?? p.tokenPrice / t.ratio) : null,
            borrowable: liq !== undefined,
            liquidityUsd: liq ?? 0,
          };
        }),
      );
    }),
  );
}
