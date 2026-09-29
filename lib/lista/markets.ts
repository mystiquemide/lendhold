import "server-only";
import { getAddress, type Address, type Hex } from "viem";
import { z } from "zod";
import { cached, LIST_TTL_MS } from "@/lib/cache";
import { getConfig } from "@/lib/config";
import { parseWith } from "@/lib/binance/unwrap";
import { numeric } from "@/lib/schema";
import {
  DEAD_ADDRESS,
  ZERO_ADDRESS,
  readMarketGate,
  type MarketParams,
} from "./chain";

const PAGE_SIZE = 50;
const MAX_PAGES = 20;

export interface ListaMarket {
  id: Hex;
  collateralSymbol: string;
  loanSymbol: string;
  /** Fraction: 0.75 = 75%. */
  lltv: number;
  liquidityUsd: number;
  totalBorrow: number;
  rateRaw: string;
  termType: number;
}

const pageSchema = z.object({
  code: z.union([z.string(), z.number()]).optional(),
  data: z.object({
    total: numeric,
    list: z.array(
      z.looseObject({
        id: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
        lltv: numeric,
        liquidityUsd: numeric,
        totalBorrowAsset: numeric,
        loan: z.string(),
        collateral: z.string(),
        rate: z.union([z.string(), z.number()]).transform(String),
        termType: numeric,
      }),
    ),
  }),
});

async function fetchPage(page: number) {
  const url = new URL("/api/moolah/borrow/markets", getConfig().LISTA_API_BASE);
  url.searchParams.set("chainId", "56");
  url.searchParams.set("zone", "5");
  url.searchParams.set("page", String(page));
  url.searchParams.set("pageSize", String(PAGE_SIZE));
  const res = await fetch(url, {
    headers: { "User-Agent": "lendhold/0.1", Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Lista markets API returned HTTP ${res.status}`);
  return parseWith(pageSchema, await res.json(), "Lista markets page").data;
}

export async function listBStockMarkets(): Promise<ListaMarket[]> {
  return cached("lista:markets", LIST_TTL_MS, async () => {
    const byId = new Map<string, ListaMarket>();
    let total = Infinity;
    for (let page = 1; page <= MAX_PAGES && byId.size < total; page++) {
      const data = await fetchPage(page);
      total = data.total;
      if (data.list.length === 0) break;
      for (const m of data.list) {
        const id = m.id.toLowerCase() as Hex;
        if (byId.has(id)) continue;
        byId.set(id, {
          id,
          collateralSymbol: m.collateral,
          loanSymbol: m.loan,
          lltv: m.lltv,
          liquidityUsd: m.liquidityUsd,
          totalBorrow: m.totalBorrowAsset,
          rateRaw: m.rate,
          termType: m.termType,
        });
      }
    }
    return [...byId.values()];
  });
}

export interface EligibleMarket extends ListaMarket {
  params: MarketParams;
}

/**
 * Markets where `collateral` can be deposited by `user`. Needs the whitelist, no provider for the
 * collateral, no broker, and a fixed-term-free market. The list only has symbols, so the token
 * address is confirmed on-chain per candidate.
 */
export async function getEligibleMarkets(
  collateral: { address: string; symbol: string },
  user?: string,
): Promise<EligibleMarket[]> {
  const token = getAddress(collateral.address);
  const who: Address = user ? getAddress(user) : DEAD_ADDRESS;
  const candidates = (await listBStockMarkets()).filter(
    (m) => m.collateralSymbol === collateral.symbol && m.termType === 0,
  );
  const checked = await Promise.all(
    candidates.map(async (m) => {
      const gate = await readMarketGate(m.id, token, who);
      const ok =
        gate.params.collateralToken.toLowerCase() === token.toLowerCase() &&
        gate.provider === ZERO_ADDRESS &&
        gate.broker === ZERO_ADDRESS &&
        gate.whitelisted;
      return ok ? { ...m, params: gate.params } : null;
    }),
  );
  return checked
    .filter((m): m is EligibleMarket => m !== null)
    .sort((a, b) => b.liquidityUsd - a.liquidityUsd);
}
