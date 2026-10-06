import { describe, expect, it } from "vitest";
import { summarizePortfolio, type PortfolioLoan } from "@/lib/engine/portfolio";

const loan = (marketId: string, collateralUsd: number, debtUsd: number, cushion: number | null, aprPct: number, health: PortfolioLoan["risk"]["health"] = "safe"): PortfolioLoan => ({
  marketId,
  ticker: marketId.toUpperCase(),
  aprPct,
  risk: { collateralUsd, debtUsd, cushion, health },
});

describe("summarizePortfolio", () => {
  it("totals loans, weights APR by debt and flags the thinnest cushion", () => {
    const p = summarizePortfolio([
      loan("nvda", 300, 100, 0.55, 2),
      loan("tsla", 100, 50, 0.33, 5, "watch"),
      loan("spy", 200, 0, null, 9),
    ]);
    expect(p.loans).toBe(3);
    expect(p.collateralUsd).toBe(600);
    expect(p.debtUsd).toBe(150);
    expect(p.ltv).toBeCloseTo(0.25);
    expect(p.aprPct).toBeCloseTo(3);
    expect(p.weakest).toEqual({ marketId: "tsla", ticker: "TSLA", cushion: 0.33, health: "watch" });
    expect(p.health).toBe("watch");
  });

  it("collateral only: no APR, no weakest loan", () => {
    const p = summarizePortfolio([loan("spy", 200, 0, null, 9)]);
    expect(p.aprPct).toBeNull();
    expect(p.weakest).toBeNull();
    expect(p.health).toBeNull();
  });
});
