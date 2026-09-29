import { z } from "zod";
import { handle, json, parseQuery } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { loadChainStates, selectMarket } from "@/lib/engine/market-select";
import { findStockToken } from "@/lib/engine/tokens";
import { aprFromRatePerSecond, borrowRatePerSecond } from "@/lib/lista/chain";
import { getEligibleMarkets } from "@/lib/lista/markets";
import { evmAddress } from "@/lib/schema";

export const dynamic = "force-dynamic";

const query = z.object({ collateral: evmAddress, user: evmAddress.optional() });

export const GET = handle(async (req) => {
  const { collateral, user } = parseQuery(req, query);
  const token = await findStockToken(collateral);
  if (!token || token.platformId !== "bstock") {
    throw new AppError("UNKNOWN_TOKEN", "Markets exist for bStock tokens only", 404);
  }
  const eligible = await getEligibleMarkets({ address: token.address, symbol: token.symbol }, user);
  const chain = await loadChainStates(eligible);
  const selected = selectMarket(eligible, chain);
  const markets = await Promise.all(
    eligible.map(async (m) => {
      const c = chain.get(m.id)!;
      const rate = await borrowRatePerSecond(m.params, c.state);
      return {
        id: m.id,
        loanSymbol: m.loanSymbol,
        loanToken: m.params.loanToken,
        lltv: m.lltv,
        availableLoan: c.availableLoan,
        availableUsd: c.availableUsd,
        loanDecimals: c.loanDecimals,
        aprPct: aprFromRatePerSecond(rate) * 100,
      };
    }),
  );
  return json({
    collateral: { address: token.address, symbol: token.symbol },
    selectedId: selected?.id ?? null,
    markets,
  });
});
