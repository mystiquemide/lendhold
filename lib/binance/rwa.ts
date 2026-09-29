import "server-only";
import { z } from "zod";
import { getBinance } from "./client";
import { callApi, parseWith } from "./unwrap";
import { cached, LIST_TTL_MS } from "@/lib/cache";
import {
  evmAddress,
  nullableBool,
  nullableNumeric,
  nullableString,
  numeric,
} from "@/lib/schema";

const BSC = "56";
const PUBLIC_BASE =
  "https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/rwa";
const PUBLIC_HEADERS = { "Accept-Encoding": "identity", "User-Agent": "lendhold/0.1" };

export type RwaPlatform = "ondo" | "bstock";

export interface RwaToken {
  address: string;
  symbol: string;
  name: string;
  platformId: RwaPlatform;
  ticker: string;
  decimals: number;
  /** Underlying shares represented by one token. */
  ratio: number;
  logoUrl: string | null;
}

const tokenListSchema = z.array(
  z.object({
    tokenContractAddress: evmAddress,
    tokenSymbol: z.string(),
    tokenName: z.string(),
    platformId: z.enum(["ondo", "bstock"]),
    underlyingTicker: z.string(),
    decimals: numeric,
    tokenToShareRatio: numeric,
    tokenLogoUrl: nullableString,
  }),
);

export async function listRwaTokens(platformId: RwaPlatform): Promise<RwaToken[]> {
  return cached(`rwa:list:${platformId}`, LIST_TTL_MS, async () => {
    const rows = await callApi(
      "getRwaTokenList",
      getBinance().getRwaTokenList({
        binanceChainId: BSC,
        platformId: platformId as never,
      }),
      tokenListSchema,
    );
    return rows.map((r) => ({
      address: r.tokenContractAddress,
      symbol: r.tokenSymbol,
      name: r.tokenName,
      platformId: r.platformId,
      ticker: r.underlyingTicker,
      decimals: r.decimals,
      ratio: r.tokenToShareRatio,
      logoUrl: r.tokenLogoUrl,
    }));
  });
}

export interface RwaPrice {
  tokenPrice: number;
  referencePrice: number | null;
  updatedAt: number | null;
}

const priceSchema = z.array(
  z.object({
    tokenContractAddress: z.string(),
    tokenPrice: numeric,
    referencePrice: nullableNumeric,
    tokenPriceUpdatedAt: nullableNumeric,
  }),
);

/**
 * tokenPrice = referencePrice x ratio. It is derived from the per-share reference price,
 * not a traded price. Use live quotes for anything that moves money.
 */
export async function getRwaPrices(
  addresses: string[],
): Promise<Map<string, RwaPrice>> {
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))];
  const out = new Map<string, RwaPrice>();
  for (let i = 0; i < unique.length; i += 10) {
    const chunk = unique.slice(i, i + 10);
    const rows = await callApi(
      "getRwaTokenPrice",
      getBinance().getRwaTokenPrice({
        binanceChainId: BSC,
        tokenContractAddresses: chunk.join(","),
      }),
      priceSchema,
    );
    for (const r of rows) {
      out.set(r.tokenContractAddress.toLowerCase(), {
        tokenPrice: r.tokenPrice,
        referencePrice: r.referencePrice,
        updatedAt: r.tokenPriceUpdatedAt,
      });
    }
  }
  return out;
}

export interface AssetStatus {
  openState: boolean | null;
  marketStatus: string | null;
  reasonCode: string | null;
  reasonMsg: string | null;
  nextOpenTime: number | null;
  nextCloseTime: number | null;
}

const statusInfoSchema = z.object({
  openState: nullableBool,
  marketStatus: nullableString,
  reasonCode: nullableString,
  reasonMsg: nullableString,
  nextOpenTime: nullableNumeric,
  nextCloseTime: nullableNumeric,
});

const marketDataSchema = z.object({
  statusInfo: statusInfoSchema.nullable().optional(),
});

export async function getAssetStatus(address: string): Promise<AssetStatus> {
  const data = await callApi(
    "getRwaUnderlyingMarketData",
    getBinance().getRwaUnderlyingMarketData({
      binanceChainId: BSC,
      tokenContractAddress: address,
    }),
    marketDataSchema,
  );
  return (
    data.statusInfo ?? {
      openState: null,
      marketStatus: null,
      reasonCode: null,
      reasonMsg: null,
      nextOpenTime: null,
      nextCloseTime: null,
    }
  );
}

export interface MarketSession {
  openState: boolean | null;
  marketStatus: string | null;
  reasonCode: string | null;
  nextOpenTime: number | null;
  nextCloseTime: number | null;
}

const publicEnvelope = <T extends z.ZodType>(data: T) =>
  z.object({ success: z.literal(true), data });

async function fetchPublic(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: PUBLIC_HEADERS,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Binance public endpoint returned HTTP ${res.status}`);
  return res.json();
}

const sessionSchema = publicEnvelope(
  z.object({
    openState: nullableBool,
    marketStatus: nullableString,
    reasonCode: nullableString,
    nextOpenTime: nullableNumeric,
    nextCloseTime: nullableNumeric,
  }),
);

export async function getMarketSession(): Promise<MarketSession> {
  const body = parseWith(
    sessionSchema,
    await fetchPublic(`${PUBLIC_BASE}/market/status/ai`),
    "rwa market status",
  );
  return body.data;
}

export interface XStock {
  address: string;
  symbol: string;
  ticker: string;
  ratio: number;
}

const xStocksSchema = publicEnvelope(
  z.array(
    z.object({
      chainId: z.string(),
      contractAddress: z.string(),
      symbol: z.string(),
      ticker: z.string(),
      multiplier: numeric,
    }),
  ),
);

export async function listXStocksPublic(): Promise<XStock[]> {
  return cached("rwa:xstocks", LIST_TTL_MS, async () => {
    const body = parseWith(
      xStocksSchema,
      await fetchPublic(`${PUBLIC_BASE}/stock/detail/list/ai?type=2`),
      "xstocks list",
    );
    return body.data
      .filter((r) => r.chainId === BSC)
      .map((r) => ({
        address: evmAddress.parse(r.contractAddress),
        symbol: r.symbol,
        ticker: r.ticker,
        ratio: r.multiplier,
      }));
  });
}
