import "server-only";
import { ZodError, type ZodType } from "zod";
import { AppError } from "@/lib/errors";
import { toApiJson } from "@/lib/json";
import { apiLimiter } from "@/lib/rate-limit";

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

export function json(body: unknown, status = 200): Response {
  return new Response(toApiJson(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export function errorResponse(err: unknown): Response {
  if (err instanceof AppError) {
    return json({ error: { code: err.code, message: err.message } }, err.status);
  }
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    const where = issue?.path.join(".") || "request";
    return json({ error: { code: "BAD_REQUEST", message: `${where}: ${issue?.message}` } }, 400);
  }
  console.error("Unhandled API error:", err instanceof Error ? err.message : String(err));
  return json({ error: { code: "INTERNAL", message: "Something went wrong on our side" } }, 500);
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Rate limits per IP and converts thrown errors to `{ error: { code, message } }`. */
export function handle<C = unknown>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    if (!apiLimiter.take(clientIp(req))) {
      return json({ error: { code: "RATE_LIMITED", message: "Too many requests, try again in a minute" } }, 429);
    }
    try {
      return await fn(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function parseQuery<T>(req: Request, schema: ZodType<T>): T {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  return schema.parse(params);
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new AppError("BAD_REQUEST", "Body must be valid JSON");
  }
  return schema.parse(raw);
}
