import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAddress } from "viem";
import { NVDAB, NVDAON, USER } from "./helpers";

const m = vi.hoisted(() => ({
  getBalances: vi.fn(),
  listRwaTokens: vi.fn(),
  listXStocksPublic: vi.fn(),
  getRwaPrices: vi.fn(),
  erc20Decimals: vi.fn(),
  getEligibleMarkets: vi.fn(),
  loadChainStates: vi.fn(),
}));
vi.mock("@/lib/binance/wallet", () => ({ getBalances: (...a: unknown[]) => m.getBalances(...a) }));
vi.mock("@/lib/binance/rwa", () => ({
  listRwaTokens: (...a: unknown[]) => m.listRwaTokens(...a),
  listXStocksPublic: (...a: unknown[]) => m.listXStocksPublic(...a),
  getRwaPrices: (...a: unknown[]) => m.getRwaPrices(...a),
}));
vi.mock("@/lib/lista/chain", () => ({ erc20Decimals: (...a: unknown[]) => m.erc20Decimals(...a) }));
vi.mock("@/lib/lista/markets", () => ({ getEligibleMarkets: (...a: unknown[]) => m.getEligibleMarkets(...a) }));
vi.mock("@/lib/engine/market-select", () => ({ loadChainStates: (...a: unknown[]) => m.loadChainStates(...a) }));

import { getHoldings, NO_ROOM } from "@/lib/engine/holdings";

const XSTOCK = "0x3333333333333333333333333333333333333333";
const E18 = 10n ** 18n;
const bstock = { address: getAddress(NVDAB), symbol: "NVDAB", name: "n", platformId: "bstock", ticker: "NVDA", decimals: 18, ratio: 1, logoUrl: null };
const ondo = { address: getAddress(NVDAON), symbol: "NVDAon", name: "n", platformId: "ondo", ticker: "NVDA", decimals: 18, ratio: 1.002, logoUrl: null };
const bal = (address: string, amount: bigint, symbol = "X") => ({ address: getAddress(address), symbol, decimals: 5, amount, amountFormatted: "0", usdValue: null });

beforeEach(() => {
  vi.resetAllMocks();
  m.listRwaTokens.mockImplementation(async (p: string) => (p === "ondo" ? [ondo] : [bstock]));
  m.listXStocksPublic.mockResolvedValue([{ address: getAddress(XSTOCK), symbol: "TSLAx", ticker: "TSLA", ratio: 1.01 }]);
  m.getRwaPrices.mockImplementation(async (addrs: string[]) => new Map(addrs.map((a) => [a.toLowerCase(), { tokenPrice: 228, referencePrice: 227, updatedAt: 1 }])));
  m.erc20Decimals.mockResolvedValue(8);
  m.getEligibleMarkets.mockResolvedValue([{ id: "0xaa" }]);
  m.loadChainStates.mockResolvedValue(new Map([["0xaa", { availableLoan: 5n }]]));
});

describe("getHoldings", () => {
  it("ignores non-stock and zero balances", async () => {
    m.getBalances.mockResolvedValue([bal("0x4444444444444444444444444444444444444444", 5n, "JUNK"), bal(NVDAB, 0n, "NVDAB")]);
    expect(await getHoldings(USER)).toEqual([]);
  });

  it("marks a bStock with room ready, using list decimals and ratio, not balance decimals", async () => {
    m.getBalances.mockResolvedValue([bal(NVDAB, 3n * E18, "NVDAB")]);
    const [h] = await getHoldings(USER);
    expect(h).toMatchObject({ symbol: "NVDAB", platform: "bstock", decimals: 18, ratio: 1, status: "ready", amount: 3n * E18, perSharePrice: 227 });
    expect(h.shares).toBe(3);
    expect(h.valueUsd).toBe(684);
    expect(m.getEligibleMarkets).toHaveBeenCalledWith({ address: getAddress(NVDAB), symbol: "NVDAB" }, USER);
  });

  it("marks a bStock unsupported when there is no market or no liquidity", async () => {
    m.getBalances.mockResolvedValue([bal(NVDAB, E18, "NVDAB")]);
    m.getEligibleMarkets.mockResolvedValue([]);
    expect((await getHoldings(USER))[0]).toMatchObject({ status: "unsupported", reason: NO_ROOM });
    m.getEligibleMarkets.mockResolvedValue([{ id: "0xaa" }]);
    m.loadChainStates.mockResolvedValue(new Map([["0xaa", { availableLoan: 0n }]]));
    expect((await getHoldings(USER))[0]).toMatchObject({ status: "unsupported", reason: NO_ROOM });
  });

  it("marks an Ondo token convert when the matching bStock has room, and attaches it", async () => {
    m.getBalances.mockResolvedValue([bal(NVDAON, 2n * E18, "NVDAon")]);
    const [h] = await getHoldings(USER);
    expect(h).toMatchObject({ platform: "ondo", status: "convert", matchingBStock: { address: getAddress(NVDAB), symbol: "NVDAB" } });
    expect(h.shares).toBeCloseTo(2.004, 9);
    expect(m.getEligibleMarkets).toHaveBeenCalledWith({ address: getAddress(NVDAB), symbol: "NVDAB" }, USER);
  });

  it("marks an Ondo token unsupported without a matching bStock or without room", async () => {
    m.getBalances.mockResolvedValue([bal(NVDAON, E18, "NVDAon")]);
    m.listRwaTokens.mockImplementation(async (p: string) => (p === "ondo" ? [ondo] : []));
    expect((await getHoldings(USER))[0]).toMatchObject({ status: "unsupported" });
    m.listRwaTokens.mockImplementation(async (p: string) => (p === "ondo" ? [ondo] : [bstock]));
    m.getEligibleMarkets.mockResolvedValue([]);
    const [h] = await getHoldings(USER);
    expect(h).toMatchObject({ status: "unsupported", reason: NO_ROOM, matchingBStock: { symbol: "NVDAB" } });
  });

  it("shows xStocks as unsupported with on-chain decimals", async () => {
    m.getBalances.mockResolvedValue([bal(XSTOCK, 25_000_000n, "TSLAx")]);
    const [h] = await getHoldings(USER);
    expect(h).toMatchObject({ platform: "xstocks", status: "unsupported", reason: "Not supported on BSC yet", decimals: 8, ratio: 1.01 });
    expect(h.shares).toBeCloseTo(0.25 * 1.01, 9);
  });
});

describe("cleanTokenName", () => {
  it("drops the issuer suffix", async () => {
    const { cleanTokenName } = await import("@/lib/engine/holdings");
    expect(cleanTokenName("NVIDIA (bStocks)")).toBe("NVIDIA");
    expect(cleanTokenName("Vicor (Ondo Tokenized)")).toBe("Vicor");
    expect(cleanTokenName("Plain")).toBe("Plain");
  });
});
