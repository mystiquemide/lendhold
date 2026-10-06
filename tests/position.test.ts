import { describe, expect, it, vi } from "vitest";

const MARKET = "0x" + "a".repeat(64);
const NVDAB = "0x02fca66c1d1afb4e2a7884261eb00f63598a7436";
const USD1 = "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d";
const OWNER = "0x40F93Eca205086b4ccbF722C871c2815c266550a";
const E18 = 10n ** 18n;
const now = Date.now();

vi.mock("@/lib/binance/rwa", () => ({
  listRwaTokens: async () => [{ address: NVDAB, symbol: "NVDAB", decimals: 18, ratio: 1 }],
  getMarketSession: async () => ({
    openState: true,
    marketStatus: "regular",
    reasonCode: null,
    nextCloseTime: now + 2 * 3600e3,
    nextOpenTime: now + 16 * 3600e3,
  }),
  getAssetStatus: async () => ({ openState: true, reasonCode: "TRADING", reasonMsg: null, nextOpenTime: null, nextCloseTime: null }),
}));

vi.mock("@/lib/lista/chain", () => ({
  getMarketParams: async (id: string) => {
    if (id !== MARKET) return { loanToken: USD1, collateralToken: "0x0000000000000000000000000000000000000001", oracle: "0x1", irm: "0x2", lltv: 75n * 10n ** 16n };
    return { loanToken: USD1, collateralToken: NVDAB, oracle: "0x1", irm: "0x2", lltv: 75n * 10n ** 16n };
  },
  // 1e6 shares per unit of debt, and a last update in the future so nothing accrues.
  getMarketState: async () => ({
    totalSupplyAssets: 2000n * E18,
    totalSupplyShares: 0n,
    totalBorrowAssets: 1000n * E18,
    totalBorrowShares: 1000n * E18 * 1_000_000n,
    lastUpdate: BigInt(Math.floor(now / 1000) + 3600),
    fee: 0n,
  }),
  getPosition: async () => ({ supplyShares: 0n, borrowShares: 15n * E18 * 1_000_000n, collateral: E18 / 10n }),
  erc20Decimals: async () => 18,
  // NVDAB at $240, USD1 at $1, 8-decimal oracle prices.
  peekPrice: async (_oracle: string, token: string) => (token === NVDAB ? 240n * 10n ** 8n : 10n ** 8n),
  borrowRatePerSecond: async () => 0n,
  aprFromRatePerSecond: () => 0,
}));

describe("getPositionView", () => {
  it("reads debt, risk, shares and sizing for a live loan", async () => {
    const { getPositionView } = await import("@/lib/engine/position");
    const v = await getPositionView(OWNER, MARKET);
    // 15 USD1 owed (rounded up by one wei), against 0.1 NVDAB worth $24.
    expect(v.debt).toBeGreaterThanOrEqual(15n * E18);
    expect(v.debt - 15n * E18).toBeLessThan(10n);
    expect(v.collateral.shares).toBeCloseTo(0.1);
    expect(v.risk.collateralUsd).toBeCloseTo(24);
    expect(v.risk.ltv).toBeCloseTo(0.625, 3);
    // Liquidation when debt reaches 75% of value: 15 / (0.1 * 0.75) = $200 a share.
    expect(v.risk.liquidationPricePerShare).toBeCloseTo(200, 3);
    expect(v.risk.cushion).toBeCloseTo(1 / 6, 3);
    expect(v.risk.health).toBe("watch");
  });

  it("passes the market close time through, so the loan screen and alerts see it", async () => {
    const { getPositionView } = await import("@/lib/engine/position");
    const v = await getPositionView(OWNER, MARKET);
    const n = v.sizing.notices.find((x) => x.code === "CLOSING_SOON");
    expect(n?.closesAt).toBe(now + 2 * 3600e3);
  });

  it("refuses a market whose collateral is not a bStock", async () => {
    const { getPositionView } = await import("@/lib/engine/position");
    await expect(getPositionView(OWNER, "0x" + "b".repeat(64))).rejects.toMatchObject({ code: "UNKNOWN_MARKET" });
  });
});
