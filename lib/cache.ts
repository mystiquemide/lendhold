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
  lastGood.clear();
}

export const LIST_TTL_MS = 60_000;

const LAST_GOOD_MS = 5 * 60_000;
const lastGood = new Map<string, { at: number; value: unknown }>();

/** Serves the last good value, up to 5 minutes old, when a refresh fails (usually a rate limit). */
export async function withLastGood<T>(key: string, load: () => Promise<T>): Promise<T> {
  try {
    const value = await load();
    lastGood.set(key, { at: Date.now(), value });
    return value;
  } catch (err) {
    const hit = lastGood.get(key);
    if (hit && Date.now() - hit.at < LAST_GOOD_MS) return hit.value as T;
    throw err;
  }
}
