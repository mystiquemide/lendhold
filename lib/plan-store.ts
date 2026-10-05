import "server-only";
import { AppError } from "@/lib/errors";
import { fromJson, toJson } from "@/lib/json";
import { getPlanRow, savePlan } from "@/lib/store/db";
import type { Plan } from "@/lib/engine/planner";

export const PLAN_TTL_MS = 10 * 60 * 1000;

export async function persistPlan(plan: Plan): Promise<void> {
  await savePlan({ id: plan.id, address: plan.address, json: toJson(plan) });
}

export async function loadPlan(id: string, opts: { allowExpired?: boolean } = {}): Promise<Plan> {
  const row = await getPlanRow(id);
  if (!row) throw new AppError("PLAN_NOT_FOUND", "Plan not found", 404);
  if (!opts.allowExpired && Date.now() - row.createdAt > PLAN_TTL_MS) {
    throw new AppError("PLAN_EXPIRED", "This plan has expired. Review it again to continue.", 410);
  }
  return fromJson<Plan>(row.json);
}
