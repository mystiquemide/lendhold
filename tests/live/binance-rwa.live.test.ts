import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import {
  getAssetStatus,
  getMarketSession,
  getRwaPrices,
  listRwaTokens,
  listXStocksPublic,
} from "@/lib/binance/rwa";
import { NVDAB, NVDAON } from "../helpers";

describe("live RWA data", () => {
  it("lists NVDAon and NVDAB and prices them within 0.5% of the reference", async () => {
    const [ondo, bstock] = await Promise.all([listRwaTokens("ondo"), listRwaTokens("bstock")]);
    const on = ondo.find((t) => t.address === getAddress(NVDAON));
    const b = bstock.find((t) => t.address === getAddress(NVDAB));
    expect(on, "NVDAon in ondo list").toBeDefined();
    expect(b, "NVDAB in bstock list").toBeDefined();
    expect(b).toMatchObject({ symbol: "NVDAB", ticker: "NVDA", decimals: 18 });

    const prices = await getRwaPrices([NVDAON, NVDAB]);
    for (const token of [on!, b!]) {
      const p = prices.get(token.address.toLowerCase());
      expect(p, token.symbol).toBeDefined();
      expect(p!.referencePrice).not.toBeNull();
      const derived = p!.referencePrice! * token.ratio;
      expect(Math.abs(p!.tokenPrice / derived - 1), `${token.symbol} tokenPrice vs ref x ratio`).toBeLessThan(0.005);
    }
  });

  it("returns an asset status with a reason code", async () => {
    const s = await getAssetStatus(NVDAB);
    expect(typeof s.reasonCode).toBe("string");
    expect(typeof s.openState).toBe("boolean");
  });

  it("reads the public market session and BSC xStocks", async () => {
    const session = await getMarketSession();
    expect(typeof session.marketStatus).toBe("string");
    const xs = await listXStocksPublic();
    expect(xs.length).toBeGreaterThan(0);
    expect(xs.every((x) => /^0x[0-9a-fA-F]{40}$/.test(x.address))).toBe(true);
  });
});
