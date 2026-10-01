import "server-only";
import { getAddress } from "viem";
import { getPosition } from "@/lib/lista/chain";
import { listBStockMarkets } from "@/lib/lista/markets";
import { getPositionView, type PositionView } from "./position";

/** Every bStock market where the wallet has collateral or debt, as full position views. */
export async function listPositions(address: string): Promise<PositionView[]> {
  const owner = getAddress(address);
  const markets = await listBStockMarkets();
  const raw = await Promise.all(markets.map(async (m) => ({ id: m.id, pos: await getPosition(m.id, owner) })));
  const open = raw.filter(({ pos }) => pos.collateral > 0n || pos.borrowShares > 0n);
  return Promise.all(open.map(({ id }) => getPositionView(owner, id)));
}
