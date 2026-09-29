import "server-only";
import { getConfig } from "@/lib/config";
import { createBinance, type BinanceRestApi } from "./client.core";

let instance: BinanceRestApi | undefined;

export function getBinance(): BinanceRestApi {
  if (!instance) {
    const config = getConfig();
    instance = createBinance(
      config.BINANCE_WEB3_API_KEY,
      config.BINANCE_WEB3_API_SECRET,
    );
  }
  return instance;
}
