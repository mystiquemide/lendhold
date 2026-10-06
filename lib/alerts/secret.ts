import "server-only";
import { timingSafeEqual } from "node:crypto";

/** Constant-time check of a presented secret against an env var. False when the env var is unset. */
export function secretMatches(presented: string | null, envName: string): boolean {
  const expected = process.env[envName]?.trim();
  if (!expected || !presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
