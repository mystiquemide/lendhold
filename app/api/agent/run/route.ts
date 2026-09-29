import { z } from "zod";
import { handle, json, parseBody } from "@/lib/api";
import { AgentError, getBaw } from "@/lib/agent/baw";
import { requireOperator } from "@/lib/agent/auth";
import { runAgentPlan } from "@/lib/agent/executor";
import { AppError } from "@/lib/errors";
import { loadPlan } from "@/lib/plan-store";
import { createRunFromPlan } from "@/lib/run-factory";

export const dynamic = "force-dynamic";

const body = z.object({ planId: z.uuid() });

export const POST = handle(async (req) => {
  requireOperator(req);
  const { planId } = await parseBody(req, body);
  const plan = loadPlan(planId);
  if (plan.blockers.length > 0 || plan.steps.length === 0) {
    throw new AppError("PLAN_BLOCKED", "This plan cannot be run", 409);
  }
  let agentAddress: string;
  try {
    agentAddress = await getBaw().walletAddress("56");
  } catch (err) {
    throw new AppError("AGENT_UNAVAILABLE", err instanceof AgentError ? err.message : "The agent wallet is not available", 503);
  }
  if (agentAddress.toLowerCase() !== plan.address.toLowerCase()) {
    throw new AppError("WRONG_WALLET", "This plan is for a different wallet than the agent's wallet", 400);
  }
  const run = createRunFromPlan(plan, "agent");
  void runAgentPlan(run.id).catch((err: unknown) => {
    console.error("Agent run crashed:", run.id, err instanceof Error ? err.message : String(err));
  });
  return json({ runId: run.id }, 202);
});
