import "server-only";
import { getAddress } from "viem";
import { getPosition } from "@/lib/lista/chain";
import { listBStockMarkets } from "@/lib/lista/markets";
import { listRwaTokens } from "@/lib/binance/rwa";
import { cleanTokenName } from "./holdings";
import { getPositionView, type PositionView } from "./position";

export interface PositionSummary extends PositionView {
  loanSymbol: string;
  name: string;
  ticker: string;
  logoUrl: string | null;
}

/** Every bStock market where the wallet has collateral or debt, as full position views. */
export async function listPositions(address: string): Promise<PositionSummary[]> {
  const owner = getAddress(address);
  const markets = await listBStockMarkets();
  const raw = await Promise.all(markets.map(async (m) => ({ id: m.id, pos: await getPosition(m.id, owner) })));
  const open = raw.filter(({ pos }) => pos.collateral > 0n || pos.borrowShares > 0n);
  if (open.length === 0) return [];
  const loanById = new Map(markets.map((m) => [m.id, m.loanSymbol]));
  const bstocks = await listRwaTokens("bstock");
  return Promise.all(
    open.map(async ({ id }) => {
      const view = await getPositionView(owner, id);
      const token = bstocks.find((t) => t.address === view.collateral.address);
      return {
        ...view,
        loanSymbol: loanById.get(id) ?? "",
        name: token ? cleanTokenName(token.name) : view.collateral.symbol,
        ticker: token?.ticker ?? view.collateral.symbol,
        logoUrl: token?.logoUrl ?? null,
      };
    }),
  );
}
