import "server-only";
import { execFile } from "node:child_process";
import { getAddress, type Address } from "viem";
import { z } from "zod";
import { getConfig } from "@/lib/config";

export class AgentError extends Error {
  constructor(
    /** For example "contract-call preview". */
    public readonly command: string,
    /** The CLI's own message, unmodified. */
    message: string,
    public readonly details: { code?: number | string; name?: string; data?: unknown } = {},
  ) {
    super(message);
    this.name = "AgentError";
  }
}

export interface RunResult {
  stdout: string;
  stderr: string;
  /** Process exit code, or null when killed by a timeout. */
  exitCode: number | null;
  timedOut: boolean;
}

export type Runner = (bin: string, args: string[], timeoutMs: number) => Promise<RunResult>;

export const execRunner: Runner = (bin, args, timeoutMs) =>
  new Promise((resolve) => {
    execFile(
      bin,
      args,
      { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, env: process.env },
      (error, stdout, stderr) => {
        if (!error) return resolve({ stdout, stderr, exitCode: 0, timedOut: false });
        const e = error as NodeJS.ErrnoException & { killed?: boolean; code?: number | string };
        const timedOut = e.killed === true;
        resolve({
          stdout: stdout ?? "",
          stderr: (stderr || e.message) ?? "",
          exitCode: typeof e.code === "number" ? e.code : null,
          timedOut,
        });
      },
    );
  });

const failureSchema = z.object({
  success: z.literal(false),
  error: z.looseObject({
    code: z.union([z.number(), z.string()]).optional(),
    name: z.string().optional(),
    message: z.string(),
    data: z.unknown().optional(),
  }),
});

const successSchema = z.object({ success: z.literal(true), data: z.unknown() });

function parseJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    if (start > 0) return JSON.parse(trimmed.slice(start));
    throw new Error("not JSON");
  }
}

// ------------------------------------------------------------------ response schemas

const nullableString = z.string().nullable().optional();
const num = z.number();

const statusData = z.object({ status: z.string() });

const addressData = z.object({
  addresses: z.array(z.object({ binanceChainId: z.string(), chainName: z.string(), address: z.string() })),
});

export const settingsData = z.looseObject({
  dailyLimit: num,
  quotaUsed: num,
  quotaLeft: num,
  quotaDate: nullableString,
  abnormalTxnHandling: z.string(),
  tradeAllTokens: z.boolean(),
  developerModeQuotaUsed: num,
  defiQuotaLeft: num.optional(),
  sessionExpireTime: nullableString,
  inactiveSignOutTime: nullableString,
  devMode: z.looseObject({
    enabled: z.boolean(),
    expiresAt: z.union([z.string(), z.number()]).nullable().optional(),
    dailyLimit: num.nullable().optional(),
    balanceExceeded: z.boolean().optional(),
  }),
});
export type AgentSettings = z.infer<typeof settingsData>;

const balanceData = z.array(
  z.looseObject({
    symbol: z.string(),
    address: z.string(),
    binanceChainId: z.string(),
    balance: z.string(),
    price: nullableString,
    value: nullableString,
  }),
);
export type AgentBalance = z.infer<typeof balanceData>[number];

const quoteData = z.looseObject({
  fromCoinSymbol: z.string(),
  fromCoinAmount: z.string(),
  toCoinSymbol: z.string(),
  toCoinAmount: z.string(),
  slippage: num,
});
export type AgentQuote = z.infer<typeof quoteData>;

const swapData = z.looseObject({ orderId: z.string() });

const orderData = z.looseObject({
  total: num,
  list: z.array(
    z.looseObject({
      orderId: z.string(),
      status: z.string(),
      txHash: nullableString,
      fromToken: z.string().optional(),
      toToken: z.string().optional(),
      fromTokenQty: z.string().optional(),
      toTokenActualQty: z.string().nullish(),
      bookTime: z.string().nullish(),
    }),
  ),
});
export type AgentOrder = z.infer<typeof orderData>["list"][number];

const riskDetail = z.looseObject({
  code: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  riskType: z.string().optional(),
});

