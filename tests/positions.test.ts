import { describe, expect, it, vi } from "vitest";

const A = "0x" + "a".repeat(64);
const B = "0x" + "b".repeat(64);
const C = "0x" + "c".repeat(64);

vi.mock("@/lib/lista/markets", () => ({
  listBStockMarkets: async () => [{ id: A, loanSymbol: "USD1" }, { id: B, loanSymbol: "USDT" }, { id: C, loanSymbol: "U" }],
}));
vi.mock("@/lib/lista/chain", () => ({
  getPosition: async (id: string) =>
    id === A
      ? { supplyShares: 0n, borrowShares: 5n, collateral: 10n }
      : id === B
        ? { supplyShares: 0n, borrowShares: 0n, collateral: 0n }
        : { supplyShares: 0n, borrowShares: 0n, collateral: 3n },
}));
vi.mock("@/lib/engine/position", () => ({
  getPositionView: async (_owner: string, id: string) => ({ marketId: id, collateral: { address: "0xT", symbol: "NVDAB" } }),
}));
vi.mock("@/lib/binance/rwa", () => ({
  listRwaTokens: async () => [{ address: "0xT", name: "NVIDIA (bStocks)", ticker: "NVDA", logoUrl: null }],
}));

describe("listPositions", () => {
  it("returns only markets with collateral or debt", async () => {
    const { listPositions } = await import("@/lib/engine/positions");
    const out = await listPositions("0x40F93Eca205086b4ccbF722C871c2815c266550a");
    expect(out.map((p) => p.marketId)).toEqual([A, C]);
    expect(out[0]).toMatchObject({ loanSymbol: "USD1", name: "NVIDIA", ticker: "NVDA" });
  });
});
