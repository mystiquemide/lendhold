import { describe, expect, it } from "vitest";
import { z } from "zod";
import { callApi, parseWith, unwrap } from "@/lib/binance/unwrap";
import { respond } from "./helpers";

describe("unwrap", () => {
  it("passes a bare payload through", async () => {
    expect(await unwrap(await respond([1, 2]))).toEqual([1, 2]);
  });
  it("unwraps an envelope", async () => {
    expect(await unwrap(await respond({ code: 0, msg: "ok", data: { a: 1 } }))).toEqual({ a: 1 });
  });
  it("does not unwrap a payload that merely has a data field", async () => {
    expect(await unwrap(await respond({ data: 5 }))).toEqual({ data: 5 });
  });
  it("validates with zod and names the failing path", async () => {
    await expect(
      callApi("thing", respond({ a: "x" }), z.object({ a: z.number() })),
    ).rejects.toThrow(/thing: unexpected response shape at a/);
    expect(parseWith(z.object({ a: z.number() }), { a: 1 }, "t")).toEqual({ a: 1 });
  });
});