const previewData = z.looseObject({
  requestId: z.string(),
  parsedTx: z.looseObject({ transactionType: z.string().optional() }).nullable().optional(),
  simulationResult: z
    .looseObject({
      simulationCode: z.string().nullable().optional(),
      simulationErrorDetail: z.unknown().optional(),
      allowanceChanges: z.array(z.unknown()).optional(),
      authorityChanges: z.array(z.unknown()).optional(),
      balanceChanges: z.array(z.unknown()).optional(),
    })
    .nullable()
    .optional(),
  risks: z
    .looseObject({
      riskDetails: z.array(riskDetail).optional(),
      addresses: z
        .record(z.string(), z.looseObject({ riskLevel: z.number().optional(), riskDetails: z.array(riskDetail).optional() }))
        .optional(),
      riskBehaviors: z.array(z.unknown()).optional(),
    })
    .nullable()
    .optional(),
  requireConfirmation: z.boolean().optional(),
  expiresAt: z.union([z.number(), z.string()]).nullable().optional(),
});
export type ContractCallPreview = z.infer<typeof previewData>;

const executeData = z.looseObject({
  orderId: nullableString,
  status: z.string(),
  txHash: nullableString,
  message: nullableString,
});
export type ContractCallExecution = z.infer<typeof executeData>;

// ------------------------------------------------------------------ client

export interface BawOptions {
  bin: string;
  run?: Runner;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const LONG_TIMEOUT_MS = 90_000;

export interface SwapParams {
  /** Human-readable amount of the sell token, for example "12.5". */
  fromTokenQty: string;
  fromToken: string;
  toToken: string;
  /** Percent: 0.5 means 0.5%. */
  slippage: number;
  binanceChainId?: string;
}

export interface Baw {
  walletStatus(): Promise<string>;
  walletAddress(binanceChainId?: string): Promise<Address>;
  walletSettings(): Promise<AgentSettings>;
  walletBalance(opts?: { symbol?: string; tokenAddress?: string; binanceChainId?: string }): Promise<AgentBalance[]>;
  marketOrderQuote(p: SwapParams): Promise<AgentQuote>;
  marketOrderSwap(p: SwapParams): Promise<{ orderId: string }>;
  marketOrderList(orderId: string): Promise<AgentOrder | null>;
  recentOrders(binanceChainId: string): Promise<AgentOrder[]>;
  contractCallPreview(p: { from: string; to: string; value?: bigint; inputData?: string; binanceChainId?: string }): Promise<ContractCallPreview>;
  contractCallExecute(requestId: string): Promise<ContractCallExecution>;
}

export function createBaw(opts: BawOptions): Baw {
  const run = opts.run ?? execRunner;
  const defaultTimeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function call<T>(
    command: string,
    args: string[],
    schema: z.ZodType<T>,
    timeoutMs = defaultTimeout,
  ): Promise<T> {
    const argv = [...command.split(" "), ...args, "--json"];
    const res = await run(opts.bin, argv, timeoutMs);
    if (res.timedOut) {
      throw new AgentError(command, `baw ${command} timed out after ${Math.round(timeoutMs / 1000)}s`, { name: "TIMEOUT" });
    }
    let body: unknown;
    try {
      body = parseJson(res.stdout);
    } catch {
      const text = (res.stderr || res.stdout).trim() || `baw ${command} exited with code ${res.exitCode}`;
      throw new AgentError(command, text, { name: "NO_JSON" });
    }
    const failure = failureSchema.safeParse(body);
    if (failure.success) {
      const e = failure.data.error;
      throw new AgentError(command, e.message, { code: e.code, name: e.name, data: e.data });
    }
    const success = successSchema.safeParse(body);
    if (!success.success || res.exitCode !== 0) {
      throw new AgentError(command, `baw ${command} returned an unexpected result (exit ${res.exitCode})`, { name: "BAD_ENVELOPE" });
    }
    const data = schema.safeParse(success.data.data);
    if (!data.success) {
      const issue = data.error.issues[0];
      throw new AgentError(command, `baw ${command}: unexpected response at ${issue?.path.join(".") || "root"}: ${issue?.message}`, {
        name: "BAD_SHAPE",
      });
    }
    return data.data;
  }

  const swapArgs = (p: SwapParams) => [
    "--fromTokenQty", p.fromTokenQty,
    "--fromToken", p.fromToken,
    "--toToken", p.toToken,
    "--binanceChainId", p.binanceChainId ?? "56",
    "--slippage", String(p.slippage),
  ];

  return {
    async walletStatus() {
      return (await call("wallet status", [], statusData)).status;
    },
    async walletAddress(chainId = "56") {
      const data = await call("wallet address", [], addressData);
      const entry = data.addresses.find((a) => a.binanceChainId === chainId);
      if (!entry) throw new AgentError("wallet address", `No address for chain ${chainId}`, { name: "NO_ADDRESS" });
      return getAddress(entry.address);
    },
    walletSettings() {
      return call("wallet settings", [], settingsData);
    },
    walletBalance(o = {}) {
      const args: string[] = [];
      if (o.symbol) args.push("--symbol", o.symbol);
      if (o.tokenAddress) args.push("--tokenAddress", o.tokenAddress);
      args.push("--binanceChainId", o.binanceChainId ?? "56");
      return call("wallet balance", args, balanceData);
    },
    marketOrderQuote(p) {
      return call("market-order quote", swapArgs(p), quoteData);
    },
    marketOrderSwap(p) {
      return call("market-order swap", swapArgs(p), swapData, LONG_TIMEOUT_MS);
    },
    async marketOrderList(orderId) {
      const data = await call("market-order list", ["--orderId", orderId], orderData);
      return data.list.find((o) => o.orderId === orderId) ?? null;
    },
    async recentOrders(binanceChainId) {
      const data = await call("market-order list", ["--binanceChainId", binanceChainId], orderData);
      return data.list;
    },
    contractCallPreview(p) {
      const args = [
        "--binanceChainId", p.binanceChainId ?? "56",
        "--from", p.from,
        "--to", p.to,
        "--value", (p.value ?? 0n).toString(),
      ];
      if (p.inputData) args.push("--inputData", p.inputData);
      return call("contract-call preview", args, previewData, LONG_TIMEOUT_MS);
    },
    contractCallExecute(requestId) {
      return call("contract-call execute", ["--requestId", requestId], executeData, LONG_TIMEOUT_MS);
    },
  };
}

let shared: Baw | undefined;

export function getBaw(): Baw {
  shared ??= createBaw({ bin: getConfig().BAW_BIN });
  return shared;
}

// ------------------------------------------------------------------ readiness

export type AgentBlockerCode =
  | "SESSION_MISSING"
  | "DEV_MODE_OFF"
  | "DEV_MODE_BALANCE_EXCEEDED"
  | "QUOTA_EXHAUSTED";

export interface AgentBlocker {
  code: AgentBlockerCode;
  message: string;
}

export interface AgentReadiness {
  ok: boolean;
  blockers: AgentBlocker[];
  address?: Address;
  settings?: AgentSettings;
}

/** Checks the Agentic Wallet session, Developer Mode and daily quotas. Returns blockers instead of throwing. */
export async function ensureAgentReady(
  requiredUsd: number,
  baw: Baw = getBaw(),
  now: number = Date.now(),
): Promise<AgentReadiness> {
  const blockers: AgentBlocker[] = [];
  let status: string;
  try {
    status = await baw.walletStatus();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, blockers: [{ code: "SESSION_MISSING", message }] };
  }
  if (status !== "CONNECTED") {
    return {
      ok: false,
      blockers: [{ code: "SESSION_MISSING", message: `Agentic Wallet is ${status}. The operator must sign in with baw.` }],
    };
  }

