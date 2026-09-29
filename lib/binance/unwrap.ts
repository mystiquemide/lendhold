import type { ZodType } from "zod";

export interface DataResponse {
  data(): Promise<unknown>;
}

function isEnvelope(value: unknown): value is { code: unknown; data: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "code" in value &&
    "data" in value
  );
}

/** The SDK types `.data()` as the response envelope but returns the bare payload. Accept both. */
export async function unwrap(res: DataResponse): Promise<unknown> {
  const body = await res.data();
  return isEnvelope(body) ? body.data : body;
}

export function parseWith<T>(schema: ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(
      `${label}: unexpected response shape at ${issue?.path.join(".") || "root"}: ${issue?.message}`,
    );
  }
  return result.data;
}

export async function callApi<T>(
  label: string,
  request: Promise<DataResponse>,
  schema: ZodType<T>,
): Promise<T> {
  return parseWith(schema, await unwrap(await request), label);
}
