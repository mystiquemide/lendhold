import { z } from "zod";
import { getAddress } from "viem";
import { handle, json, parseQuery } from "@/lib/api";
import { erc20Balance, erc20Decimals } from "@/lib/lista/chain";
import { evmAddress } from "@/lib/schema";

export const dynamic = "force-dynamic";

const query = z.object({ address: evmAddress, token: evmAddress });

/** One ERC-20 balance, for the repay and buy screens. */
export const GET = handle(async (req) => {
  const { address, token } = parseQuery(req, query);
  const [owner, asset] = [getAddress(address), getAddress(token)];
  const [amount, decimals] = await Promise.all([erc20Balance(asset, owner), erc20Decimals(asset)]);
  return json({ address: owner, token: asset, amount, decimals });
});
