import { z } from "zod";
import { handle, json, parseQuery } from "@/lib/api";
import { listPositions } from "@/lib/engine/positions";
import { evmAddress } from "@/lib/schema";

export const dynamic = "force-dynamic";

const query = z.object({ address: evmAddress });

export const GET = handle(async (req) => {
  const { address } = parseQuery(req, query);
  return json({ address, positions: await listPositions(address) });
});
