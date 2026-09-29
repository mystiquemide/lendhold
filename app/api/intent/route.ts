import { z } from "zod";
import { handle, json, parseBody } from "@/lib/api";
import { requireOperator } from "@/lib/agent/auth";
import { interpretRequest } from "@/lib/intent";

export const dynamic = "force-dynamic";

const body = z.object({ text: z.string().trim().min(1).max(500) });

export const POST = handle(async (req) => {
  requireOperator(req);
  const { text } = await parseBody(req, body);
  return json(await interpretRequest(text));
});
