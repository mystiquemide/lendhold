import { describe, expect, it } from "vitest";
import { computeSizing, type SizingInput } from "@/lib/engine/sizing";
import { computeRisk, healthFor, toUnits } from "@/lib/engine/risk";
import { borrowSharesToAssets, withRepayHeadroom } from "@/lib/engine/debt";

const E18 = 10n ** 18n;
const E6 = 10n ** 6n;

// 3 tokens at $100, loan price $1, LLTV 75%: value 300, max 225, safe(open) 135, safe(closed) 101.25.
const base: SizingInput = {
  collateralRaw: 3n * E18,
  collateralDecimals: 18,
  collateralPrice: 100n * 10n ** 8n,
  loanPrice: 10n ** 8n,
  loanDecimals: 18,
  lltv: 75n * 10n ** 16n,
  existingDebt: 0n,
  availableLiquidity: 1_000n * E18,
  session: { marketOpen: true, assetReasonCode: "TRADING" },
};

describe("computeSizing", () => {
  it("open market: max 225, safe 135", () => {
    const s = computeSizing(base);
    expect(s.collateralValueLoan).toBe(300n * E18);
    expect(s.maxBorrowTotal).toBe(225n * E18);
    expect(s.maxBorrowNew).toBe(225n * E18);
    expect(s.safeBorrowNew).toBe(135n * E18);
    expect(s.buffer).toBe(0.6);
    expect(s.notices).toEqual([]);
  });

  it("treats a null reason code like TRADING", () => {
    expect(computeSizing({ ...base, session: { marketOpen: true, assetReasonCode: null } }).buffer).toBe(0.6);
  });

  it("closed market: buffer 0.45, safe 101.25, notice with next open", () => {
    const s = computeSizing({
      ...base,
      session: { marketOpen: false, assetReasonCode: "TRADING", nextOpenTime: Date.UTC(2026, 9, 1, 13, 30) },
    });
    expect(s.buffer).toBe(0.45);
    expect(s.safeBorrowNew).toBe(10125n * 10n ** 16n);
    expect(s.maxBorrowNew).toBe(225n * E18);
    expect(s.notices).toHaveLength(1);
    expect(s.notices[0]).toMatchObject({ code: "MARKET_CLOSED", nextOpenTime: Date.UTC(2026, 9, 1, 13, 30) });
    expect(s.notices[0].message).toContain("2026-10-01T13:30:00.000Z");
  });

  it("paused asset: buffer 0.45 and a pause notice with the reason", () => {
    const s = computeSizing({
      ...base,
      session: { marketOpen: true, assetReasonCode: "CORPORATE_ACTION", reasonMsg: "cash_dividend" },
    });
    expect(s.buffer).toBe(0.45);
    expect(s.notices).toEqual([
      { code: "ASSET_PAUSED", message: "cash_dividend today: conversion paused, borrowing uses extra room" },
    ]);
  });

  it("earnings limit gets its own code", () => {
    const s = computeSizing({ ...base, session: { marketOpen: true, assetReasonCode: "ASSET_LIMITED", reasonMsg: "earnings" } });
    expect(s.notices[0].code).toBe("ASSET_LIMITED");
  });

  it("subtracts existing debt and floors at zero", () => {
    const s = computeSizing({ ...base, existingDebt: 25n * E18 });
    expect(s.maxBorrowNew).toBe(200n * E18);
    expect(s.safeBorrowNew).toBe(110n * E18);
    const over = computeSizing({ ...base, existingDebt: 400n * E18 });
    expect(over.maxBorrowNew).toBe(0n);
    expect(over.safeBorrowNew).toBe(0n);
  });

  it("caps by available liquidity", () => {
    const s = computeSizing({ ...base, availableLiquidity: 100n * E18 });
    expect(s.maxBorrowNew).toBe(100n * E18);
    expect(s.safeBorrowNew).toBe(100n * E18);
  });

  it("handles different decimals and a non-par loan price", () => {
    // 2 tokens (18 dec) at $200 -> $400; loan is a 6-decimal coin at $0.80 -> 500 units; max 375.
    const s = computeSizing({
      ...base,
      collateralRaw: 2n * E18,
      collateralPrice: 200n * 10n ** 8n,
      loanPrice: 80n * 10n ** 6n,
      loanDecimals: 6,
    });
    expect(s.collateralValueLoan).toBe(500n * E6);
    expect(s.maxBorrowTotal).toBe(375n * E6);
    expect(s.safeBorrowNew).toBe(225n * E6);
  });

  it("handles a 6-decimal collateral", () => {
    const s = computeSizing({ ...base, collateralRaw: 3n * E6, collateralDecimals: 6 });
    expect(s.collateralValueLoan).toBe(300n * E18);
  });
});

