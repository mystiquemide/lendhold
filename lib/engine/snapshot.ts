import "server-only";
import { cached } from "@/lib/cache";
import { AppError } from "@/lib/errors";
import { getAssetStatus, getMarketSession, getRwaPrices } from "@/lib/binance/rwa";
import { aprFromRatePerSecond, borrowRatePerSecond, readMinLoan } from "@/lib/lista/chain";
import { getEligibleMarkets } from "@/lib/lista/markets";
import { loadChainStates, selectMarket, type MarketChainState } from "./market-select";
import { computeRisk, toUnits, type Health } from "./risk";
import { bufferBps, computeSizing, minLoanFloor } from "./sizing";
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
const RATIO_SCALE = 1_000_000_000;

export interface ShareExample {
  ticker: string;
  name: string;
  /** USD per share, from the market oracle. */
  sharePrice: number;
  loanSymbol: string;
  /** Loan units. */
  safeBorrow: number;
  maxBorrow: number;
  minLoan: number;
  aprPct: number;
  riskPricePerShare: number | null;
  cushionPct: number | null;
  health: Health;
  marketOpen: boolean;
}

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

async function loadInputs(ticker: string) {
  const token = await findBStockByTicker(ticker);
  if (!token) throw new AppError("UNKNOWN_TICKER", `No bStock for ${ticker}`, 404);

  const [prices, session, asset, markets] = await Promise.all([
    getRwaPrices([token.address]),
    getMarketSession(),
    getAssetStatus(token.address),
    getEligibleMarkets(token),
  ]);
  const chain = await loadChainStates(markets);
  const market = selectMarket(markets, chain);
  if (!market) throw new AppError("NO_MARKET", `No lending market with room for ${token.ticker}`, 404);

  const marketOpen = (asset.openState ?? session.openState) === true;
  return {
    token,
    price: prices.get(token.address.toLowerCase()),
    session,
    asset,
    market,
    chainState: chain.get(market.id) as MarketChainState,
    marketOpen,
    sizingSession: { marketOpen, assetReasonCode: asset.reasonCode },
  };
}

export function getStockSnapshot(ticker: string): Promise<StockSnapshot> {
  return cached(`snapshot:${ticker.toUpperCase()}`, SNAPSHOT_TTL_MS, () => loadSnapshot(ticker));
}

async function loadSnapshot(ticker: string): Promise<StockSnapshot> {
  const { token, price, session, asset, market, marketOpen, sizingSession } = await loadInputs(ticker);
  if (!price || price.referencePrice === null) {
    throw new AppError("NO_PRICE", `No reference price for ${token.ticker}`, 502);
  }
  return {
    ticker: token.ticker,
    name: stripIssuerSuffix(token.name),
    perSharePrice: price.referencePrice,
    priceUpdatedAt: price.updatedAt,
    marketOpen,
    marketLabel: marketLabel(marketOpen, asset.marketStatus ?? session.marketStatus),
    lltv: Number(market.params.lltv) / Number(WAD),
    safePct: safePercent(market.params.lltv, bufferBps(sizingSession)),
  };
}

export function getShareExample(ticker: string): Promise<ShareExample> {
  return cached(`example:${ticker.toUpperCase()}`, SNAPSHOT_TTL_MS, () => loadShareExample(ticker));
}

async function loadShareExample(ticker: string): Promise<ShareExample> {
  const { token, market, chainState, marketOpen, sizingSession } = await loadInputs(ticker);
  const { params } = market;
  const { loanDecimals, loanPrice, collateralPrice, state, availableLoan } = chainState;

  const oneShareRaw = (10n ** BigInt(token.decimals) * BigInt(RATIO_SCALE)) / BigInt(Math.round(token.ratio * RATIO_SCALE));
  const sizing = computeSizing({
    collateralRaw: oneShareRaw,
    collateralDecimals: token.decimals,
    collateralPrice,
    loanPrice,
    loanDecimals,
    lltv: params.lltv,
    existingDebt: 0n,
    availableLiquidity: availableLoan,
    session: sizingSession,
  });
  const risk = computeRisk({
    collateralRaw: oneShareRaw,
    collateralDecimals: token.decimals,
    ratio: token.ratio,
    debtRaw: sizing.safeBorrowNew,
    loanDecimals,
    collateralPrice,
    loanPrice,
    lltv: params.lltv,
  });
  const [minLoanRaw, rate] = await Promise.all([readMinLoan(params), borrowRatePerSecond(params, state)]);
  return {
    ticker: token.ticker,
    name: stripIssuerSuffix(token.name),
    sharePrice: Number(collateralPrice) / 1e8 / token.ratio,
    loanSymbol: market.loanSymbol,
    safeBorrow: toUnits(sizing.safeBorrowNew, loanDecimals),
    maxBorrow: toUnits(sizing.maxBorrowNew, loanDecimals),
    minLoan: toUnits(minLoanFloor(minLoanRaw), loanDecimals),
    aprPct: aprFromRatePerSecond(rate) * 100,
    riskPricePerShare: risk.liquidationPricePerShare,
    cushionPct: risk.cushion === null ? null : risk.cushion * 100,
    health: risk.health,
    marketOpen,
  };
}
