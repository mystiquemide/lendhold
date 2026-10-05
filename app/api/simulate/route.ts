import { z } from "zod";
import { handle, json, parseBody } from "@/lib/api";
import { simulateStep } from "@/lib/engine/checks";
import { loadPlan } from "@/lib/plan-store";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const body = z.object({ planId: z.uuid(), idx: z.number().int().min(0) });

export const POST = handle(async (req) => {
  const { planId, idx } = await parseBody(req, body);
  const plan = await loadPlan(planId);
  if (idx >= plan.steps.length) throw new AppError("NO_SUCH_STEP", "That step does not exist", 404);
  return json({ planId, idx, ...(await simulateStep(plan, idx)) });
});
