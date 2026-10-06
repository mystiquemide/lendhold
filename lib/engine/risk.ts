export type Health = "safe" | "watch" | "at_risk";

export interface RiskInput {
  collateralRaw: bigint;
  collateralDecimals: number;
  /** Shares per token. */
  ratio: number;
  debtRaw: bigint;
  loanDecimals: number;
  /** 8-decimal USD prices. */
  collateralPrice: bigint;
  loanPrice: bigint;
  /** 1e18 scale. */
  lltv: bigint;
}

export interface Risk {
  collateralUsd: number;
  debtUsd: number;
  ltv: number;
  lltv: number;
  liquidationPricePerToken: number | null;
  liquidationPricePerShare: number | null;
  /** 1 - liquidationPrice / currentPrice, as a fraction. Null when there is no debt. */
  cushion: number | null;
  health: Health;
}

const PRICE_SCALE = 1e8;

/** Number conversion of a raw amount, for display fields and ratios only. */
export function toUnits(raw: bigint, decimals: number): number {
  const whole = raw / 10n ** BigInt(decimals);
  const frac = raw % 10n ** BigInt(decimals);
  return Number(whole) + Number(frac) / 10 ** decimals;
}

export function healthFor(ltv: number, lltv: number): Health {
  const eps = 1e-12;
  if (ltv <= 0.6 * lltv + eps) return "safe";
  if (ltv <= 0.85 * lltv + eps) return "watch";
  return "at_risk";
}

export function computeRisk(input: RiskInput): Risk {
  const lltv = Number(input.lltv) / 1e18;
  const tokens = toUnits(input.collateralRaw, input.collateralDecimals);
  const price = Number(input.collateralPrice) / PRICE_SCALE;
  const debtUsd = toUnits(input.debtRaw, input.loanDecimals) * (Number(input.loanPrice) / PRICE_SCALE);
  const collateralUsd = tokens * price;

  if (input.debtRaw === 0n) {
    return {
      collateralUsd,
      debtUsd: 0,
      ltv: 0,
      lltv,
      liquidationPricePerToken: null,
      liquidationPricePerShare: null,
      cushion: null,
      health: "safe",
    };
  }
  if (tokens === 0 || price === 0) {
    return {
      collateralUsd,
      debtUsd,
      ltv: Number.POSITIVE_INFINITY,
      lltv,
      liquidationPricePerToken: null,
      liquidationPricePerShare: null,
      cushion: null,
      health: "at_risk",
    };
  }
  const ltv = debtUsd / collateralUsd;
  const liqToken = debtUsd / (tokens * lltv);
  return {
    collateralUsd,
    debtUsd,
    ltv,
    lltv,
    liquidationPricePerToken: liqToken,
    liquidationPricePerShare: liqToken / input.ratio,
    cushion: 1 - liqToken / price,
    health: healthFor(ltv, lltv),
  };
}

/**
 * What brings a loan back to "safe" (LTV at or under 60% of LLTV): repay this much debt in USD,
 * or add this many shares at the current price. Null when the loan is already safe.
 */
export function backToSafe(
  risk: Pick<Risk, "collateralUsd" | "debtUsd" | "lltv" | "health">,
  pricePerShare: number,
): { repayUsd: number; addShares: number } | null {
  if (risk.health === "safe" || risk.debtUsd <= 0 || pricePerShare <= 0) return null;
  const limit = 0.6 * risk.lltv;
  return {
    repayUsd: Math.max(0, risk.debtUsd - limit * risk.collateralUsd),
    addShares: Math.max(0, risk.debtUsd / limit - risk.collateralUsd) / pricePerShare,
  };
}

/** Per-share price at which the loan turns from safe to watch (LTV reaches 60% of LLTV). */
export function watchPricePerShare(
  risk: Pick<Risk, "debtUsd" | "lltv" | "liquidationPricePerShare">,
): number | null {
  return risk.liquidationPricePerShare === null || risk.debtUsd <= 0 ? null : risk.liquidationPricePerShare / 0.6;
}
