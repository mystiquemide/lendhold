import { describe, expect, it } from "vitest";
import { verifyTx } from "@/lib/engine/verify";
import { RateLimiter } from "@/lib/rate-limit";
import { fromJson, toApiJson, toJson } from "@/lib/json";

const expected = {
  from: "0x1111111111111111111111111111111111111111",
  to: "0x8F73b65B4caAf64FBA2aF91cC5D4a2A1318E5D8C",
  selector: "0x238d6579",
};
const good = {
  status: "success" as const,
  from: expected.from.toUpperCase().replace("0X", "0x"),
  to: expected.to.toLowerCase(),
  input: "0x238d657900000000",
};

describe("verifyTx", () => {
  it("accepts a matching receipt regardless of address case", () => {
    expect(verifyTx(good, expected)).toEqual({ ok: true });
  });
  it("rejects reverted transactions", () => {
    expect(verifyTx({ ...good, status: "reverted" }, expected)).toMatchObject({ ok: false, code: "TX_REVERTED" });
  });
  it("rejects a different sender", () => {
    expect(verifyTx({ ...good, from: "0x2222222222222222222222222222222222222222" }, expected)).toMatchObject({ code: "TX_WRONG_SENDER" });
  });
  it("rejects a different target or a contract creation", () => {
    expect(verifyTx({ ...good, to: "0x2222222222222222222222222222222222222222" }, expected)).toMatchObject({ code: "TX_WRONG_TARGET" });
    expect(verifyTx({ ...good, to: null }, expected)).toMatchObject({ code: "TX_WRONG_TARGET" });
  });
  it("rejects a different function selector", () => {
    expect(verifyTx({ ...good, input: "0x095ea7b300" }, expected)).toMatchObject({ code: "TX_WRONG_CALL" });
    expect(verifyTx({ ...good, input: "0x" }, expected)).toMatchObject({ code: "TX_WRONG_CALL" });
  });
});

describe("verifyTx with a partial expectation", () => {
  it("skips the target and function checks when they are not given, but still checks sender and success", () => {
    const anywhere = { ...good, to: "0x9999999999999999999999999999999999999999", input: "0xdeadbeef" };
    expect(verifyTx(anywhere, { from: expected.from })).toEqual({ ok: true });
    expect(verifyTx({ ...anywhere, status: "reverted" }, { from: expected.from })).toMatchObject({ code: "TX_REVERTED" });
    expect(verifyTx({ ...anywhere, from: "0x2222222222222222222222222222222222222222" }, { from: expected.from })).toMatchObject({ code: "TX_WRONG_SENDER" });
    expect(verifyTx({ ...anywhere, to: null }, { from: expected.from })).toEqual({ ok: true });
  });
});

describe("RateLimiter", () => {
  it("allows the capacity, then blocks, then refills", () => {
    let now = 0;
    const l = new RateLimiter({ capacity: 3, refillPerMinute: 60, now: () => now });
    expect([l.take("a"), l.take("a"), l.take("a"), l.take("a")]).toEqual([true, true, true, false]);
    now += 1000; // 1 token per second
    expect(l.take("a")).toBe(true);
    expect(l.take("a")).toBe(false);
  });
  it("keeps keys independent and caps refill at capacity", () => {
    let now = 0;
    const l = new RateLimiter({ capacity: 2, refillPerMinute: 60, now: () => now });
    l.take("a");
    l.take("a");
    expect(l.take("a")).toBe(false);
    expect(l.take("b")).toBe(true);
    now += 10 * 60_000;
    expect([l.take("a"), l.take("a"), l.take("a")]).toEqual([true, true, false]);
  });
});

describe("json", () => {
  it("round-trips bigint losslessly for storage", () => {
    const v = { a: 123456789012345678901234567890n, b: [1n, "x"], c: null };
    expect(fromJson(toJson(v))).toEqual(v);
  });
  it("serializes bigint as plain strings for the API", () => {
    expect(JSON.parse(toApiJson({ a: 5n, b: { c: 7n } }))).toEqual({ a: "5", b: { c: "7" } });
  });
});
