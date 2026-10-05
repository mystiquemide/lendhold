import "server-only";
import { formatUnits, getAddress, parseUnits, type Address } from "viem";
import { getChain } from "@/lib/chain";
import { getConfig } from "@/lib/config";
import { fromJson, toJson } from "@/lib/json";
import { simulateStep, type StepSimulation } from "@/lib/engine/checks";
import type { Plan, Step } from "@/lib/engine/planner";
import { evaluateSwap, SLIPPAGE_PERCENT, swapRejectionMessage, type SwapEval, type SwapToken } from "@/lib/engine/swap-eval";
import { verifyTx, type ObservedTx } from "@/lib/engine/verify";
import { erc20Allowance, erc20Balance, getPosition, moolahAddress } from "@/lib/lista/chain";
import { getRun, updateRunStatus, upsertStep, type RunStep, type RunWithSteps } from "@/lib/store/db";
import type { Sql } from "@/lib/store/sql";
import { AgentError, ensureAgentReady, getBaw, type AgentOrder, type AgentReadiness, type Baw, type ContractCallPreview } from "./baw";

const ORDER_CLOCK_SKEW_MS = 10_000;

export interface ChainReader {
  allowance(token: Address, owner: Address, spender: Address): Promise<bigint>;
  balance(token: Address, owner: Address): Promise<bigint>;
  position(marketId: `0x${string}`, owner: Address): Promise<{ collateral: bigint; borrowShares: bigint }>;
  /** Null when the transaction is not mined within the timeout. */
  waitForTx(hash: `0x${string}`, timeoutMs: number): Promise<ObservedTx | null>;
}

export const defaultChainReader: ChainReader = {
  allowance: erc20Allowance,
  balance: erc20Balance,
  async position(marketId, owner) {
    const p = await getPosition(marketId, owner);
    return { collateral: p.collateral, borrowShares: p.borrowShares };
  },
  async waitForTx(hash, timeoutMs) {
    const chain = getChain();
    try {
      const receipt = await chain.waitForTransactionReceipt({ hash, timeout: timeoutMs });
      const tx = await chain.getTransaction({ hash });
      return { status: receipt.status, from: receipt.from, to: receipt.to, input: tx.input };
    } catch {
      return null;
    }
  },
};

export interface ExecutorDeps {
  baw: Baw;
  chain: ChainReader;
  db?: Sql;
  ready: (requiredUsd: number) => Promise<AgentReadiness>;
  simulate: (plan: Plan, idx: number) => Promise<StepSimulation>;
  evaluateSwap: (from: SwapToken, to: SwapToken, amountIn: bigint, user: string) => Promise<SwapEval | null>;
  maxUsdPerRun: number;
  sleep: (ms: number) => Promise<void>;
  receiptTimeoutMs: number;
  orderPollIntervalMs: number;
  orderTimeoutMs: number;
}

/** Fills anything the caller did not inject. Defaults are evaluated only when needed, so injected runs need no env. */
export function resolveDeps(o: Partial<ExecutorDeps> = {}): ExecutorDeps {
  const baw = o.baw ?? getBaw();
  return {
    baw,
    chain: o.chain ?? defaultChainReader,
    db: o.db,
    ready: o.ready ?? ((usd) => ensureAgentReady(usd, baw)),
    simulate: o.simulate ?? simulateStep,
    evaluateSwap: o.evaluateSwap ?? evaluateSwap,
    maxUsdPerRun: o.maxUsdPerRun ?? getConfig().AGENT_MAX_USD_PER_RUN,
    sleep: o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    receiptTimeoutMs: o.receiptTimeoutMs ?? 120_000,
    orderPollIntervalMs: o.orderPollIntervalMs ?? 3_000,
    orderTimeoutMs: o.orderTimeoutMs ?? 90_000,
  };
}

export type AgentRunOutcome =
  | { status: "done" }
  | { status: "failed"; idx: number; reason: string }
  | { status: "busy" };

const running = new Set<string>();

export interface PlanUsd {
  /** Largest borrow, repay, buy or swap in the plan. This is what AGENT_MAX_USD_PER_RUN caps. */
  spendUsd: number;
  /** Largest value of any single step, including collateral deposits. Used for the wallet's daily quotas. */
  quotaUsd: number;
}

