import { z } from "zod";
import { handle, json, parseBody, parseQuery } from "@/lib/api";
import { requireOperator } from "@/lib/agent/auth";
import { loadPlan } from "@/lib/plan-store";
import { createRunFromPlan } from "@/lib/run-factory";
import { listRunsWithSteps } from "@/lib/store/db";
import { evmAddress } from "@/lib/schema";

export const dynamic = "force-dynamic";

const createBody = z.object({
  planId: z.uuid(),
  path: z.enum(["browser", "agent", "skill"]).default("browser"),
});

const listQuery = z.object({
  address: evmAddress.optional(),
  path: z.enum(["browser", "agent", "skill"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const POST = handle(async (req) => {
  const { planId, path } = await parseBody(req, createBody);
  if (path === "agent") {
    requireOperator(req);
  }
  const plan = await loadPlan(planId);
  return json({ run: await createRunFromPlan(plan, path) }, 201);
});

export const GET = handle(async (req) => {
  const { address, path, limit } = parseQuery(req, listQuery);
  return json({ runs: await listRunsWithSteps({ address, path }, limit) });
});
