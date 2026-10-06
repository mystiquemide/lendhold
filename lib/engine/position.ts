import "server-only";
import { getAddress, type Address, type Hex } from "viem";
import { AppError } from "@/lib/errors";
import { getAssetStatus, getMarketSession, listRwaTokens } from "@/lib/binance/rwa";
import {
  aprFromRatePerSecond,
  borrowRatePerSecond,
  erc20Decimals,
  getMarketParams,
  getMarketState,
  getPosition,
  peekPrice,
  type MarketParams,
} from "@/lib/lista/chain";
import { availableLiquidity } from "./market-select";
import { borrowSharesToAssets } from "./debt";
import { computeRisk, toUnits, type Risk } from "./risk";
import { computeSizing, type Sizing } from "./sizing";

export interface PositionView {
  marketId: Hex;
  params: MarketParams;
  collateral: { address: Address; symbol: string; decimals: number; amount: bigint; shares: number };
  loan: { address: Address; decimals: number };
  debt: bigint;
  aprPct: number;
  risk: Risk;
  sizing: Sizing;
}

export async function getPositionView(address: string, marketId: string): Promise<PositionView> {
  const owner = getAddress(address);
  const id = marketId.toLowerCase() as Hex;
  const params = await getMarketParams(id);
  const bstock = (await listRwaTokens("bstock")).find((t) => t.address === params.collateralToken);
  if (!bstock) throw new AppError("UNKNOWN_MARKET", "That market is not a bStock market", 404);

  const [state, position, loanDecimals, pc, pl, session, asset] = await Promise.all([
    getMarketState(id),
    getPosition(id, owner),
    erc20Decimals(params.loanToken),
    peekPrice(params.oracle, params.collateralToken),
    peekPrice(params.oracle, params.loanToken),
    getMarketSession(),
    getAssetStatus(bstock.address),
  ]);
  const rate = await borrowRatePerSecond(params, state);
  const debt = borrowSharesToAssets(position.borrowShares, state, {
    ratePerSecond: rate,
    nowSec: BigInt(Math.floor(Date.now() / 1000)),
  });
  const risk = computeRisk({
    collateralRaw: position.collateral,
    collateralDecimals: bstock.decimals,
    ratio: bstock.ratio,
    debtRaw: debt,
    loanDecimals,
    collateralPrice: pc,
    loanPrice: pl,
    lltv: params.lltv,
  });
  const sizing = computeSizing({
    collateralRaw: position.collateral,
    collateralDecimals: bstock.decimals,
    collateralPrice: pc,
    loanPrice: pl,
    loanDecimals,
    lltv: params.lltv,
    existingDebt: debt,
    availableLiquidity: availableLiquidity(state),
    session: {
      marketOpen: (asset.openState ?? session.openState) === true,
      assetReasonCode: asset.reasonCode,
      reasonMsg: asset.reasonMsg,
      nextOpenTime: asset.nextOpenTime ?? session.nextOpenTime,
      nextCloseTime: asset.nextCloseTime ?? session.nextCloseTime,
    },
  });
  return {
    marketId: id,
    params,
    collateral: {
      address: bstock.address as Address,
      symbol: bstock.symbol,
      decimals: bstock.decimals,
      amount: position.collateral,
      shares: toUnits(position.collateral, bstock.decimals) * bstock.ratio,
    },
    loan: { address: params.loanToken, decimals: loanDecimals },
    debt,
    aprPct: aprFromRatePerSecond(rate) * 100,
    risk,
    sizing,
  };
}
