import "server-only";
import { getAddress, parseUnits, type Address } from "viem";
import { AppError } from "@/lib/errors";
import { listRwaTokens, type RwaPrice, type RwaToken } from "@/lib/binance/rwa";

export const USDT: Address = getAddress("0x55d398326f99059fF775485246999027B3197955");
export const STABLE_SYMBOLS = ["USDT", "USD1", "U", "USDC"] as const;

export function isStableSymbol(symbol: string): boolean {
  return (STABLE_SYMBOLS as readonly string[]).includes(symbol);
}

export async function findStockToken(address: string): Promise<RwaToken | null> {
  const target = getAddress(address);
  const [ondo, bstock] = await Promise.all([listRwaTokens("ondo"), listRwaTokens("bstock")]);
  return [...bstock, ...ondo].find((t) => t.address === target) ?? null;
}

export async function findBStockByTicker(ticker: string): Promise<RwaToken | null> {
  const bstock = await listRwaTokens("bstock");
  return bstock.find((t) => t.ticker.toUpperCase() === ticker.toUpperCase()) ?? null;
}

/** USD per token: reference price per share times shares per token. Falls back to the listed token price. */
export function stockUsdPerToken(token: RwaToken, price: RwaPrice | undefined): number | null {
  if (!price) return null;
  if (price.referencePrice != null) return price.referencePrice * token.ratio;
  return price.tokenPrice;
}

export function parseAmount(text: string, decimals: number, label = "amount"): bigint {
  if (!/^\d+(\.\d+)?$/.test(text.trim())) {
    throw new AppError("BAD_AMOUNT", `${label} must be a positive decimal number`);
  }
  const fraction = text.trim().split(".")[1] ?? "";
  if (fraction.length > decimals) {
    throw new AppError("BAD_AMOUNT", `${label} has more than ${decimals} decimal places`);
  }
  const value = parseUnits(text.trim(), decimals);
  if (value <= 0n) throw new AppError("BAD_AMOUNT", `${label} must be greater than zero`);
  return value;
}
