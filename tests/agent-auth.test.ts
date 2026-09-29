import { beforeEach, describe, expect, it, vi } from "vitest";

const cfg = vi.hoisted(() => ({ OPERATOR_TOKEN: undefined as string | undefined }));
vi.mock("@/lib/config", () => ({ getConfig: () => cfg }));

import { requireOperator, tokensMatch } from "@/lib/agent/auth";

const req = (token?: string) => new Request("http://x/api/agent/status", { headers: token ? { "x-operator-token": token } : {} });

beforeEach(() => {
  cfg.OPERATOR_TOKEN = undefined;
});

describe("operator auth", () => {
  it("compares tokens of any length", () => {
    expect(tokensMatch("abc", "abc")).toBe(true);
    expect(tokensMatch("abc", "abd")).toBe(false);
    expect(tokensMatch("a", "a much longer token")).toBe(false);
    expect(tokensMatch("", "x")).toBe(false);
  });

  it("returns 503 AGENT_DISABLED when no token is configured", () => {
    expect(() => requireOperator(req("anything"))).toThrowError(expect.objectContaining({ code: "AGENT_DISABLED", status: 503 }));
  });

  it("returns 401 for a missing or wrong token and passes the right one", () => {
    cfg.OPERATOR_TOKEN = "s3cret-token";
    expect(() => requireOperator(req())).toThrowError(expect.objectContaining({ code: "UNAUTHORIZED", status: 401 }));
    expect(() => requireOperator(req("nope"))).toThrowError(expect.objectContaining({ code: "UNAUTHORIZED", status: 401 }));
    expect(() => requireOperator(req("s3cret-token"))).not.toThrow();
  });
});
