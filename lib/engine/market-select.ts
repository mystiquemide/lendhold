import "server-only";
import { formatUnits, type Address, type Hex } from "viem";
import {
  erc20Decimals,
  getMarketState,
  peekPrice,
  type MarketState,
} from "@/lib/lista/chain";
import { getEligibleMarkets, type EligibleMarket } from "@/lib/lista/markets";

export interface MarketChainState {
  state: MarketState;
  /** totalSupplyAssets - totalBorrowAssets, in loan units. */
  availableLoan: bigint;
  availableUsd: number;
  loanDecimals: number;
  /** 8-decimal USD. */
  loanPrice: bigint;
  collateralPrice: bigint;
}

const PREFERENCE = ["USDT", "USD1", "U", "USDC"];
const CLOSE_WITHIN = 0.1;

export function availableLiquidity(state: MarketState): bigint {
  const v = state.totalSupplyAssets - state.totalBorrowAssets;
  return v > 0n ? v : 0n;
}

export function availableUsdOf(available: bigint, loanDecimals: number, loanPrice: bigint): number {
  return Number(formatUnits(available, loanDecimals)) * (Number(loanPrice) / 1e8);
}

export async function fetchChainState(market: EligibleMarket): Promise<MarketChainState> {
  const [state, loanDecimals, loanPrice, collateralPrice] = await Promise.all([
    getMarketState(market.id),
    erc20Decimals(market.params.loanToken),
    peekPrice(market.params.oracle, market.params.loanToken),
    peekPrice(market.params.oracle, market.params.collateralToken),
  ]);
  const availableLoan = availableLiquidity(state);
  return {
    state,
    availableLoan,
    availableUsd: availableUsdOf(availableLoan, loanDecimals, loanPrice),
    loanDecimals,
    loanPrice,
    collateralPrice,
  };
}

function preferenceRank(symbol: string): number {
  const i = PREFERENCE.indexOf(symbol);
  return i === -1 ? PREFERENCE.length : i;
}

/**
 * Highest on-chain liquidity wins. Markets within 10% of the best are treated as equal and
 * ordered USDT, USD1, U, USDC. Markets with nothing to borrow are never chosen.
 */
export function selectMarket(
  markets: EligibleMarket[],
  chain: Map<string, MarketChainState>,
): EligibleMarket | null {
  const live = markets
    .map((market) => ({ market, usd: chain.get(market.id)?.availableUsd ?? 0 }))
    .filter((c) => c.usd > 0);
  if (live.length === 0) return null;
  const top = Math.max(...live.map((c) => c.usd));
  const contenders = live.filter((c) => c.usd >= top * (1 - CLOSE_WITHIN));
  contenders.sort(
    (a, b) =>
      preferenceRank(a.market.loanSymbol) - preferenceRank(b.market.loanSymbol) ||
      b.usd - a.usd,
  );
  return contenders[0].market;
}

export interface MarketPick {
  market: EligibleMarket;
  chain: MarketChainState;
  all: EligibleMarket[];
  chainStates: Map<string, MarketChainState>;
}

export async function loadChainStates(
  markets: EligibleMarket[],
): Promise<Map<string, MarketChainState>> {
  const entries = await Promise.all(
    markets.map(async (m) => [m.id as Hex, await fetchChainState(m)] as const),
  );
  return new Map(entries);
}

export async function pickMarketFor(
  collateral: { address: string; symbol: string },
  user?: Address | string,
): Promise<MarketPick | null> {
  const all = await getEligibleMarkets(collateral, user);
  const chainStates = await loadChainStates(all);
  const market = selectMarket(all, chainStates);
  if (!market) return null;
  return { market, chain: chainStates.get(market.id)!, all, chainStates };
}
