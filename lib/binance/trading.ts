import "server-only";
import { BadRequestError } from "@binance-web3/wallet";
import { z } from "zod";
import { getBinance } from "./client";
import { callApi } from "./unwrap";
import {
  bigintString,
  evmAddress,
  nullableString,
  numeric,
} from "@/lib/schema";

const BSC = "56";

/** Gateway code for pairs that have no route (for example Ondo token to bStock). */
const NO_ROUTE_CODES = new Set([40368]);

/** Quotes above this price impact (as a fraction, 0.01 = 1%) are never used. */
export const MAX_PRICE_IMPACT = 0.01;

export interface Quote {
  quoteId: string;
  vendor: string;
  executionMode: string;
  fromAmount: bigint;
  toAmount: bigint;
  /** Fraction, not percent: 0.01 = 1%. Negative means better than the reference price. */
  priceImpact: number;
  tradeFee: string | null;
  raw: unknown;
}

const quoteSchema = z.array(
  z.looseObject({
    quoteId: z.string(),
    vendorName: z.string(),
    executionMode: z.string(),
    fromTokenAmount: bigintString,
    toTokenAmount: bigintString,
    priceImpactPercent: numeric,
    tradeFee: nullableString,
  }),
);

export interface GetQuoteInput {
  from: string;
  to: string;
  amount: bigint;
  userWalletAddress: string;
}

export async function getQuote(input: GetQuoteInput): Promise<Quote | null> {
  let rows: z.infer<typeof quoteSchema>;
  try {
    rows = await callApi(
      "getAggregatedQuote",
      getBinance().getAggregatedQuote({
        binanceChainId: BSC,
        amount: input.amount.toString(),
        fromTokenAddress: input.from,
        toTokenAddress: input.to,
        userWalletAddress: input.userWalletAddress,
      }),
      z.array(z.unknown()).nullable().transform((v) => v ?? []).pipe(quoteSchema),
    );
  } catch (err) {
    if (err instanceof BadRequestError && NO_ROUTE_CODES.has(Number(err.code))) {
      return null;
    }
    throw err;
  }
  if (rows.length === 0) return null;
  const best = rows.reduce((a, b) => (b.toTokenAmount > a.toTokenAmount ? b : a));
  return {
    quoteId: best.quoteId,
    vendor: best.vendorName,
    executionMode: best.executionMode,
    fromAmount: best.fromTokenAmount,
    toAmount: best.toTokenAmount,
    priceImpact: best.priceImpactPercent,
    tradeFee: best.tradeFee,
    raw: best,
  };
}

export function isQuoteAcceptable(quote: Quote): boolean {
  return (
    quote.toAmount > 0n &&
    Number.isFinite(quote.priceImpact) &&
    quote.priceImpact <= MAX_PRICE_IMPACT
  );
}

export interface EvmTx {
  from: string;
  to: string;
  data: string;
  value: bigint;
  gasLimit?: bigint;
}

export interface ApprovalInfo {
  spender: string;
  /** ERC-20 approve calldata for the sell token. */
  data: string;
}

export interface RfqInfo {
  vendor: string;
  txType: string | null;
  signingScheme: string | null;
  /** EIP-712 payload for eth_signTypedData_v4, as returned (hex or JSON string). */
  typedDataToSign: string;
}

export interface SwapBuild {
  executionMode: string;
  /** Present for on-chain swaps. */
  tx: EvmTx | null;
  /** Present when the sell token needs an allowance first. */
  approval: ApprovalInfo | null;
  /** Present for RFQ routes that need a wallet signature. */
  rfq: RfqInfo | null;
  minReceiveAmount: bigint | null;
  toAmount: bigint | null;
  raw: unknown;
}

const txSchema = z.looseObject({
  from: z.string(),
  to: z.string(),
  data: z.string(),
  value: bigintString.optional(),
  gas: bigintString.nullable().optional(),
  minReceiveAmount: bigintString.nullable().optional(),
  signatureData: z.array(z.string()).nullable().optional(),
});

const rfqSchema = z.looseObject({
  vendor: z.string(),
  txType: nullableString,
  signingScheme: nullableString,
  typedDataToSign: z.string(),
  signatureData: z.array(z.string()).nullable().optional(),
});

