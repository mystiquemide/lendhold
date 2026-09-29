import { z } from "zod";
import { handle, json, parseBody, parseQuery } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { toJson } from "@/lib/json";
import { getConfig } from "@/lib/config";
import { loadPlan } from "@/lib/plan-store";
import { createRun, getRun, listRuns, listRunsByAddress, upsertStep } from "@/lib/store/db";
import { evmAddress } from "@/lib/schema";

export const dynamic = "force-dynamic";

const createBody = z.object({
  planId: z.uuid(),
  path: z.enum(["browser", "agent"]).default("browser"),
});

const listQuery = z.object({
  address: evmAddress.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const POST = handle(async (req) => {
  const { planId, path } = await parseBody(req, createBody);
  if (path === "agent") {
    const token = getConfig().OPERATOR_TOKEN;
    if (!token || req.headers.get("x-operator-token") !== token) {
      throw new AppError("UNAUTHORIZED", "Agent runs need the operator token", 401);
    }
  }
  const plan = loadPlan(planId);
  if (plan.blockers.length > 0 || plan.steps.length === 0) {
    throw new AppError("PLAN_BLOCKED", "This plan cannot be run", 409);
  }
  const run = createRun({
    path,
    address: plan.address,
    action: plan.action,
    token: plan.token,
    marketId: plan.market?.id ?? null,
    planJson: toJson(plan),
  });
  for (const step of plan.steps) {
    upsertStep({ runId: run.id, idx: step.idx, kind: step.kind, status: "pending" });
  }
  return json({ run: getRun(run.id) }, 201);
});

export const GET = handle(async (req) => {
  const { address, limit } = parseQuery(req, listQuery);
  return json({ runs: address ? listRunsByAddress(address, limit) : listRuns(limit) });
});
