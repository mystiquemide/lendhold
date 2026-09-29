interface Entry {
  expires: number;
  value: Promise<unknown>;
}

const store = new Map<string, Entry>();

export async function cached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as Promise<T>;
  const value = load();
  store.set(key, { expires: Date.now() + ttlMs, value });
  value.catch(() => {
    if (store.get(key)?.value === value) store.delete(key);
  });
  return value;
}

export function clearCache(): void {
  store.clear();
}

export const LIST_TTL_MS = 60_000;
