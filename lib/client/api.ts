/** Fetches a Lendhold API route and throws the server's message on failure. */
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  } catch {
    throw new ApiError("NETWORK", "We can't reach Lendhold right now.", 0);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(body?.error?.code ?? "HTTP", body?.error?.message ?? "Something went wrong on our side", res.status);
  }
  return body as T;
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const four = new Intl.NumberFormat("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const two = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtUsd = (n: number) => usd.format(n);
export const fmtShares = (n: number) => four.format(n);
export const fmtAmount = (n: number) => two.format(n);
