const TAG = "bigint:";

/** Lossless JSON for storage: bigint values become tagged strings. */
export function toJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? `${TAG}${v}` : v));
}

export function fromJson<T>(text: string): T {
  return JSON.parse(text, (_k, v) =>
    typeof v === "string" && v.startsWith(TAG) && /^-?\d+$/.test(v.slice(TAG.length))
      ? BigInt(v.slice(TAG.length))
      : v,
  ) as T;
}

/** JSON for API responses: bigint values become plain decimal strings. */
export function toApiJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}
