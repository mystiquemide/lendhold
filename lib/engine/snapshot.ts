import "server-only";
import { cached } from "@/lib/cache";
import { AppError } from "@/lib/errors";
import { getAssetStatus, getMarketSession, getRwaPrices } from "@/lib/binance/rwa";
import { getEligibleMarkets } from "@/lib/lista/markets";
import { loadChainStates, selectMarket } from "./market-select";
import { bufferBps } from "./sizing";
import { findBStockByTicker } from "./tokens";

export interface StockSnapshot {
  ticker: string;
  name: string;
  perSharePrice: number;
  priceUpdatedAt: number | null;
  marketOpen: boolean;
  marketLabel: string;
  lltv: number;
  safePct: number;
}

const WAD = 10n ** 18n;
const BPS = 10_000n;
const SNAPSHOT_TTL_MS = 60_000;

export function stripIssuerSuffix(name: string): string {
  return name.replace(/\s*\(bStocks\)\s*$/i, "").trim();
}

export function marketLabel(marketOpen: boolean, marketStatus: string | null): string {
  if (!marketOpen) return "US market closed";
  const status = (marketStatus ?? "").toLowerCase().replace(/[\s_-]/g, "");
  if (status === "premarket") return "US pre-market open";
  if (status === "afterhours" || status === "postmarket") return "US after-hours open";
  return "US market open";
}

export function safePercent(lltv: bigint, buffer: bigint): number {
  return Number((lltv * buffer * 100n) / (WAD * BPS));
}

export function getStockSnapshot(ticker: string): Promise<StockSnapshot> {
  return cached(`snapshot:${ticker.toUpperCase()}`, SNAPSHOT_TTL_MS, () => loadSnapshot(ticker));
}

async function loadSnapshot(ticker: string): Promise<StockSnapshot> {
  const token = await findBStockByTicker(ticker);
  if (!token) throw new AppError("UNKNOWN_TICKER", `No bStock for ${ticker}`, 404);

  const [prices, session, asset, markets] = await Promise.all([
    getRwaPrices([token.address]),
    getMarketSession(),
    getAssetStatus(token.address),
    getEligibleMarkets(token),
  ]);
  const price = prices.get(token.address.toLowerCase());
  if (!price || price.referencePrice === null) {
    throw new AppError("NO_PRICE", `No reference price for ${token.ticker}`, 502);
  }
  const chain = await loadChainStates(markets);
  const market = selectMarket(markets, chain);
  if (!market) throw new AppError("NO_MARKET", `No lending market with room for ${token.ticker}`, 404);

  const marketOpen = (asset.openState ?? session.openState) === true;
  const buffer = bufferBps({ marketOpen, assetReasonCode: asset.reasonCode });
  return {
    ticker: token.ticker,
    name: stripIssuerSuffix(token.name),
    perSharePrice: price.referencePrice,
    priceUpdatedAt: price.updatedAt,
    marketOpen,
    marketLabel: marketLabel(marketOpen, asset.marketStatus ?? session.marketStatus),
    lltv: Number(market.params.lltv) / Number(WAD),
    safePct: safePercent(market.params.lltv, buffer),
  };
}