/** Stablecoin loans count as $1. */
export function planUsdValue(plan: Plan): PlanUsd {
  const loanDecimals = plan.market?.loanDecimals ?? 18;
  const collateralUsd = plan.sizing ? Number(formatUnits(plan.sizing.collateralValueLoan, loanDecimals)) : 0;
  let spend = 0;
  let quota = 0;
  for (const s of plan.steps) {
    if (s.kind === "borrow" || s.kind === "repay") {
      const usd = Number(formatUnits(s.amount ?? 0n, loanDecimals));
      spend = Math.max(spend, usd);
      quota = Math.max(quota, usd);
    } else if (s.kind === "swap" && s.swap) {
      const usd = Number(formatUnits(s.swap.amountIn, s.swap.fromDecimals)) * s.swap.fromUsd;
      spend = Math.max(spend, usd);
      quota = Math.max(quota, usd);
    } else if (s.kind === "supplyCollateral" || s.kind === "withdrawCollateral") {
      quota = Math.max(quota, collateralUsd);
    }
  }
  return { spendUsd: spend, quotaUsd: quota };
}

interface Baseline {
  collateral: bigint;
  borrowShares: bigint;
}

function readBaseline(step: RunStep | undefined): Baseline | null {
  if (!step?.simJson) return null;
  try {
    const parsed = fromJson<{ baseline?: Baseline }>(step.simJson);
    return parsed.baseline ?? null;
  } catch {
    return null;
  }
}

function blockingRisk(preview: ContractCallPreview): string | null {
  const risks = preview.risks;
  for (const d of risks?.riskDetails ?? []) {
    if ((d.riskType ?? "").toUpperCase() === "RISK") return `${d.title ?? d.code ?? "Risk"}: ${d.description ?? ""}`.trim();
  }
  for (const [addr, info] of Object.entries(risks?.addresses ?? {})) {
    if ((info.riskLevel ?? 0) >= 4) {
      const d = info.riskDetails?.[0];
      return `${addr} is flagged as high risk${d ? `: ${d.title ?? ""} ${d.description ?? ""}`.trimEnd() : ""}`;
    }
  }
  const sim = preview.simulationResult;
  if (sim?.simulationCode && sim.simulationCode !== "000000000") {
    return `Simulation ${sim.simulationCode}: ${JSON.stringify(sim.simulationErrorDetail ?? "failed")}`;
  }
  return null;
}

export async function runAgentPlan(runId: string, overrides: Partial<ExecutorDeps> = {}): Promise<AgentRunOutcome> {
  if (running.has(runId)) return { status: "busy" };
  running.add(runId);
  try {
    return await execute(runId, resolveDeps(overrides));
  } finally {
    running.delete(runId);
  }
}

