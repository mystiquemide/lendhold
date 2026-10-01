import { createPublicClient, http } from "viem";
import { bsc } from "viem/chains";

export function createChainClient(rpcUrl: string) {
  return createPublicClient({ chain: bsc, transport: http(rpcUrl), batch: { multicall: { batchSize: 4096, wait: 16 } } });
}

export type ChainClient = ReturnType<typeof createChainClient>;
