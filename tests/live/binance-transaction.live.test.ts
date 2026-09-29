import { describe, expect, it } from "vitest";
import { encodeFunctionData, parseAbi } from "viem";
import { getGasPrice, simulate } from "@/lib/binance/transaction";
import { NVDAB, USER } from "../helpers";

const MOOLAH = "0x8F73b65B4caAf64FBA2aF91cC5D4a2A1318E5D8C";
const abi = parseAbi([
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
]);

describe("live transaction API", () => {
  it("simulates an approve as ok", async () => {
    const r = await simulate({
      from: USER,
      to: NVDAB,
      data: encodeFunctionData({ abi, functionName: "approve", args: [MOOLAH, 1n] }),
    });
    console.log("simulate ok raw:", JSON.stringify(r.raw));
    expect(r.ok).toBe(true);
  });

  it("simulates an impossible transfer as failed with a reason", async () => {
    const r = await simulate({
      from: USER,
      to: NVDAB,
      data: encodeFunctionData({ abi, functionName: "transfer", args: [MOOLAH, 10n ** 30n] }),
    });
    console.log("simulate fail raw:", JSON.stringify(r.raw));
    expect(r.ok).toBe(false);
    expect(r.revertReason).toBeTruthy();
  });

  it("returns a gas price", async () => {
    expect(await getGasPrice()).toBeGreaterThan(0n);
  });
});