async function execute(runId: string, d: ExecutorDeps): Promise<AgentRunOutcome> {
  const load = async (): Promise<RunWithSteps> => {
    const run = await getRun(runId, d.db);
    if (!run) throw new Error(`Run ${runId} not found`);
    return run;
  };
  const write = async (idx: number, kind: Step["kind"], patch: Partial<Pick<RunStep, "status" | "txHash" | "orderId" | "error" | "simJson">>) => {
    const current = (await (await load())).steps.find((s) => s.idx === idx);
    await upsertStep(
      {
        runId,
        idx,
        kind,
        status: patch.status ?? current?.status ?? "pending",
        simJson: patch.simJson !== undefined ? patch.simJson : (current?.simJson ?? null),
        txHash: patch.txHash !== undefined ? patch.txHash : (current?.txHash ?? null),
        orderId: patch.orderId !== undefined ? patch.orderId : (current?.orderId ?? null),
        error: patch.error !== undefined ? patch.error : (current?.error ?? null),
      },
      d.db,
    );
  };
  const fail = async (step: Step | null, reason: string): Promise<AgentRunOutcome> => {
    const idx = step?.idx ?? 0;
    const kind = step?.kind ?? (await load()).steps[0]?.kind ?? "approve";
    await write(idx, kind as Step["kind"], { status: "failed", error: reason });
    await updateRunStatus(runId, "failed", d.db);
    return { status: "failed", idx, reason };
  };

  const run = (await load());
  if (run.path !== "agent" || !run.planJson) {
    throw new Error("Run is not an agent run with a stored plan");
  }
  const plan = fromJson<Plan>(run.planJson);
  const owner = getAddress(plan.address);
  const first = plan.steps[0] ?? null;

  if (plan.blockers.length > 0 || plan.steps.length === 0) return fail(first, "The plan has blockers and cannot run");
  const usd = planUsdValue(plan);
  if (usd.spendUsd > d.maxUsdPerRun) {
    return fail(first, `This plan moves about $${usd.spendUsd.toFixed(2)}, above the per-run limit of $${d.maxUsdPerRun}`);
  }
  const ready = await d.ready(usd.quotaUsd);
  if (!ready.ok) return fail(first, ready.blockers.map((b) => b.message).join(" "));
  if (!ready.address || ready.address.toLowerCase() !== owner.toLowerCase()) {
    return fail(first, "The plan is for a different wallet than the agent's wallet");
  }

  await updateRunStatus(runId, "running", d.db);
  const moolah = moolahAddress();

  for (const step of plan.steps) {
    const rec = (await load()).steps.find((s) => s.idx === step.idx);
    if (rec?.status === "confirmed" || rec?.status === "skipped") continue;

    try {
      // A step already handed to the wallet is resumed, never resent.
      if (rec?.status === "sent" && step.kind !== "swap" && rec.txHash) {
        const outcome = await confirmTx(step, rec.txHash as `0x${string}`);
        if (outcome) return fail(step, outcome);
        continue;
      }
      if (rec?.status === "sent" && step.kind === "swap" && rec.orderId) {
        const outcome = await pollOrder(step, rec.orderId, rec.updatedAt);
        if (outcome) return fail(step, outcome);
        continue;
      }

      const skipped = await alreadyApplied(step, rec);
      if (skipped) {
        await write(step.idx, step.kind, { status: "skipped", error: skipped });
        continue;
      }

      const problem = step.kind === "swap" ? await runSwap(step) : await runContractCall(step);
      if (problem) return fail(step, problem);
    } catch (err) {
      return fail(step, err instanceof AgentError ? err.message : err instanceof Error ? err.message : String(err));
    }
  }

  await updateRunStatus(runId, "done", d.db);
  return { status: "done" };

  // ---------------------------------------------------------------- helpers

  async function alreadyApplied(step: Step, rec: RunStep | undefined): Promise<string | null> {
    if (step.kind === "approve" && step.token && step.amount !== undefined) {
      const allowance = await d.chain.allowance(step.token, owner, moolah);
      return allowance >= step.amount ? "Already approved" : null;
    }
    if (!plan.market || (step.kind !== "supplyCollateral" && step.kind !== "borrow" && step.kind !== "repay" && step.kind !== "withdrawCollateral")) {
      return null;
    }
    const now = await d.chain.position(plan.market.id, owner);
    let base = readBaseline(rec);
    if (!base) {
      base = now;
      await write(step.idx, step.kind, { simJson: toJson({ baseline: base }) });
      return null;
    }
    const amount = step.amount ?? 0n;
    if (step.kind === "supplyCollateral" && now.collateral >= base.collateral + amount) return "Collateral already deposited";
    if (step.kind === "borrow" && now.borrowShares > base.borrowShares) return "Loan already opened";
    if (step.kind === "repay" && now.borrowShares < base.borrowShares) return "Repayment already made";
    if (step.kind === "withdrawCollateral" && now.collateral + amount <= base.collateral) return "Collateral already withdrawn";
    return null;
  }

  async function runContractCall(step: Step): Promise<string | null> {
    if (!step.to || !step.data || !step.selector) return "Step has no contract call to send";

    if (step.kind === "supplyCollateral" && step.token && step.amount !== undefined) {
      const balance = await d.chain.balance(step.token, owner);
      if (balance < step.amount) return "The wallet does not hold enough collateral to deposit";
    }

    const sim = await d.simulate(plan, step.idx);
    if (!sim.ok) return `Simulation failed: ${sim.reason ?? "unknown reason"}`;
    await write(step.idx, step.kind, { status: "simulated" });

    const preview = await d.baw.contractCallPreview({ from: owner, to: step.to, value: step.value, inputData: step.data });
    const risk = blockingRisk(preview);
    if (risk) return `Wallet security check blocked this step: ${risk}`;
    if (preview.requireConfirmation) {
      return "The wallet wants this step approved in the Binance App, which an unattended run cannot do";
    }

    const exec = await d.baw.contractCallExecute(preview.requestId);
    if (exec.status !== "BROADCASTED" || !exec.txHash) {
      return exec.message || `Wallet returned ${exec.status} instead of broadcasting`;
    }
    await write(step.idx, step.kind, { status: "sent", txHash: exec.txHash, orderId: exec.orderId ?? null });
    return confirmTx(step, exec.txHash as `0x${string}`);
  }

  async function confirmTx(step: Step, hash: `0x${string}`): Promise<string | null> {
    const observed = await d.chain.waitForTx(hash, d.receiptTimeoutMs);
    if (!observed) return `Transaction ${hash} was not mined within ${Math.round(d.receiptTimeoutMs / 1000)}s`;
    const result = verifyTx(observed, { from: owner, to: step.to as string, selector: step.selector as string });
    if (!result.ok) return result.message;
    await write(step.idx, step.kind, { status: "confirmed", txHash: hash, error: null });
    return null;
  }

  async function runSwap(step: Step): Promise<string | null> {
    const s = step.swap;
    if (!s) return "Step has no swap to run";
    const from: SwapToken = { address: s.from, symbol: s.fromSymbol, decimals: s.fromDecimals, usd: s.fromUsd };
    const to: SwapToken = { address: s.to, symbol: s.toSymbol, decimals: s.toDecimals, usd: s.toUsd };
    const evaluation = await d.evaluateSwap(from, to, s.amountIn, owner);
    if (!evaluation) return `No route to swap ${s.fromSymbol} to ${s.toSymbol} right now`;
    if (!evaluation.acceptable) {
      return swapRejectionMessage(s.fromSymbol, s.toSymbol, evaluation);
    }
    await write(step.idx, step.kind, { status: "simulated" });
    const submittedAt = Date.now();
    const submitted = await d.baw.marketOrderSwap({
      fromTokenQty: formatUnits(s.amountIn, s.fromDecimals),
      fromToken: s.from,
      toToken: s.to,
      slippage: SLIPPAGE_PERCENT,
    });
    await write(step.idx, step.kind, { status: "sent", orderId: submitted.orderId });
    return pollOrder(step, submitted.orderId, submittedAt);
  }

  /** The order id returned by the CLI can be off by one from the real order, so fall back to matching recent orders. */
  async function findOrderByMatch(step: Step, submittedAt: number): Promise<{ order?: AgentOrder; ambiguous?: string }> {
    const s = step.swap;
    if (!s) return {};
    const taken = new Set((await load()).steps.filter((r) => r.idx !== step.idx && r.orderId).map((r) => r.orderId));
    const matches = (await d.baw.recentOrders("56")).filter((o) => {
      if (taken.has(o.orderId)) return false;
      if (o.fromToken?.toLowerCase() !== s.from.toLowerCase() || o.toToken?.toLowerCase() !== s.to.toLowerCase()) return false;
      try {
        if (!o.fromTokenQty || parseUnits(o.fromTokenQty, s.fromDecimals) !== s.amountIn) return false;
      } catch {
        return false;
      }
      const booked = o.bookTime ? Date.parse(o.bookTime) : NaN;
      return Number.isFinite(booked) && booked >= submittedAt - ORDER_CLOCK_SKEW_MS;
    });
    if (matches.length === 1) return { order: matches[0] };
    if (matches.length > 1) {
      return { ambiguous: `Found ${matches.length} matching swap orders, cannot tell which is ours: ${matches.map((o) => o.orderId).join(", ")}` };
    }
    return {};
  }

  async function pollOrder(step: Step, initialOrderId: string, submittedAt: number): Promise<string | null> {
    const deadline = Date.now() + d.orderTimeoutMs;
    let orderId = initialOrderId;
    for (;;) {
      let order = await d.baw.marketOrderList(orderId);
      if (!order) {
        const found = await findOrderByMatch(step, submittedAt);
        if (found.ambiguous) return found.ambiguous;
        if (found.order) {
          order = found.order;
          orderId = order.orderId;
          await write(step.idx, step.kind, { status: "sent", orderId });
        }
      }
      if (order?.status === "FINISHED") {
        if (!order.txHash) return `Swap order ${orderId} finished without a transaction hash`;
        const hash = order.txHash as `0x${string}`;
        const observed = await d.chain.waitForTx(hash, d.receiptTimeoutMs);
        if (!observed) return `Swap transaction ${hash} was not mined within ${Math.round(d.receiptTimeoutMs / 1000)}s`;
        const result = verifyTx(observed, { from: owner });
        if (!result.ok) return result.message;
        await write(step.idx, step.kind, { status: "confirmed", txHash: hash, orderId, error: null });
        return null;
      }
      if (order?.status === "FAILED") return `Binance marked swap order ${orderId} as FAILED`;
      if (Date.now() >= deadline) return `Swap order ${orderId} was still pending after ${Math.round(d.orderTimeoutMs / 1000)}s`;
      await d.sleep(d.orderPollIntervalMs);
    }
  }
}
