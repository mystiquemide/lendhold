import { z } from "zod";
import { handle, json, parseBody } from "@/lib/api";
import { prepareForReview } from "@/lib/engine/checks";
import { buildPlan } from "@/lib/engine/planner";
import { persistPlan, PLAN_TTL_MS } from "@/lib/plan-store";
import { evmAddress } from "@/lib/schema";

export const dynamic = "force-dynamic";

const amount = z.string().regex(/^(all|\d+(\.\d+)?)$/, "must be a decimal number or 'all'");

const body = z.object({
  address: evmAddress,
  action: z.enum(["borrow", "repay", "withdraw", "buy", "deposit"]),
  token: evmAddress,
  amount: amount.optional(),
  collateralAmount: amount.optional(),
  receive: z.enum(["USDT", "loan"]).optional(),
  withdraw: z.boolean().optional(),
  marketId: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
  /** False skips the on-chain checks, for quick re-plans while the amount is being typed. */
  check: z.boolean().default(true),
});

export const POST = handle(async (req) => {
  const { check, ...input } = await parseBody(req, body);
  const plan = await buildPlan(input);
  persistPlan(plan);
  const review = check ? await prepareForReview(plan) : null;
  return json({ plan, review, expiresAt: plan.createdAt + PLAN_TTL_MS });
});
