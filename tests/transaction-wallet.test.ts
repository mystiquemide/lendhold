import { beforeEach, describe, expect, it, vi } from "vitest";
import { NVDAB, USER, respond } from "./helpers";

const api = {
  simulateTransactions: vi.fn(),
  getGasPrice: vi.fn(),
  getAllTokenBalancesByAddress: vi.fn(),
};
vi.mock("@/lib/binance/client", () => ({ getBinance: () => api }));

import { getGasPrice, simulate } from "@/lib/binance/transaction";
import { getBalances } from "@/lib/binance/wallet";

beforeEach(() => vi.resetAllMocks());

describe("simulate", () => {
  it("reports success and omits solTx/tronTx from the serialized body", async () => {
    api.simulateTransactions.mockReturnValue(
      respond({ status: "SUCCESS", failReason: "", balanceChanges: [], allowanceChanges: [] }),
    );
    const r = await simulate({ from: USER, to: NVDAB, data: "0x095ea7b3" });
    expect(r.ok).toBe(true);
    const body = api.simulateTransactions.mock.calls[0][0];
    expect(body.evmTx).toEqual({ from: USER, to: NVDAB, value: "0", data: "0x095ea7b3" });
    expect(JSON.parse(JSON.stringify(body))).toEqual({ binanceChainId: "56", evmTx: body.evmTx });
  });

  it("reports failure with the revert reason", async () => {
    api.simulateTransactions.mockReturnValue(respond({ status: "FAILED", failReason: "execution reverted" }));
    const r = await simulate({ from: USER, to: NVDAB, data: "0x", value: 1n });
    expect(r).toMatchObject({ ok: false, revertReason: "execution reverted" });
    expect(api.simulateTransactions.mock.calls[0][0].evmTx.value).toBe("1");
  });
});

describe("getGasPrice", () => {
  it("returns the medium legacy price in wei", async () => {
    api.getGasPrice.mockReturnValue(
      respond({ evmLegacyGasPrice: { lowGasPrice: "1", mediumGasPrice: "59322489", highGasPrice: "9" }, eip1559GasPrice: null }),
    );
    expect(await getGasPrice()).toBe(59322489n);
  });
});

describe("getBalances", () => {
  const asset = (over: Record<string, unknown>) => ({
    tokenContractAddress: NVDAB.toLowerCase(),
    symbol: "NVDAB",
    balance: "0.336780006652509485",
    rawBalance: "336780006652509485",
    tokenPrice: "228.1",
    ...over,
  });

  it("maps balances, infers decimals and computes usd value", async () => {
    api.getAllTokenBalancesByAddress.mockReturnValue(
      respond([
        {
          page: 1,
          tokenAssets: [
            asset({}),
            asset({ tokenContractAddress: "0x004CAfD0C9755039970222044264A3281d67DDf2", symbol: "SIREN", balance: "11716.0", rawBalance: "11716000000000", tokenPrice: "" }),
          ],
        },
      ]),
    );
    const out = await getBalances(USER);
    expect(api.getAllTokenBalancesByAddress).toHaveBeenCalledWith({ address: USER, chains: "56", page: 1, pageSize: 100 });
    expect(out[0]).toMatchObject({ address: NVDAB, symbol: "NVDAB", decimals: 18, amount: 336780006652509485n, amountFormatted: "0.336780006652509485" });
    expect(out[0].usdValue).toBeCloseTo(0.3367 * 228.1, 1);
    expect(out[1]).toMatchObject({ symbol: "SIREN", decimals: 9, usdValue: null, amountFormatted: "11716" });
  });

  it("keeps a token that comes back without a symbol instead of failing the whole wallet", async () => {
    api.getAllTokenBalancesByAddress.mockReturnValue(respond([{ page: 1, tokenAssets: [asset({}), asset({ symbol: null })] }]));
    const out = await getBalances(USER);
    expect(out).toHaveLength(2);
    expect(out[1].symbol).toBe("");
  });

  it("pages until a short page", async () => {
    const full = Array.from({ length: 100 }, (_, i) =>
      asset({ tokenContractAddress: `0x${(i + 1).toString(16).padStart(40, "0")}` }),
    );
    api.getAllTokenBalancesByAddress
      .mockReturnValueOnce(respond([{ tokenAssets: full }]))
      .mockReturnValueOnce(respond([{ tokenAssets: [asset({})] }]));
    expect(await getBalances(USER)).toHaveLength(101);
    expect(api.getAllTokenBalancesByAddress).toHaveBeenCalledTimes(2);
  });
});
