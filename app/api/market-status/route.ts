import { z } from "zod";
import { handle, json, parseQuery } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { getAssetStatus, getMarketSession, getRwaPrices } from "@/lib/binance/rwa";
import { findStockToken } from "@/lib/engine/tokens";
import { evmAddress } from "@/lib/schema";

export const dynamic = "force-dynamic";

const query = z.object({ token: evmAddress });

export const GET = handle(async (req) => {
  const { token } = parseQuery(req, query);
  const stock = await findStockToken(token);
  if (!stock) throw new AppError("UNKNOWN_TOKEN", "That token is not a supported stock token", 404);
  const [session, asset, prices] = await Promise.all([
    getMarketSession(),
    getAssetStatus(stock.address),
    getRwaPrices([stock.address]),
  ]);
  const price = prices.get(stock.address.toLowerCase());
  return json({
    token: stock.address,
    symbol: stock.symbol,
    session,
    asset,
    price: price
      ? {
          /** USD per share of the underlying stock. */
          perShare: price.referencePrice,
          /** USD per token: per-share price times shares per token. */
          perToken: price.referencePrice === null ? price.tokenPrice : price.referencePrice * stock.ratio,
          updatedAt: price.updatedAt,
        }
      : null,
  });
});
