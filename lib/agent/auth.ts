import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { getConfig } from "@/lib/config";
import { AppError } from "@/lib/errors";

const digest = (v: string) => createHash("sha256").update(v).digest();

/** Constant-time comparison of two strings of any length. */
export function tokensMatch(given: string, expected: string): boolean {
  return timingSafeEqual(digest(given), digest(expected));
}

export function requireOperator(req: Request): void {
  const expected = getConfig().OPERATOR_TOKEN;
  if (!expected) throw new AppError("AGENT_DISABLED", "Agent routes are disabled on this server", 503);
  const given = req.headers.get("x-operator-token");
  if (!given || !tokensMatch(given, expected)) {
    throw new AppError("UNAUTHORIZED", "Missing or wrong operator token", 401);
  }
}
