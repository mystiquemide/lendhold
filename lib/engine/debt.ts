import type { MarketState } from "@/lib/lista/chain";

const VIRTUAL_SHARES = 1_000_000n;
const VIRTUAL_ASSETS = 1n;
const WAD = 10n ** 18n;

/** Moolah `SharesMathLib.toAssetsUp` on the market totals, optionally accrued to `nowSec` with a per-second rate. */
export function borrowSharesToAssets(
  shares: bigint,
  state: MarketState,
  accrual?: { ratePerSecond: bigint; nowSec: bigint },
): bigint {
  let totalAssets = state.totalBorrowAssets;
  if (accrual && accrual.nowSec > state.lastUpdate) {
    const dt = accrual.nowSec - state.lastUpdate;
    totalAssets += (totalAssets * accrual.ratePerSecond * dt) / WAD;
  }
  const num = shares * (totalAssets + VIRTUAL_ASSETS);
  const den = state.totalBorrowShares + VIRTUAL_SHARES;
  return (num + den - 1n) / den;
}

/** Headroom on an approve for a full repay, since interest keeps accruing until the transaction lands. */
export function withRepayHeadroom(debt: bigint): bigint {
  return debt + debt / 200n + 1n;
}
