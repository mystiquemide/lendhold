import { z } from "zod";
import { handle, json, parseBody } from "@/lib/api";
import { getChain } from "@/lib/chain";
import { AppError } from "@/lib/errors";
import { fromJson } from "@/lib/json";
import { verifyTx } from "@/lib/engine/verify";
import type { Plan } from "@/lib/engine/planner";
import { getBuiltTx, getRun, updateRunStatus, upsertStep } from "@/lib/store/db";

export const dynamic = "force-dynamic";

const body = z.object({
  idx: z.number().int().min(0),
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "txHash must be a 32-byte hex hash"),
});

export const POST = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { idx, txHash } = await parseBody(req, body);
  const run = getRun(id);
  if (!run) throw new AppError("RUN_NOT_FOUND", "Run not found", 404);
  if (!run.planJson || !run.address) throw new AppError("RUN_INVALID", "Run has no plan", 409);
  const plan = fromJson<Plan>(run.planJson);
  const step = plan.steps[idx];
  const existing = run.steps.find((s) => s.idx === idx);
  if (!step || !existing) throw new AppError("NO_SUCH_STEP", "That step does not exist", 404);

  if (existing.status === "confirmed") return json({ run });

  let expectedTo: string;
  let selector: string;
  if (step.kind === "swap") {
    const built = getBuiltTx(plan.id, idx);
    if (!built) {
      throw new AppError("SWAP_NOT_BUILT", "Build the swap through /api/swap/build first", 409);
    }
    expectedTo = built.to;
    selector = built.selector;
  } else {
    if (!step.to || !step.selector) throw new AppError("RUN_INVALID", "Step has no call to verify", 409);
    expectedTo = step.to;
    selector = step.selector;
  }

  const chain = getChain();
  const hash = txHash as `0x${string}`;
  let receipt;
  let tx;
  try {
    [receipt, tx] = await Promise.all([
      chain.getTransactionReceipt({ hash }),
      chain.getTransaction({ hash }),
    ]);
  } catch {
    throw new AppError("TX_NOT_FOUND", "That transaction was not found on BNB Chain (yet)", 422);
  }

  const result = verifyTx(
    { status: receipt.status, from: receipt.from, to: receipt.to, input: tx.input },
    { from: run.address, to: expectedTo, selector },
  );
  if (!result.ok) throw new AppError(result.code, result.message, 422);

  upsertStep({ runId: id, idx, kind: step.kind, status: "confirmed", txHash });
  const updated = getRun(id)!;
  const allDone = updated.steps.every((s) => s.status === "confirmed" || s.status === "skipped");
  updateRunStatus(id, allDone ? "done" : "running");
  return json({ run: getRun(id) });
});