  let settings: AgentSettings;
  let address: Address;
  try {
    [settings, address] = await Promise.all([baw.walletSettings(), baw.walletAddress("56")]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, blockers: [{ code: "SESSION_MISSING", message }] };
  }

  const dev = settings.devMode;
  const expires = dev.expiresAt == null ? null : typeof dev.expiresAt === "number" ? dev.expiresAt * 1000 : Date.parse(dev.expiresAt);
  if (!dev.enabled || (expires !== null && Number.isFinite(expires) && expires <= now)) {
    blockers.push({ code: "DEV_MODE_OFF", message: "Developer Mode is off or expired. Turn it on in the Binance App." });
  }
  if (dev.balanceExceeded) {
    blockers.push({
      code: "DEV_MODE_BALANCE_EXCEEDED",
      message: "The wallet balance is above its Developer Mode daily limit. Raise the limit in the Binance App.",
    });
  }
  const devLeft = (dev.dailyLimit ?? 0) - settings.developerModeQuotaUsed;
  if (settings.quotaLeft < requiredUsd || devLeft < requiredUsd) {
    blockers.push({
      code: "QUOTA_EXHAUSTED",
      message: `Not enough daily quota for about $${requiredUsd.toFixed(2)}: ${settings.quotaLeft} left for swaps, ${Math.max(devLeft, 0)} left for contract calls.`,
    });
  }
  return { ok: blockers.length === 0, blockers, address, settings };
}
