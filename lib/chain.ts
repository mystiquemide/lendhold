import "server-only";
import { getConfig } from "@/lib/config";
import { createChainClient, type ChainClient } from "./chain.core";

let instance: ChainClient | undefined;

export function getChain(): ChainClient {
  instance ??= createChainClient(getConfig().BSC_RPC_URL);
  return instance;
}
