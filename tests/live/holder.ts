import { parseAbiItem, type Address } from "viem";
import { createChainClient } from "@/lib/chain.core";
import { NVDAB } from "../helpers";

const KNOWN_HOLDER: Address = "0xE27a37fD7B3B6C236Df7DcDb1f252c0e738F53D5";
const balanceOf = parseAbiItem("function balanceOf(address) view returns (uint256)");
const transfer = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

/** An EOA holding at least `min` raw NVDAB, found from recent transfers (publicnode allows getLogs), else a known holder. */
export async function findNvdabHolder(min = 5n * 10n ** 16n): Promise<Address> {
  try {
    const client = createChainClient("https://bsc-rpc.publicnode.com");
    const head = await client.getBlockNumber();
    const logs = await client.getLogs({ address: NVDAB, event: transfer, fromBlock: head - 300n, toBlock: head });
    for (const to of new Set(logs.map((l) => l.args.to!))) {
      const [code, bal] = await Promise.all([
        client.getCode({ address: to }),
        client.readContract({ address: NVDAB, abi: [balanceOf], functionName: "balanceOf", args: [to] }),
      ]);
      if ((!code || code === "0x") && bal >= min) return to;
    }
  } catch {
    // fall back
  }
  return KNOWN_HOLDER;
}
