import "server-only";
import { formatUnits, getAddress } from "viem";
import { getBalances } from "@/lib/binance/wallet";
import {
  getRwaPrices,
  listRwaTokens,
  listXStocksPublic,
  type RwaToken,
} from "@/lib/binance/rwa";
import { erc20Decimals } from "@/lib/lista/chain";
import { getEligibleMarkets } from "@/lib/lista/markets";
import { loadChainStates } from "./market-select";

export type HoldingPlatform = "bstock" | "ondo" | "xstocks";
export type HoldingStatus = "ready" | "convert" | "unsupported";

export interface Holding {
  address: string;
  symbol: string;
  /** Company or fund name without the issuer suffix. */
  name: string;
  logoUrl: string | null;
  ticker: string;
  platform: HoldingPlatform;
  decimals: number;
  /** Shares per token. */
  ratio: number;
  amount: bigint;
  shares: number;
  perSharePrice: number | null;
  valueUsd: number | null;
  status: HoldingStatus;
  reason: string;
  matchingBStock?: { address: string; symbol: string };
}

/** "NVIDIA (bStocks)" and "Vicor (Ondo Tokenized)" become "NVIDIA" and "Vicor". */
export function cleanTokenName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim() || name;
}

export const NO_ROOM = "No lending market with room right now";

async function hasRoom(token: RwaToken, user: string): Promise<boolean> {
  const markets = await getEligibleMarkets({ address: token.address, symbol: token.symbol }, user);
  if (markets.length === 0) return false;
  const states = await loadChainStates(markets);
  return [...states.values()].some((s) => s.availableLoan > 0n);
}

export async function getHoldings(address: string): Promise<Holding[]> {
  const owner = getAddress(address);
  const [balances, ondo, bstock, xstocks] = await Promise.all([
    getBalances(owner),
    listRwaTokens("ondo"),
    listRwaTokens("bstock"),
    listXStocksPublic(),
  ]);
  const byAddress = new Map<string, { token: RwaToken | null; platform: HoldingPlatform; x?: (typeof xstocks)[number] }>();
  for (const t of ondo) byAddress.set(t.address.toLowerCase(), { token: t, platform: "ondo" });
  for (const t of bstock) byAddress.set(t.address.toLowerCase(), { token: t, platform: "bstock" });
  for (const x of xstocks) {
    if (!byAddress.has(x.address.toLowerCase())) {
      byAddress.set(x.address.toLowerCase(), { token: null, platform: "xstocks", x });
    }
  }

  const owned = balances
    .filter((b) => b.amount > 0n && byAddress.has(b.address.toLowerCase()))
    .map((b) => ({ balance: b, entry: byAddress.get(b.address.toLowerCase())! }));
  if (owned.length === 0) return [];

  const prices = await getRwaPrices(owned.map((o) => o.balance.address));
  const bstockByTicker = new Map(bstock.map((t) => [t.ticker.toUpperCase(), t]));
  const roomCache = new Map<string, Promise<boolean>>();
  const room = (t: RwaToken) => {
    const key = t.address;
    if (!roomCache.has(key)) roomCache.set(key, hasRoom(t, owner));
    return roomCache.get(key)!;
  };

  return Promise.all(
    owned.map(async ({ balance, entry }): Promise<Holding> => {
      const price = prices.get(balance.address.toLowerCase());
      const token = entry.token;
      const decimals = token ? token.decimals : await erc20Decimals(balance.address as `0x${string}`);
      const ratio = token ? token.ratio : entry.x!.ratio;
      const symbol = token ? token.symbol : entry.x!.symbol;
      const ticker = token ? token.ticker : entry.x!.ticker;
      const tokens = Number(formatUnits(balance.amount, decimals));
      const base = {
        address: balance.address,
        symbol,
        name: token ? cleanTokenName(token.name) : ticker,
        logoUrl: token?.logoUrl ?? null,
        ticker,
        platform: entry.platform,
        decimals,
        ratio,
        amount: balance.amount,
        shares: tokens * ratio,
        perSharePrice: price?.referencePrice ?? null,
        valueUsd: price ? tokens * price.tokenPrice : null,
      };

      if (entry.platform === "xstocks") {
        return { ...base, status: "unsupported", reason: "Not supported on BSC yet" };
      }
      if (entry.platform === "bstock") {
        return (await room(token!))
          ? { ...base, status: "ready", reason: "Ready to borrow against" }
          : { ...base, status: "unsupported", reason: NO_ROOM };
      }
      const match = bstockByTicker.get(ticker.toUpperCase());
      if (!match) {
        return { ...base, status: "unsupported", reason: "No matching bStock to convert into" };
      }
      const matchingBStock = { address: match.address, symbol: match.symbol };
      return (await room(match))
        ? { ...base, status: "convert", reason: `Convert to ${match.symbol} to borrow`, matchingBStock }
        : { ...base, status: "unsupported", reason: NO_ROOM, matchingBStock };
    }),
  );
}
