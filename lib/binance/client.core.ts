import { Web3Wallet } from "@binance-web3/wallet";

/**
 * The gateway answers business errors with HTTP 200 and `{ success: false, code, msg }`,
 * and the SDK then resolves `.data()` to null. Rewriting those into a 400 makes the SDK
 * throw its BadRequestError carrying the gateway `code` and `msg`.
 */
function failBusinessErrors(data: unknown, _headers: unknown, status?: number) {
  if (status !== 200 || typeof data !== "string") return data;
  let envelope: unknown;
  try {
    envelope = JSON.parse(data);
  } catch {
    return data;
  }
  if (
    envelope &&
    typeof envelope === "object" &&
    (envelope as { success?: unknown }).success === false
  ) {
    throw Object.assign(new Error("Binance gateway error"), {
      response: { status: 400, data },
    });
  }
  return data;
}

export function createBinance(apiKey: string, apiSecret: string) {
  const restAPI = new Web3Wallet({
    configurationRestAPI: { apiKey, apiSecret, timeout: 15000 },
  }).restAPI;
  // The SDK rebuilds baseOptions from a fixed key list, so custom axios options must be set afterwards.
  const configuration = (
    restAPI as unknown as {
      configuration?: { baseOptions?: Record<string, unknown> };
    }
  ).configuration;
  if (!configuration?.baseOptions) {
    throw new Error("Binance SDK layout changed: cannot install error handling");
  }
  configuration.baseOptions.transformResponse = [failBusinessErrors];
  return restAPI;
}

export type BinanceRestApi = ReturnType<typeof createBinance>;
