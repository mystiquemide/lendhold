import "server-only";
import { formatUnits, getAddress } from "viem";
import { z } from "zod";
import { getBinance } from "./client";
import { callApi } from "./unwrap";
import { bigintString, evmAddress } from "@/lib/schema";

const BSC = "56";
const PAGE_SIZE = 100;
const MAX_PAGES = 20;

export interface TokenBalance {
  address: string;
  symbol: string;
  decimals: number;
  /** Raw units. */
  amount: bigint;
  amountFormatted: string;
  usdValue: number | null;
}

const pagesSchema = z.array(
  z.object({
    tokenAssets: z.array(
      z.object({
        tokenContractAddress: evmAddress,
        // Some tokens come back without a symbol. Holdings match by address, so an empty one is fine.
        symbol: z.string().nullable().optional().transform((v) => v ?? ""),
        balance: z.string(),
        rawBalance: bigintString,
        tokenPrice: z
          .union([z.string(), z.number()])
          .nullable()
          .optional()
          .transform((v) => (v === "" || v == null ? null : Number(v))),
      }),
    ),
  }),
);

/** The API omits decimals, so they are recovered from rawBalance / balance. */
function inferDecimals(raw: bigint, balance: string): number {
  const shown = Number(balance);
  if (raw === 0n || !Number.isFinite(shown) || shown === 0) return 18;
  const d = Math.round(Math.log10(Number(raw) / shown));
  return Math.min(Math.max(d, 0), 36);
}

export async function getBalances(address: string): Promise<TokenBalance[]> {
  const owner = getAddress(address);
  const out: TokenBalance[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const pages = await callApi(
      "getAllTokenBalancesByAddress",
      getBinance().getAllTokenBalancesByAddress({
        address: owner,
        chains: BSC,
        page,
        pageSize: PAGE_SIZE,
      }),
      pagesSchema,
    );
    const assets = pages.flatMap((p) => p.tokenAssets);
    for (const a of assets) {
      const decimals = inferDecimals(a.rawBalance, a.balance);
      const usd =
        a.tokenPrice != null && Number.isFinite(Number(a.balance))
          ? Number(a.balance) * a.tokenPrice
          : null;
      out.push({
        address: a.tokenContractAddress,
        symbol: a.symbol,
        decimals,
        amount: a.rawBalance,
        amountFormatted: formatUnits(a.rawBalance, decimals),
        usdValue: usd,
      });
    }
    if (assets.length < PAGE_SIZE) break;
  }
  return out;
}
