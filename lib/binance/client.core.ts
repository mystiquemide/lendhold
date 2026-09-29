import { Web3Wallet } from "@binance-web3/wallet";

export function createBinance(apiKey: string, apiSecret: string) {
  return new Web3Wallet({
    configurationRestAPI: { apiKey, apiSecret, timeout: 15000 },
  }).restAPI;
}

export type BinanceRestApi = ReturnType<typeof createBinance>;
