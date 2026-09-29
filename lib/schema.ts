import { getAddress } from "viem";
import { z } from "zod";

export const numeric = z
  .union([z.string(), z.number()])
  .transform((v, ctx) => {
    const n = typeof v === "number" ? v : Number(v);
    if (v === "" || !Number.isFinite(n)) {
      ctx.addIssue({ code: "custom", message: `not a finite number: ${String(v)}` });
      return z.NEVER;
    }
    return n;
  });

export const nullableNumeric = numeric.nullable().optional().transform((v) => v ?? null);

export const nullableString = z.string().nullable().optional().transform((v) => v ?? null);

export const nullableBool = z.boolean().nullable().optional().transform((v) => v ?? null);

export const evmAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "not an EVM address")
  .transform((v) => getAddress(v));

export const bigintString = z
  .union([z.string(), z.number(), z.bigint()])
  .transform((v, ctx) => {
    try {
      return BigInt(v);
    } catch {
      ctx.addIssue({ code: "custom", message: `not an integer: ${String(v)}` });
      return z.NEVER;
    }
  });
