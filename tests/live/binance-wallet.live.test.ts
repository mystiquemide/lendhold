import { describe, expect, it } from "vitest";
import { getAddress, parseAbiItem, type Address } from "viem";
import { createChainClient } from "@/lib/chain.core";
import { getBalances } from "@/lib/binance/wallet";
import { NVDAB } from "../helpers";

const KNOWN_HOLDER = "0xE27a37fD7B3B6C236Df7DcDb1f252c0e738F53D5";
const balanceOf = parseAbiItem("function balanceOf(address) view returns (uint256)");
const transfer = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

/** The BNB Chain RPC caps getLogs, so discovery uses publicnode with a small window. */
async function findRecentEoaHolder(): Promise<Address | null> {
  try {
    const client = createChainClient("https://bsc-rpc.publicnode.com");
    const head = await client.getBlockNumber();
    const logs = await client.getLogs({ address: NVDAB, event: transfer, fromBlock: head - 300n, toBlock: head });
    for (const to of new Set(logs.map((l) => l.args.to!))) {
      const [code, bal] = await Promise.all([
        client.getCode({ address: to }),
        client.readContract({ address: NVDAB, abi: [balanceOf], functionName: "balanceOf", args: [to] }),
      ]);
      if ((!code || code === "0x") && bal > 0n) return to;
    }
  } catch {
    // fall through to the known holder
  }
  return null;
}

describe("live wallet balances", () => {
  it("shows NVDAB for a real BSC holder", async () => {
    const holder = (await findRecentEoaHolder()) ?? KNOWN_HOLDER;
    console.log("B2 holder address:", holder);
    const balances = await getBalances(holder);
    const nvdab = balances.find((b) => b.address === getAddress(NVDAB));
    expect(nvdab, `NVDAB balance for ${holder}`).toBeDefined();
    expect(nvdab!.amount).toBeGreaterThan(0n);
    expect(nvdab!.decimals).toBe(18);
    expect(nvdab!.symbol).toBe("NVDAB");
  });
});
