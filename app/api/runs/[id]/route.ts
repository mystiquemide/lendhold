import { handle, json } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { getRun } from "@/lib/store/db";

export const dynamic = "force-dynamic";

export const GET = handle(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const run = getRun(id);
  if (!run) throw new AppError("RUN_NOT_FOUND", "Run not found", 404);
  return json({ run });
});
