import "server-only";
import { cached } from "@/lib/cache";
import { AppError } from "@/lib/errors";
import { getAssetStatus, getMarketSession, getRwaPrices, listRwaTokens } from "@/lib/binance/rwa";
import { getQuote } from "@/lib/binance/trading";
import { aprFromRatePerSecond, borrowRatePerSecond, readMinLoan } from "@/lib/lista/chain";
import { getEligibleMarkets } from "@/lib/lista/markets";
import { loadChainStates, selectMarket, type MarketChainState } from "./market-select";
import { computeRisk, toUnits, type Health } from "./risk";
import { bufferBps, computeSizing, minLoanFloor } from "./sizing";
import { findBStockByTicker, USDT } from "./tokens";

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

/** Landing reads share one status per token for a short while. The planner keeps reading it fresh. */
function landingStatus(address: string) {
  return cached(`status:${address.toLowerCase()}`, 30_000, () => getAssetStatus(address));
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
    landingStatus(token.address),
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

export interface ConversionExample {
  onSymbol: string;
  bSymbol: string;
  /** Shares held before, for one Ondo token. */
  sharesBefore: number;
  /** Shares held after both swaps, at the quoted amounts. */
  sharesAfter: number;
  costPct: number;
}

/** Any address works for a quote. Nothing is signed or sent. */
const QUOTE_WALLET = "0x000000000000000000000000000000000000dEaD";

export function getConversionExample(ticker: string): Promise<ConversionExample | null> {
  return cached(`conversion:${ticker.toUpperCase()}`, SNAPSHOT_TTL_MS, () => loadConversionExample(ticker));
}

/** Quotes one Ondo token to USDT, then USDT to the matching bStock. Null when either token is not trading or a leg has no route. */
async function loadConversionExample(ticker: string): Promise<ConversionExample | null> {
  const [ondo, bstock] = await Promise.all([
    listRwaTokens("ondo").then((list) => list.find((t) => t.ticker.toUpperCase() === ticker.toUpperCase()) ?? null),
    findBStockByTicker(ticker),
  ]);
  if (!ondo || !bstock) return null;
  const statuses = await Promise.all([landingStatus(ondo.address), landingStatus(bstock.address)]);
  if (statuses.some((st) => st.openState !== true || (st.reasonCode ?? "").toUpperCase() !== "TRADING")) return null;

  const leg1 = await getQuote({
    from: ondo.address as `0x${string}`,
    to: USDT,
    amount: 10n ** BigInt(ondo.decimals),
    userWalletAddress: QUOTE_WALLET,
  });
  if (!leg1 || leg1.toAmount === 0n) return null;
  const leg2 = await getQuote({
    from: USDT,
    to: bstock.address as `0x${string}`,
    amount: leg1.toAmount,
    userWalletAddress: QUOTE_WALLET,
  });
  if (!leg2 || leg2.toAmount === 0n) return null;

  const sharesBefore = ondo.ratio;
  const sharesAfter = toUnits(leg2.toAmount, bstock.decimals) * bstock.ratio;
  return {
    onSymbol: ondo.symbol,
    bSymbol: bstock.symbol,
    sharesBefore,
    sharesAfter,
    costPct: (1 - sharesAfter / sharesBefore) * 100,
  };
}
