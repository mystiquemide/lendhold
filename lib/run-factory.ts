import "server-only";
import { AppError } from "@/lib/errors";
import { toJson } from "@/lib/json";
import type { Plan } from "@/lib/engine/planner";
import { createRun, getRun, upsertStep, type RunPath } from "@/lib/store/db";

export async function createRunFromPlan(plan: Plan, path: RunPath) {
  if (plan.blockers.length > 0 || plan.steps.length === 0) {
    throw new AppError("PLAN_BLOCKED", "This plan cannot be run", 409);
  }
  const run = await createRun({
    path,
    address: plan.address,
    action: plan.action,
    token: plan.token,
    marketId: plan.market?.id ?? null,
    planJson: toJson(plan),
  });
  for (const step of plan.steps) {
    await upsertStep({ runId: run.id, idx: step.idx, kind: step.kind, status: "pending" });
  }
  return (await getRun(run.id))!;
}
