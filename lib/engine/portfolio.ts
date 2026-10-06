import type { Health } from "./risk";

export interface PortfolioLoan {
  marketId: string;
  ticker: string;
  aprPct: number;
  risk: { collateralUsd: number; debtUsd: number; cushion: number | null; health: Health };
}

export interface Portfolio {
  loans: number;
  collateralUsd: number;
  debtUsd: number;
  /** Total debt over total collateral. Each Lista market is liquidated on its own, so this is a summary only. */
  ltv: number;
  /** Debt-weighted borrow APR, in percent. Null without debt. */
  aprPct: number | null;
  /** The loan closest to liquidation, by cushion. Null without debt. */
  weakest: { marketId: string; ticker: string; cushion: number; health: Health } | null;
  health: Health | null;
}

const RANK: Record<Health, number> = { safe: 0, watch: 1, at_risk: 2 };

export function summarizePortfolio(loans: PortfolioLoan[]): Portfolio {
  let collateralUsd = 0;
  let debtUsd = 0;
  let aprWeighted = 0;
  let weakest: Portfolio["weakest"] = null;
  let health: Health | null = null;
  for (const l of loans) {
    collateralUsd += l.risk.collateralUsd;
    debtUsd += l.risk.debtUsd;
    aprWeighted += l.aprPct * l.risk.debtUsd;
    if (l.risk.debtUsd > 0 && l.risk.cushion !== null) {
      if (!weakest || l.risk.cushion < weakest.cushion) {
        weakest = { marketId: l.marketId, ticker: l.ticker, cushion: l.risk.cushion, health: l.risk.health };
      }
      if (health === null || RANK[l.risk.health] > RANK[health]) health = l.risk.health;
    }
  }
  return {
    loans: loans.length,
    collateralUsd,
    debtUsd,
    ltv: collateralUsd > 0 ? debtUsd / collateralUsd : 0,
    aprPct: debtUsd > 0 ? aprWeighted / debtUsd : null,
    weakest,
    health,
  };
}