describe("computeRisk", () => {
  const r = {
    collateralRaw: 3n * E18,
    collateralDecimals: 18,
    ratio: 1,
    debtRaw: 100n * E18,
    loanDecimals: 18,
    collateralPrice: 100n * 10n ** 8n,
    loanPrice: 10n ** 8n,
    lltv: 75n * 10n ** 16n,
  };

  it("computes ltv, liquidation price and cushion", () => {
    const risk = computeRisk(r);
    expect(risk.ltv).toBeCloseTo(1 / 3, 10);
    expect(risk.liquidationPricePerToken).toBeCloseTo(100 / (3 * 0.75), 10);
    expect(risk.liquidationPricePerShare).toBeCloseTo(44.4444444444, 6);
    expect(risk.cushion).toBeCloseTo(1 - 44.4444444444 / 100, 6);
    expect(risk.health).toBe("safe");
  });

  it("divides by the share ratio for the per-share price", () => {
    expect(computeRisk({ ...r, ratio: 2 }).liquidationPricePerShare).toBeCloseTo(22.2222222222, 6);
  });

  it("labels watch and at_risk against LLTV", () => {
    expect(computeRisk({ ...r, debtRaw: 150n * E18 }).health).toBe("watch"); // ltv 0.5
    expect(computeRisk({ ...r, debtRaw: 200n * E18 }).health).toBe("at_risk"); // ltv 0.667 > 0.6375
    expect(healthFor(0.45, 0.75)).toBe("safe");
    expect(healthFor(0.6375, 0.75)).toBe("watch");
    expect(healthFor(0.64, 0.75)).toBe("at_risk");
  });

  it("zero debt is safe with no liquidation price", () => {
    const risk = computeRisk({ ...r, debtRaw: 0n });
    expect(risk).toMatchObject({ health: "safe", liquidationPricePerToken: null, cushion: null, ltv: 0 });
  });

  it("debt with no collateral is at risk", () => {
    expect(computeRisk({ ...r, collateralRaw: 0n }).health).toBe("at_risk");
  });

  it("converts raw units for display", () => {
    expect(toUnits(1_500_000n, 6)).toBe(1.5);
    expect(toUnits(3n * E18 + E18 / 2n, 18)).toBe(3.5);
  });
});

describe("debt shares", () => {
  const state = {
    totalSupplyAssets: 0n,
    totalSupplyShares: 0n,
    totalBorrowAssets: 1_000n * E18,
    totalBorrowShares: 1_000n * E18 * 1_000_000n,
    lastUpdate: 100n,
    fee: 0n,
  };
  it("rounds up with virtual shares and assets", () => {
    // 1e26 * (1e21 + 1) / (1e27 + 1e6) = 1e26 / 1e6 = 1e20 exactly
    expect(borrowSharesToAssets((1_000n * E18 * 1_000_000n) / 10n, state)).toBe(100n * E18);
    // one extra share unit pushes the quotient just past 1e20 and rounds up
    expect(borrowSharesToAssets((1_000n * E18 * 1_000_000n) / 10n + 1n, state)).toBe(100n * E18 + 1n);
    expect(borrowSharesToAssets(0n, state)).toBe(0n);
  });
  it("accrues linearly with a per-second rate", () => {
    const rate = E18 / 1_000_000n; // 1e-6 per second
    const accrued = borrowSharesToAssets(state.totalBorrowShares, state, { ratePerSecond: rate, nowSec: 100n + 1000n });
    // 1000 seconds at 1e-6 = 0.1% more assets
    expect(accrued).toBeGreaterThan(1_000n * E18);
    expect(accrued).toBeLessThanOrEqual(1_001n * E18 + 2n);
  });
  it("adds 0.5% headroom for full repay approvals", () => {
    expect(withRepayHeadroom(1_000n)).toBe(1_006n);
  });
});
