import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAddress } from "viem";
import { NVDAB, NVDAON } from "./helpers";

const m = vi.hoisted(() => ({ cfg: { OPENAI_API_KEY: "sk-test" as string | undefined, OPENAI_MODEL: "gpt-4.1-mini" }, listRwaTokens: vi.fn() }));
vi.mock("@/lib/config", () => ({ getConfig: () => m.cfg }));
vi.mock("@/lib/binance/rwa", () => ({ listRwaTokens: (...a: unknown[]) => m.listRwaTokens(...a) }));

import { interpretRequest, resolveIntent } from "@/lib/intent";

const tok = (address: string, symbol: string, ticker: string, platformId: "ondo" | "bstock") => ({ address: getAddress(address), symbol, name: "n", platformId, ticker, decimals: 18, ratio: 1, logoUrl: null });
const TSLAB = "0x3333333333333333333333333333333333333333";
const TSLAON = "0x4444444444444444444444444444444444444444";
const lists = {
  bstock: [tok(NVDAB, "NVDAB", "NVDA", "bstock"), tok(TSLAB, "TSLAB", "TSLA", "bstock")],
  ondo: [tok(NVDAON, "NVDAon", "NVDA", "ondo"), tok(TSLAON, "TSLAon", "TSLA", "ondo"), tok("0x5555555555555555555555555555555555555555", "AMZNon", "AMZN", "ondo")],
};

const reply = (content: unknown) => vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content), refusal: null } }] }));

beforeEach(() => {
  m.cfg.OPENAI_API_KEY = "sk-test";
  m.listRwaTokens.mockReset();
  m.listRwaTokens.mockImplementation(async (p: "ondo" | "bstock") => lists[p]);
});

describe("interpretRequest", () => {
  it("turns three sentences into intents with resolved tokens", async () => {
    // "I need $50 without selling my Amazon shares" -> Ondo only exists for AMZN, so no clarification is needed
    const borrow = await interpretRequest("I need $50 without selling my Amazon shares", reply({ action: "borrow", ticker: "amzn", issuer: null, amountUsd: 50 }));
    expect(borrow).toMatchObject({ intent: { action: "borrow", ticker: "AMZN", amountUsd: 50 }, token: { symbol: "AMZNon", platform: "ondo" } });

    const repay = await interpretRequest("repay my loan", reply({ action: "repay", ticker: null, issuer: null, amountUsd: null }));
    expect(repay).toEqual({ intent: { action: "repay", ticker: null, issuer: null, amountUsd: null }, token: null });

    const buy = await interpretRequest("buy $20 of Tesla on bStocks", reply({ action: "buy", ticker: "TSLA", issuer: "bstock", amountUsd: 20 }));
    expect(buy).toMatchObject({ intent: { action: "buy", ticker: "TSLA", issuer: "bstock", amountUsd: 20 }, token: { address: getAddress(TSLAB), symbol: "TSLAB", platform: "bstock" } });
    expect(buy.needsClarification).toBeUndefined();
  });

  it("sends only the sentence with a strict schema, and never token data", async () => {
    const f = reply({ action: "status", ticker: null, issuer: null, amountUsd: null });
    await interpretRequest("how is my loan doing", f);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer sk-test");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("gpt-4.1-mini");
    expect(body.temperature).toBe(0);
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.schema.required).toEqual(["action", "ticker", "issuer", "amountUsd"]);
    expect(body.messages.map((x: { role: string }) => x.role)).toEqual(["system", "user"]);
    expect(body.messages[1].content).toBe("how is my loan doing");
    const wire = JSON.stringify(body).toLowerCase();
    expect(wire).not.toContain("0x02fca");
    expect(wire).not.toContain(NVDAB.toLowerCase());
  });

  it("asks which stock when the ticker is unknown or missing for borrow and buy", async () => {
    const unknown = await interpretRequest("borrow against Zzzz", reply({ action: "borrow", ticker: "ZZZZ", issuer: null, amountUsd: null }));
    expect(unknown).toMatchObject({ needsClarification: "Which stock do you mean?", token: null });
    const missing = await interpretRequest("I need cash", reply({ action: "borrow", ticker: null, issuer: null, amountUsd: 10 }));
    expect(missing.needsClarification).toBe("Which stock do you mean?");
  });

  it("asks which issuer when a ticker exists under both and none was named", async () => {
    const r = await interpretRequest("borrow against Nvidia", reply({ action: "borrow", ticker: "NVDA", issuer: null, amountUsd: null }));
    expect(r.needsClarification).toBe("Do you mean the bStock or the Ondo token for NVDA?");
    expect(r.token).toBeNull();
  });

  it("honours a named issuer and complains when that issuer has no such token", async () => {
    expect((await interpretRequest("x", reply({ action: "borrow", ticker: "NVDA", issuer: "ondo", amountUsd: null }))).token).toMatchObject({ symbol: "NVDAon" });
    const none = await interpretRequest("x", reply({ action: "buy", ticker: "AMZN", issuer: "bstock", amountUsd: 5 }));
    expect(none.needsClarification).toContain("no bStock for AMZN");
  });

  it("drops non-positive amounts", async () => {
    const r = await interpretRequest("x", reply({ action: "buy", ticker: "TSLA", issuer: "bstock", amountUsd: -5 }));
    expect(r.intent.amountUsd).toBeNull();
  });

  it("is disabled without a key", async () => {
    m.cfg.OPENAI_API_KEY = undefined;
    await expect(interpretRequest("x", reply({}))).rejects.toMatchObject({ code: "INTENT_DISABLED", status: 503 });
  });

  it("fails cleanly on HTTP errors, refusals and malformed answers", async () => {
    await expect(interpretRequest("x", vi.fn().mockResolvedValue(new Response("nope", { status: 429 })))).rejects.toMatchObject({ code: "INTENT_FAILED", status: 502 });
    await expect(interpretRequest("x", vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: null, refusal: "no" } }] })))).rejects.toMatchObject({ code: "INTENT_FAILED" });
    await expect(interpretRequest("x", reply("not json"))).rejects.toMatchObject({ code: "INTENT_FAILED" });
    await expect(interpretRequest("x", reply({ action: "sell", ticker: null, issuer: null, amountUsd: null }))).rejects.toMatchObject({ code: "INTENT_FAILED" });
    await expect(interpretRequest("x", vi.fn().mockRejectedValue(new Error("net")))).rejects.toMatchObject({ code: "INTENT_FAILED" });
  });
});

describe("resolveIntent", () => {
  it("needs no stock for status or repay", async () => {
    expect(await resolveIntent({ action: "status", ticker: null, issuer: null, amountUsd: null })).toMatchObject({ token: null });
  });
});
