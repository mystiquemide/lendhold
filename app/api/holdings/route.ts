import { z } from "zod";
import { handle, json, parseQuery } from "@/lib/api";
import { getHoldings } from "@/lib/engine/holdings";
import { evmAddress } from "@/lib/schema";

export const dynamic = "force-dynamic";

const query = z.object({ address: evmAddress });

export const GET = handle(async (req) => {
  const { address } = parseQuery(req, query);
  return json({ address, holdings: await getHoldings(address) });
});
