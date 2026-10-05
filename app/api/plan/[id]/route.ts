import { handle, json } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { prepareForReview } from "@/lib/engine/checks";
import { loadPlan, PLAN_TTL_MS } from "@/lib/plan-store";

export const dynamic = "force-dynamic";

/** A saved plan with fresh on-chain checks. Expired plans come back without checks so the screen can offer a refresh. */
export const GET = handle(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError("PLAN_NOT_FOUND", "Plan not found", 404);
  const plan = loadPlan(id, { allowExpired: true });
  const expiresAt = plan.createdAt + PLAN_TTL_MS;
  const expired = Date.now() > expiresAt;
  return json({ plan, review: expired ? null : await prepareForReview(plan), expiresAt, expired });
});
