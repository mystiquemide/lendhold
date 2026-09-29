import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { getAddress } from "viem";
import { getChain } from "@/lib/chain";
import { getConfig } from "@/lib/config";
import { getRwaPrices, listRwaTokens } from "@/lib/binance/rwa";
import { getEligibleMarkets, listBStockMarkets } from "@/lib/lista/markets";
import {
  aprFromRatePerSecond,
  borrowRatePerSecond,
  erc20Allowance,
  erc20Balance,
  erc20Decimals,
  getBroker,
  getMarketParams,
  getMarketState,
  getPosition,
  getProvider,
  isWhiteListed,
  moolahAddress,
  ORACLE_DECIMALS,
  peekPrice,
  DEAD_ADDRESS,
  ZERO_ADDRESS,
} from "@/lib/lista/chain";
import { NVDAB, NVDAB_MARKET, USD1, USER } from "../helpers";

const CAST = "/root/.foundry/bin/cast";
const NVDAB_TOKEN = { address: NVDAB, symbol: "NVDAB" };

describe("live Lista markets", () => {
  it("lists markets and finds the NVDAB/USD1 market as eligible", async () => {
    const all = await listBStockMarkets();
    expect(all.length).toBeGreaterThan(50);
    expect(new Set(all.map((m) => m.id)).size).toBe(all.length);

    const eligible = await getEligibleMarkets(NVDAB_TOKEN);
    const m = eligible.find((e) => e.id === NVDAB_MARKET);
    expect(m, "0xaa1b... eligible").toBeDefined();
    expect(m!.lltv).toBe(0.75);
    expect(m!.params.loanToken).toBe(getAddress(USD1));
    expect(m!.params.collateralToken).toBe(getAddress(NVDAB));
    const liq = eligible.map((e) => e.liquidityUsd);
    expect(liq).toEqual([...liq].sort((a, b) => b - a));
  });
});

describe("live Moolah chain reads", () => {
  it("reads params, gates and totals", async () => {
    const params = await getMarketParams(NVDAB_MARKET);
    expect(params.lltv).toBe(750000000000000000n);
    expect(await getProvider(NVDAB_MARKET, NVDAB)).toBe(ZERO_ADDRESS);
    expect(await getBroker(NVDAB_MARKET)).toBe(ZERO_ADDRESS);
    expect(await isWhiteListed(NVDAB_MARKET, DEAD_ADDRESS)).toBe(true);
    const pos = await getPosition(NVDAB_MARKET, USER);
    expect(pos.collateral).toBe(0n);
    expect(await erc20Decimals(NVDAB)).toBe(18);
    expect(await erc20Balance(NVDAB, USER)).toBeGreaterThanOrEqual(0n);
    expect(await erc20Allowance(NVDAB, USER, moolahAddress())).toBeGreaterThanOrEqual(0n);
  });

  it("oracle NVDAB price is within 1% of RWA reference x ratio", async () => {
    const params = await getMarketParams(NVDAB_MARKET);
    const [token] = (await listRwaTokens("bstock")).filter((t) => t.address === getAddress(NVDAB));
    const price = (await getRwaPrices([NVDAB])).get(NVDAB.toLowerCase())!;
    const oracle = Number(await peekPrice(params.oracle, params.collateralToken)) / 10 ** ORACLE_DECIMALS;
    const expected = price.referencePrice! * token.ratio;
    console.log("oracle NVDAB:", oracle, "RWA ref x ratio:", expected);
    expect(Math.abs(oracle / expected - 1)).toBeLessThan(0.01);
    const loan = Number(await peekPrice(params.oracle, params.loanToken)) / 10 ** ORACLE_DECIMALS;
    expect(loan).toBeGreaterThan(0.9);
    expect(loan).toBeLessThan(1.1);
  });

  it("market totals match cast at the same block", async () => {
    if (!existsSync(CAST)) return;
    const block = await getChain().getBlockNumber();
    const rpc = getConfig().BSC_RPC_URL;
    const out = execFileSync(
      CAST,
      ["call", moolahAddress(), "market(bytes32)(uint128,uint128,uint128,uint128,uint128,uint128)", NVDAB_MARKET, "--rpc-url", rpc, "--block", block.toString()],
      { encoding: "utf8" },
    );
    const castVals = out
      .trim()
      .split("\n")
      .map((l) => BigInt(l.split(" ")[0]));
    const state = await getChain().readContract({
      address: moolahAddress(),
      abi: (await import("@/lib/lista/abi")).moolahAbi,
      functionName: "market",
      args: [NVDAB_MARKET],
      blockNumber: block,
    });
    expect(castVals).toEqual([...state]);
    const mine = await getMarketState(NVDAB_MARKET);
    expect(mine.totalBorrowAssets).toBeGreaterThan(0n);
  });

  it("reads the borrow rate from the IRM", async () => {
    const params = await getMarketParams(NVDAB_MARKET);
    const state = await getMarketState(NVDAB_MARKET);
    const rate = await borrowRatePerSecond(params, state);
    const apr = aprFromRatePerSecond(rate);
    console.log("borrow rate/sec:", rate, "APR:", apr);
    expect(rate).toBeGreaterThan(0n);
    expect(apr).toBeGreaterThan(0);
    expect(apr).toBeLessThan(5);
  });
});
