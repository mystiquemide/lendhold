import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAddress } from "viem";
import { NVDAB, NVDAON, USDT, USER, respond } from "./helpers";

const api = {
  getAggregatedQuote: vi.fn(),
  buildSwapTransaction: vi.fn(),
  getErc20ApproveTransaction: vi.fn(),
};
vi.mock("@/lib/binance/client", () => ({ getBinance: () => api }));

import { BadRequestError } from "@binance-web3/wallet";
import {
  MAX_PRICE_IMPACT,
  buildSwap,
  getApproveTx,
  getQuote,
  isQuoteAcceptable,
  type Quote,
} from "@/lib/binance/trading";

const quoteRow = (over: Record<string, unknown> = {}) => ({
  quoteId: "a".repeat(32),
  vendorName: "LiquidMesh",
  executionMode: "SWAP",
  fromTokenAmount: "50000000000000000000",
  toTokenAmount: "218948728079563176",
  priceImpactPercent: "0.0007",
  tradeFee: "0.02",
  ...over,
});

beforeEach(() => vi.resetAllMocks());

describe("getQuote", () => {
  const input = { from: USDT, to: NVDAB, amount: 50n * 10n ** 18n, userWalletAddress: USER };

  it("picks the route with the largest output and returns a fraction impact", async () => {
    api.getAggregatedQuote.mockReturnValue(
      respond([quoteRow({ quoteId: "b".repeat(32), toTokenAmount: "5" }), quoteRow()]),
    );
    const q = await getQuote(input);
    expect(q?.quoteId).toBe("a".repeat(32));
    expect(q?.toAmount).toBe(218948728079563176n);
    expect(q?.priceImpact).toBe(0.0007);
    expect(api.getAggregatedQuote).toHaveBeenCalledWith({
      binanceChainId: "56",
      amount: "50000000000000000000",
      fromTokenAddress: USDT,
      toTokenAddress: NVDAB,
      userWalletAddress: USER,
    });
  });

  it("returns null for null/empty data and for the issuer-pair error code", async () => {
    api.getAggregatedQuote.mockReturnValueOnce(respond(null));
    expect(await getQuote(input)).toBeNull();
    api.getAggregatedQuote.mockReturnValueOnce(respond([]));
    expect(await getQuote(input)).toBeNull();
    api.getAggregatedQuote.mockRejectedValueOnce(new BadRequestError("Ondo asset can only pair", 40368));
    expect(await getQuote(input)).toBeNull();
  });

  it("rethrows other errors", async () => {
    api.getAggregatedQuote.mockRejectedValueOnce(new BadRequestError("bad param", 40001));
    await expect(getQuote(input)).rejects.toThrow("bad param");
  });
});

describe("isQuoteAcceptable", () => {
  const base = { toAmount: 1n } as Quote;
  it("accepts up to 1% and rejects above", () => {
    expect(MAX_PRICE_IMPACT).toBe(0.01);
    expect(isQuoteAcceptable({ ...base, priceImpact: 0.0007 } as Quote)).toBe(true);
    expect(isQuoteAcceptable({ ...base, priceImpact: -0.0003 } as Quote)).toBe(true);
    expect(isQuoteAcceptable({ ...base, priceImpact: 0.01 } as Quote)).toBe(true);
    expect(isQuoteAcceptable({ ...base, priceImpact: 0.9995 } as Quote)).toBe(false);
    expect(isQuoteAcceptable({ ...base, priceImpact: Number.NaN } as Quote)).toBe(false);
    expect(isQuoteAcceptable({ toAmount: 0n, priceImpact: 0 } as Quote)).toBe(false);
  });
});

describe("buildSwap", () => {
  const quote = { quoteId: "a".repeat(32) } as Quote;
  const args = { quote, from: USDT, to: NVDAB, amount: 5n, userWalletAddress: USER, slippagePercent: 1 };
  const approvalJson = JSON.stringify({
    approveContract: "0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5",
    approveTxCalldata: "0x095ea7b3",
  });

  it("models a plain EVM swap with approval", async () => {
    api.buildSwapTransaction.mockReturnValue(
      respond({
        executionMode: "SWAP",
        routerResult: { toTokenAmount: "10" },
        tx: {
          from: USER,
          to: "0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5",
          data: "0xad43f73d",
          value: "0",
          gas: "450000",
          minReceiveAmount: "9",
          signatureData: [approvalJson],
        },
        rfq: null,
      }),
    );
    const s = await buildSwap(args);
    expect(s.tx).toEqual({
      from: USER,
      to: "0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5",
      data: "0xad43f73d",
      value: 0n,
      gasLimit: 450000n,
    });
    expect(s.approval).toEqual({ spender: "0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5", data: "0x095ea7b3" });
    expect(s.rfq).toBeNull();
    expect(s.minReceiveAmount).toBe(9n);
    expect(api.buildSwapTransaction.mock.calls[0][0]).toMatchObject({ slippagePercent: "1", approveTransaction: "true" });
  });

  it("models an RFQ response", async () => {
    api.buildSwapTransaction.mockReturnValue(
      respond({
        executionMode: "RFQ",
        tx: null,
        rfq: { vendor: "PcsXRfq", txType: "EIP712", signingScheme: "eip712", typedDataToSign: "{}", signatureData: [approvalJson] },
      }),
    );
    const s = await buildSwap(args);
    expect(s.tx).toBeNull();
    expect(s.rfq).toMatchObject({ vendor: "PcsXRfq", typedDataToSign: "{}" });
    expect(s.approval?.data).toBe("0x095ea7b3");
  });

  it("rejects a response with neither tx nor rfq", async () => {
    api.buildSwapTransaction.mockReturnValue(respond({ executionMode: "SWAP", tx: null, rfq: null }));
    await expect(buildSwap(args)).rejects.toThrow(/neither tx nor rfq/);
  });
});

describe("getApproveTx", () => {
  it("returns token, calldata and router spender", async () => {
    api.getErc20ApproveTransaction.mockReturnValue(
      respond([{ data: "0x095ea7b3", dexContractAddress: "0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5", gasLimit: "70000" }]),
    );
    expect(await getApproveTx(NVDAON, 5n)).toEqual({
      to: getAddress(NVDAON),
      data: "0x095ea7b3",
      spender: "0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5",
      gasLimit: 70000n,
    });
  });
});