const swapSchema = z.looseObject({
  executionMode: z.string(),
  routerResult: z
    .looseObject({ toTokenAmount: bigintString.nullable().optional() })
    .nullable()
    .optional(),
  tx: txSchema.nullable().optional(),
  rfq: rfqSchema.nullable().optional(),
});

const approvalDataSchema = z.object({
  approveContract: z.string(),
  approveTxCalldata: z.string(),
});

function readApproval(signatureData: string[] | null | undefined): ApprovalInfo | null {
  for (const entry of signatureData ?? []) {
    try {
      const parsed = approvalDataSchema.safeParse(JSON.parse(entry));
      if (parsed.success) {
        return {
          spender: evmAddress.parse(parsed.data.approveContract),
          data: parsed.data.approveTxCalldata,
        };
      }
    } catch {
      // ignore non-JSON entries
    }
  }
  return null;
}

export interface BuildSwapInput {
  quote: Quote;
  from: string;
  to: string;
  amount: bigint;
  userWalletAddress: string;
  /** Percent, "1" = 1%. */
  slippagePercent: number;
}

export async function buildSwap(input: BuildSwapInput): Promise<SwapBuild> {
  const data = await callApi(
    "buildSwapTransaction",
    getBinance().buildSwapTransaction({
      binanceChainId: BSC,
      amount: input.amount.toString(),
      fromTokenAddress: input.from,
      toTokenAddress: input.to,
      userWalletAddress: input.userWalletAddress,
      quoteId: input.quote.quoteId,
      slippagePercent: String(input.slippagePercent),
      approveTransaction: "true" as never,
    }),
    swapSchema,
  );
  if (!data.tx && !data.rfq) {
    throw new Error("buildSwapTransaction: response has neither tx nor rfq");
  }
  return {
    executionMode: data.executionMode,
    tx: data.tx
      ? {
          from: evmAddress.parse(data.tx.from),
          to: evmAddress.parse(data.tx.to),
          data: data.tx.data,
          value: data.tx.value ?? 0n,
          ...(data.tx.gas != null ? { gasLimit: data.tx.gas } : {}),
        }
      : null,
    approval: readApproval(data.tx?.signatureData ?? data.rfq?.signatureData),
    rfq: data.rfq
      ? {
          vendor: data.rfq.vendor,
          txType: data.rfq.txType,
          signingScheme: data.rfq.signingScheme,
          typedDataToSign: data.rfq.typedDataToSign,
        }
      : null,
    minReceiveAmount: data.tx?.minReceiveAmount ?? null,
    toAmount: data.routerResult?.toTokenAmount ?? null,
    raw: data,
  };
}

const approveSchema = z
  .array(
    z.looseObject({
      data: z.string(),
      dexContractAddress: evmAddress,
      gasLimit: bigintString.nullable().optional(),
    }),
  )
  .min(1);

export interface ApproveTx {
  to: string;
  data: string;
  spender: string;
  gasLimit: bigint | null;
}

/** Approve calldata for the aggregator router. `to` is the token, `spender` is the router. */
export async function getApproveTx(
  token: string,
  amount: bigint,
): Promise<ApproveTx> {
  const rows = await callApi(
    "getErc20ApproveTransaction",
    getBinance().getErc20ApproveTransaction({
      binanceChainId: BSC,
      tokenContractAddress: token,
      approveAmount: amount.toString(),
    }),
    approveSchema,
  );
  const r = rows[0];
  return {
    to: evmAddress.parse(token),
    data: r.data,
    spender: r.dexContractAddress,
    gasLimit: r.gasLimit ?? null,
  };
}

const looseResult = z.unknown();

export function submitRfqOrder(params: {
  requestId: string;
  userSignature: string;
  vendor: "InchFusion" | "CowSwap" | "PcsXRfq";
  quoteId: string;
}): Promise<unknown> {
  return callApi(
    "submitRfqOrder",
    getBinance().submitRfqOrder(
      params as Parameters<ReturnType<typeof getBinance>["submitRfqOrder"]>[0],
    ),
    looseResult,
  );
}

export function getRfqOrderStatus(orderId: string): Promise<unknown> {
  return callApi(
    "getRfqOrderStatus",
    getBinance().getRfqOrderStatus({ orderId }),
    looseResult,
  );
}

export function getTransactionStatus(txHash: string): Promise<unknown> {
  return callApi(
    "getTransactionStatus",
    getBinance().getTransactionStatus({ binanceChainId: BSC, txHash }),
    looseResult,
  );
}
