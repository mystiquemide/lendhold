import { config as loadEnv } from "dotenv";
import { loadConfig } from "../lib/config.core";
import { createBinance } from "../lib/binance/client.core";
import { createChainClient } from "../lib/chain.core";

async function main() {
  loadEnv({ path: ".env.local", quiet: true });
  const config = loadConfig();

  const binance = createBinance(
    config.BINANCE_WEB3_API_KEY,
    config.BINANCE_WEB3_API_SECRET,
  );
  const res = await binance.getAggregatorSupportedChains();
  const body = await res.data();
  // The SDK types data() as the response envelope but returns the unwrapped array.
  const chains = Array.isArray(body) ? body : (body.data ?? []);
  const bsc = chains.find((c: { binanceChainId?: string }) => c.binanceChainId === "56");
  console.log(`Binance aggregator supported chains: ${chains.length}`);
  console.log(`Includes "56": ${bsc ? `yes (${bsc.name ?? bsc.shortName})` : "no"}`);

  const block = await createChainClient(config.BSC_RPC_URL).getBlockNumber();
  console.log(`BSC block number: ${block}`);
}

main().catch((err: unknown) => {
  console.error("smoke failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
