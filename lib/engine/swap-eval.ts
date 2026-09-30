import "server-only";
import { getAddress, type Address } from "viem";
import { getQuote, isQuoteAcceptable, type Quote } from "@/lib/binance/trading";

export const SLIPPAGE_BPS = 50n;
export const SLIPPAGE_PERCENT = 0.5;
export const MIN_VALUE_RATIO = 0.98;

export interface SwapToken {
  address: Address;
  symbol: string;
  decimals: number;
  /** USD per whole token. */
  usd: number;
}

/** Value received over value sent, priced at reference prices. Used because quote price impact can under-report broken routes. */
export function valueRatio(
  amountIn: bigint,
  amountOut: bigint,
  from: Pick<SwapToken, "decimals" | "usd">,
  to: Pick<SwapToken, "decimals" | "usd">,
): number {
  const sent = (Number(amountIn) / 10 ** from.decimals) * from.usd;
  const got = (Number(amountOut) / 10 ** to.decimals) * to.usd;
  return sent > 0 ? got / sent : 0;
}

export function applySlippage(amount: bigint): bigint {
  return (amount * (10000n - SLIPPAGE_BPS)) / 10000n;
}

export interface SwapEval {
  quote: Quote;
  valueRatio: number;
  /** 1 - valueRatio, in percent. */
  costPct: number;
  acceptable: boolean;
  /** False when the quote's price impact is above the limit, whatever the value check says. */
  impactOk: boolean;
  minOut: bigint;
}

export async function evaluateSwap(
  from: SwapToken,
  to: SwapToken,
  amountIn: bigint,
  user: string,
): Promise<SwapEval | null> {
  const quote = await getQuote({
    from: from.address,
    to: to.address,
    amount: amountIn,
    userWalletAddress: getAddress(user),
  });
  if (!quote) return null;
  const ratio = valueRatio(amountIn, quote.toAmount, from, to);
  const impactOk = isQuoteAcceptable(quote);
  return {
    quote,
    valueRatio: ratio,
    costPct: (1 - ratio) * 100,
    acceptable: impactOk && ratio >= MIN_VALUE_RATIO,
    impactOk,
    minOut: applySlippage(quote.toAmount),
  };
}

export function swapRejectionMessage(fromSymbol: string, toSymbol: string, e: SwapEval): string {
  return e.impactOk !== false
    ? `Swapping ${fromSymbol} to ${toSymbol} would cost about ${e.costPct.toFixed(2)}%, which is too much`
    : `Price impact for ${fromSymbol} to ${toSymbol} is ${(e.quote.priceImpact * 100).toFixed(2)}%, above the 1% limit. Try again in a moment or use a smaller amount`;
}
