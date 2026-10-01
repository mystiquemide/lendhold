import { afterEach, describe, expect, it, vi } from "vitest";
import { clearCache, withLastGood } from "@/lib/cache";

afterEach(() => {
  clearCache();
  vi.useRealTimers();
});

describe("withLastGood", () => {
  it("serves the last good value when a refresh fails", async () => {
    expect(await withLastGood("k", async () => 1)).toBe(1);
    expect(await withLastGood("k", async () => Promise.reject(new Error("rate limit")))).toBe(1);
  });

  it("rethrows once the last good value is older than 5 minutes", async () => {
    vi.useFakeTimers();
    await withLastGood("k", async () => 1);
    vi.advanceTimersByTime(5 * 60_000 + 1);
    await expect(withLastGood("k", async () => Promise.reject(new Error("rate limit")))).rejects.toThrow("rate limit");
  });

  it("rethrows when there was never a good value", async () => {
    await expect(withLastGood("k", async () => Promise.reject(new Error("down")))).rejects.toThrow("down");
  });
});
