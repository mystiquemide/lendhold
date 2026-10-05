import { z } from "zod";
import { handle, json, parseBody } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { buildSwap } from "@/lib/binance/trading";
import { evaluateSwap, SLIPPAGE_PERCENT, swapRejectionMessage } from "@/lib/engine/swap-eval";
import { loadPlan } from "@/lib/plan-store";
import { saveBuiltTx } from "@/lib/store/db";

export const dynamic = "force-dynamic";

const body = z.object({ planId: z.uuid(), idx: z.number().int().min(0) });

export const POST = handle(async (req) => {
  const { planId, idx } = await parseBody(req, body);
  const plan = await loadPlan(planId);
  const step = plan.steps[idx];
  if (!step) throw new AppError("NO_SUCH_STEP", "That step does not exist", 404);
  if (step.kind !== "swap" || !step.swap) {
    throw new AppError("NOT_A_SWAP", "That step is not a swap", 400);
  }
  const s = step.swap;
  const from = { address: s.from, symbol: s.fromSymbol, decimals: s.fromDecimals, usd: s.fromUsd };
  const to = { address: s.to, symbol: s.toSymbol, decimals: s.toDecimals, usd: s.toUsd };
  const evaluation = await evaluateSwap(from, to, s.amountIn, plan.address);
  if (!evaluation) {
    throw new AppError("NO_QUOTE", `No route to swap ${s.fromSymbol} to ${s.toSymbol} right now`, 409);
  }
  if (!evaluation.acceptable) {
    throw new AppError(
      "SWAP_COST_TOO_HIGH",
      swapRejectionMessage(s.fromSymbol, s.toSymbol, evaluation),
      409,
    );
  }
  const built = await buildSwap({
    quote: evaluation.quote,
    from: s.from,
    to: s.to,
    amount: s.amountIn,
    userWalletAddress: plan.address,
    slippagePercent: SLIPPAGE_PERCENT,
  });
  if (built.tx) {
    await saveBuiltTx({ planId, idx, to: built.tx.to, selector: built.tx.data.slice(0, 10) });
  }
  return json({
    planId,
    idx,
    executionMode: built.executionMode,
    tx: built.tx,
    approval: built.approval,
    rfq: built.rfq,
    minReceiveAmount: built.minReceiveAmount,
    expectedOut: evaluation.quote.toAmount,
    valueRatio: evaluation.valueRatio,
  });
});
