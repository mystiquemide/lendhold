import { beforeEach, describe, expect, it, vi } from "vitest";
import { NVDAB, NVDAB_MARKET, USD1, USER } from "./helpers";

vi.mock("@/lib/config", () => ({ getConfig: () => ({ LISTA_API_BASE: "https://api.lista.org" }) }));
const gate = vi.fn();
vi.mock("@/lib/lista/chain", () => ({
  ZERO_ADDRESS: "0x0000000000000000000000000000000000000000",
  DEAD_ADDRESS: "0x000000000000000000000000000000000000dEaD",
  readMarketGate: (...a: unknown[]) => gate(...a),
}));

import { clearCache } from "@/lib/cache";
import { getEligibleMarkets, listBStockMarkets } from "@/lib/lista/markets";

const row = (id: string, collateral: string, over: Record<string, unknown> = {}) => ({
  id,
  lltv: "0.750000000000000000",
  liquidityUsd: "1000.5",
  totalBorrowAsset: "42",
  loan: "USD1",
  collateral,
  rate: "0.05",
  termType: 0,
  ...over,
});
const id = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;

function stubPages(pages: unknown[][], total: number) {
  const fetchMock = vi.fn().mockImplementation((url: URL) => {
    const page = Number(url.searchParams.get("page"));
    return Promise.resolve(Response.json({ code: "000000", data: { total, list: pages[page - 1] ?? [] } }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  clearCache();
  gate.mockReset();
  vi.unstubAllGlobals();
});

describe("listBStockMarkets", () => {
  it("paginates until total, dedupes by id and caches", async () => {
    const fetchMock = stubPages([[row(id(1), "NVDAB"), row(id(2), "TSLAB")], [row(id(2), "TSLAB"), row(id(3), "NVDAB")]], 3);
    const list = await listBStockMarkets();
    await listBStockMarkets();
    expect(list.map((m) => m.id)).toEqual([id(1), id(2), id(3)]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const url = fetchMock.mock.calls[0][0] as URL;
    expect(url.searchParams.get("zone")).toBe("5");
    expect(url.searchParams.get("pageSize")).toBe("50");
    expect(fetchMock.mock.calls[0][1].headers["User-Agent"]).toBeTruthy();
    expect(list[0]).toEqual({
      id: id(1), collateralSymbol: "NVDAB", loanSymbol: "USD1", lltv: 0.75, liquidityUsd: 1000.5, totalBorrow: 42, rateRaw: "0.05", termType: 0,
    });
  });
});

describe("getEligibleMarkets", () => {
  const params = (collateral: string) => ({ loanToken: USD1, collateralToken: collateral, oracle: USD1, irm: USD1, lltv: 750000000000000000n });
  const zero = "0x0000000000000000000000000000000000000000";

  it("filters by symbol, termType and on-chain gates, sorted by liquidity", async () => {
    stubPages(
      [[
        row(id(1), "NVDAB", { liquidityUsd: "10" }),
        row(id(2), "NVDAB", { liquidityUsd: "500" }),
        row(id(3), "NVDAB", { liquidityUsd: "900", termType: 1 }),
        row(id(4), "NVDAB", { liquidityUsd: "800" }),
        row(id(5), "NVDAB", { liquidityUsd: "700" }),
        row(id(6), "TSLAB"),
      ]],
      6,
    );
    gate.mockImplementation(async (mid: string) => {
      if (mid === id(4)) return { params: params(NVDAB), provider: "0x1234567890123456789012345678901234567890", broker: zero, whitelisted: true };
      if (mid === id(5)) return { params: params(NVDAB), provider: zero, broker: zero, whitelisted: false };
      return { params: params(NVDAB), provider: zero, broker: zero, whitelisted: true };
    });
    const out = await getEligibleMarkets({ address: NVDAB.toLowerCase(), symbol: "NVDAB" });
    expect(out.map((m) => m.id)).toEqual([id(2), id(1)]);
    expect(out[0].params.collateralToken).toBe(NVDAB);
    expect(gate).toHaveBeenCalledTimes(4);
    expect(gate.mock.calls[0][2]).toBe("0x000000000000000000000000000000000000dEaD");
  });

  it("drops markets whose collateral token address differs and uses the given user", async () => {
    stubPages([[row(NVDAB_MARKET, "NVDAB")]], 1);
    gate.mockResolvedValue({ params: params(USD1), provider: zero, broker: zero, whitelisted: true });
    expect(await getEligibleMarkets({ address: NVDAB, symbol: "NVDAB" }, USER)).toEqual([]);
    expect(gate.mock.calls[0][2]).toBe(USER);
  });
});
