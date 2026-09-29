import { createPublicClient, http } from "viem";
import { bsc } from "viem/chains";

export function createChainClient(rpcUrl: string) {
  return createPublicClient({ chain: bsc, transport: http(rpcUrl) });
}

export type ChainClient = ReturnType<typeof createChainClient>;
