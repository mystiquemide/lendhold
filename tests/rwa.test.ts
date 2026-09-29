import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAddress } from "viem";
import { NVDAB, NVDAON, respond } from "./helpers";

const api = {
  getRwaTokenList: vi.fn(),
  getRwaTokenPrice: vi.fn(),
  getRwaUnderlyingMarketData: vi.fn(),
};
vi.mock("@/lib/binance/client", () => ({ getBinance: () => api }));

import { clearCache } from "@/lib/cache";
import {
  getAssetStatus,
  getMarketSession,
  getRwaPrices,
  listRwaTokens,
  listXStocksPublic,
} from "@/lib/binance/rwa";

beforeEach(() => {
  clearCache();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

describe("listRwaTokens", () => {
  const row = {
    tokenContractAddress: NVDAB.toLowerCase(),
    tokenSymbol: "NVDAB",
    tokenName: "NVIDIA (bStocks)",
    platformId: "bstock",
    underlyingTicker: "NVDA",
    decimals: "18",
    tokenToShareRatio: "1.000000000000000000",
    tokenLogoUrl: null,
  };

  it("maps rows, checksums addresses and caches for 60s", async () => {
    api.getRwaTokenList.mockReturnValue(respond([row]));
    const first = await listRwaTokens("bstock");
    await listRwaTokens("bstock");
    expect(api.getRwaTokenList).toHaveBeenCalledTimes(1);
    expect(api.getRwaTokenList).toHaveBeenCalledWith({ binanceChainId: "56", platformId: "bstock" });
    expect(first).toEqual([
      {
        address: NVDAB,
        symbol: "NVDAB",
        name: "NVIDIA (bStocks)",
        platformId: "bstock",
        ticker: "NVDA",
        decimals: 18,
        ratio: 1,
        logoUrl: null,
      },
    ]);
  });

  it("rejects malformed rows", async () => {
    api.getRwaTokenList.mockReturnValue(respond([{ ...row, decimals: "abc" }]));
    await expect(listRwaTokens("bstock")).rejects.toThrow(/unexpected response shape/);
  });
});

describe("getRwaPrices", () => {
  it("chunks by 10 and keys results by lowercase address", async () => {
    const addrs = Array.from({ length: 25 }, (_, i) => `0x${(i + 1).toString(16).padStart(40, "0")}`);
    api.getRwaTokenPrice.mockImplementation(({ tokenContractAddresses }: { tokenContractAddresses: string }) =>
      respond(
        tokenContractAddresses.split(",").map((a) => ({
          tokenContractAddress: a,
          tokenPrice: "228.21",
          referencePrice: null,
          tokenPriceUpdatedAt: 1790720901629,
        })),
      ),
    );
    const out = await getRwaPrices(addrs);
    expect(api.getRwaTokenPrice).toHaveBeenCalledTimes(3);
    expect(out.size).toBe(25);
    expect(out.get(addrs[0])).toEqual({ tokenPrice: 228.21, referencePrice: null, updatedAt: 1790720901629 });
  });
});

describe("getAssetStatus", () => {
  it("returns statusInfo with nullable fields", async () => {
    api.getRwaUnderlyingMarketData.mockReturnValue(
      respond({ statusInfo: { openState: true, reasonCode: "TRADING", nextOpenTime: null } }),
    );
    expect(await getAssetStatus(NVDAON)).toEqual({
      openState: true,
      marketStatus: null,
      reasonCode: "TRADING",
      reasonMsg: null,
      nextOpenTime: null,
      nextCloseTime: null,
    });
  });
});

describe("public endpoints", () => {
  it("parses market session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        success: true,
        data: { marketStatus: "postmarket", openState: true, reasonCode: null, nextOpenTime: 1790726700000, nextCloseTime: 1790726340000 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const s = await getMarketSession();
    expect(s).toMatchObject({ marketStatus: "postmarket", openState: true, nextOpenTime: 1790726700000 });
    expect(fetchMock.mock.calls[0][1].headers["Accept-Encoding"]).toBe("identity");
  });

  it("keeps only BSC xStocks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          success: true,
          data: [
            { chainId: "CT_501", contractAddress: "Xs151QeqTCiuKtinzfRATnUESM2xTU6V9Wy8Vy538ci", symbol: "WMTx", ticker: "WMT", multiplier: "1.007" },
            { chainId: "56", contractAddress: NVDAON.toLowerCase(), symbol: "NVDAx", ticker: "NVDA", multiplier: "1.01" },
          ],
        }),
      ),
    );
    expect(await listXStocksPublic()).toEqual([{ address: getAddress(NVDAON), symbol: "NVDAx", ticker: "NVDA", ratio: 1.01 }]);
  });

  it("fails on a non-200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("no", { status: 503 })));
    await expect(getMarketSession()).rejects.toThrow(/HTTP 503/);
  });
});
