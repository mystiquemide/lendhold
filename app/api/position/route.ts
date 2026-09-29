import { z } from "zod";
import { handle, json, parseQuery } from "@/lib/api";
import { getPositionView } from "@/lib/engine/position";
import { evmAddress } from "@/lib/schema";

export const dynamic = "force-dynamic";

const query = z.object({
  address: evmAddress,
  market: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "market must be a bytes32 id"),
});

export const GET = handle(async (req) => {
  const { address, market } = parseQuery(req, query);
  return json(await getPositionView(address, market));
});
