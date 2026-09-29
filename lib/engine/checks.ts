import "server-only";
import { formatUnits, type Address } from "viem";
import { getChain } from "@/lib/chain";
import { buildSwap } from "@/lib/binance/trading";
import { getGasPrice, simulate } from "@/lib/binance/transaction";
import {
  erc20Allowance,
  erc20Balance,
  erc20Decimals,
  getMarketState,
  getPosition,
  moolahAddress,
  peekPrice,
} from "@/lib/lista/chain";
import { computeSizing } from "./sizing";
import { availableLiquidity } from "./market-select";
import { borrowSharesToAssets } from "./debt";
import { evaluateSwap, SLIPPAGE_PERCENT, type SwapToken } from "./swap-eval";
import type { Plan, Step } from "./planner";

export type CheckStatus = "simulated_ok" | "simulated_failed" | "checked" | "check_failed";

export interface StepCheck {
  idx: number;
  status: CheckStatus;
  reason?: string;
  sim?: unknown;
}

export interface ReviewResult {
  ok: boolean;
  steps: StepCheck[];
  problems: string[];
  checkedAt: number;
}

const GAS_PER_STEP = 400_000n;

const key = (a: string) => a.toLowerCase();

function swapTokens(step: Step): { from: SwapToken; to: SwapToken } {
  const s = step.swap!;
  return {
    from: { address: s.from, symbol: s.fromSymbol, decimals: s.fromDecimals, usd: s.fromUsd },
    to: { address: s.to, symbol: s.toSymbol, decimals: s.toDecimals, usd: s.toUsd },
  };
}

/** Re-quotes a swap step and rebuilds it. Returns a failure reason or null. */
async function recheckSwap(plan: Plan, step: Step): Promise<{ reason: string | null; minOut: bigint }> {
  const { from, to } = swapTokens(step);
  const e = await evaluateSwap(from, to, step.swap!.amountIn, plan.address);
  if (!e) return { reason: `No route to swap ${from.symbol} to ${to.symbol} right now`, minOut: 0n };
  if (!e.acceptable) {
    return { reason: `Swapping ${from.symbol} to ${to.symbol} would cost about ${e.costPct.toFixed(2)}%`, minOut: 0n };
  }
  return { reason: null, minOut: e.minOut };
}

export async function prepareForReview(plan: Plan): Promise<ReviewResult> {
  const checkedAt = Date.now();
  if (plan.blockers.length > 0 || plan.steps.length === 0) {
    return { ok: false, steps: [], problems: plan.blockers.map((b) => b.message), checkedAt };
  }
  const owner = plan.address;
  const moolah = moolahAddress();
  const problems: string[] = [];

  const tokens = new Set<string>();
  for (const s of plan.steps) {
    if (s.token) tokens.add(s.token);
    if (s.swap) {
      tokens.add(s.swap.from);
      tokens.add(s.swap.to);
    }
  }
  const bal = new Map<string, bigint>();
  const allow = new Map<string, bigint>();
  await Promise.all(
    [...tokens].map(async (t) => {
      const [b, a] = await Promise.all([
        erc20Balance(t as Address, owner),
        erc20Allowance(t as Address, owner, moolah),
      ]);
      bal.set(key(t), b);
      allow.set(key(t), a);
    }),
  );
  const [bnb, gasPrice] = await Promise.all([getChain().getBalance({ address: owner }), getGasPrice()]);

  let collateral = 0n;
  let debt = 0n;
  let available = 0n;
  let collateralDecimals = 18;
  let prices: { collateral: bigint; loan: bigint; loanDecimals: number } | null = null;
  if (plan.market) {
    const { params } = plan.market;
    const [state, position, cd, pc, pl] = await Promise.all([
      getMarketState(plan.market.id),
      getPosition(plan.market.id, owner),
      erc20Decimals(params.collateralToken),
      peekPrice(params.oracle, params.collateralToken),
      peekPrice(params.oracle, params.loanToken),
    ]);
    collateral = position.collateral;
    debt = borrowSharesToAssets(position.borrowShares, state);
    available = availableLiquidity(state);
    collateralDecimals = cd;
    prices = { collateral: pc, loan: pl, loanDecimals: plan.market.loanDecimals };
  }

  const maxTotal = (col: bigint) =>
    prices && plan.market
      ? computeSizing({
          collateralRaw: col,
          collateralDecimals,
          collateralPrice: prices.collateral,
          loanPrice: prices.loan,
          loanDecimals: prices.loanDecimals,
          lltv: plan.market.params.lltv,
          existingDebt: 0n,
          availableLiquidity: 0n,
          session: { marketOpen: true, assetReasonCode: null },
        }).maxBorrowTotal
      : 0n;

  const results: StepCheck[] = [];
  const short = (t: string, need: bigint, have: bigint) =>
    `Not enough ${t}: need ${need}, have ${have}`;

  for (const step of plan.steps) {
    let reason: string | null = null;
    const amount = step.amount ?? 0n;
    const tk = step.token ? key(step.token) : "";
    switch (step.kind) {
      case "approve":
        allow.set(tk, amount);
        break;
      case "supplyCollateral":
        if ((bal.get(tk) ?? 0n) < amount) reason = short("collateral in wallet", amount, bal.get(tk) ?? 0n);
        else if ((allow.get(tk) ?? 0n) < amount) reason = "Collateral is not approved yet";
        bal.set(tk, (bal.get(tk) ?? 0n) - amount);
        allow.set(tk, (allow.get(tk) ?? 0n) - amount);
        collateral += amount;
        break;
      case "borrow":
        if (available < amount) reason = `Only ${formatUnits(available, prices?.loanDecimals ?? 18)} is available to borrow now`;
        else if (debt + amount > maxTotal(collateral)) reason = "That borrow would go past the loan limit";
        available -= amount;
        debt += amount;
        bal.set(tk, (bal.get(tk) ?? 0n) + amount);
        break;
      case "repay":
        if ((bal.get(tk) ?? 0n) < amount) reason = short("loan token in wallet", amount, bal.get(tk) ?? 0n);
        else if ((allow.get(tk) ?? 0n) < amount) reason = "Loan token is not approved yet";
        bal.set(tk, (bal.get(tk) ?? 0n) - amount);
        debt = debt > amount ? debt - amount : 0n;
        break;
      case "withdrawCollateral":
        if (collateral < amount) reason = "That is more collateral than is deposited";
        else if (debt > 0n && debt > maxTotal(collateral - amount)) reason = "Withdrawing that much would put the loan at risk";
        collateral -= amount;
        bal.set(tk, (bal.get(tk) ?? 0n) + amount);
        break;
      case "swap": {
        const s = step.swap!;
        if ((bal.get(key(s.from)) ?? 0n) < s.amountIn) {
          reason = short(`${s.fromSymbol} in wallet`, s.amountIn, bal.get(key(s.from)) ?? 0n);
        } else {
          const re = await recheckSwap(plan, step);
          reason = re.reason;
        }
        bal.set(key(s.from), (bal.get(key(s.from)) ?? 0n) - s.amountIn);
        bal.set(key(s.to), (bal.get(key(s.to)) ?? 0n) + s.minOut);
        break;
      }
    }

    let check: StepCheck;
    if (reason) {
      check = { idx: step.idx, status: "check_failed", reason };
    } else if (step.idx === 0 && step.data && step.to) {
      const sim = await simulate({ from: owner, to: step.to, data: step.data, value: step.value });
      check = sim.ok
        ? { idx: 0, status: "simulated_ok", sim: sim.raw }
        : { idx: 0, status: "simulated_failed", reason: sim.revertReason, sim: sim.raw };
    } else {
      check = { idx: step.idx, status: "checked" };
    }
    results.push(check);
  }

  const needGas = gasPrice * GAS_PER_STEP * BigInt(plan.steps.length);
  if (bnb < needGas) {
    problems.push(`Keep about ${formatUnits(needGas, 18)} BNB for network fees; you have ${formatUnits(bnb, 18)}`);
  }
  for (const r of results) if (r.reason && (r.status === "check_failed" || r.status === "simulated_failed")) problems.push(`Step ${r.idx + 1}: ${r.reason}`);
  const ok = problems.length === 0 && results.every((r) => r.status === "checked" || r.status === "simulated_ok");
  return { ok, steps: results, problems, checkedAt };
}

export interface StepSimulation {
  ok: boolean;
  reason?: string;
  raw?: unknown;
}

/** Just-in-time simulation of one step against current chain state. */
export async function simulateStep(plan: Plan, idx: number): Promise<StepSimulation> {
  const step = plan.steps[idx];
  if (!step) return { ok: false, reason: "No such step" };
  if (step.data && step.to) {
    const sim = await simulate({ from: plan.address, to: step.to, data: step.data, value: step.value });
    return { ok: sim.ok, reason: sim.revertReason, raw: sim.raw };
  }
  if (step.swap) {
    const { from, to } = swapTokens(step);
    const e = await evaluateSwap(from, to, step.swap.amountIn, plan.address);
    if (!e) return { ok: false, reason: `No route to swap ${from.symbol} to ${to.symbol} right now` };
    if (!e.acceptable) return { ok: false, reason: `Swap would cost about ${e.costPct.toFixed(2)}%` };
    const built = await buildSwap({
      quote: e.quote,
      from: from.address,
      to: to.address,
      amount: step.swap.amountIn,
      userWalletAddress: plan.address,
      slippagePercent: SLIPPAGE_PERCENT,
    });
    if (!built.tx) return { ok: true, raw: { rfq: true } };
    const sim = await simulate({ from: plan.address, to: built.tx.to, data: built.tx.data, value: built.tx.value });
    return { ok: sim.ok, reason: sim.revertReason, raw: sim.raw };
  }
  return { ok: false, reason: "Step has nothing to simulate" };
}

