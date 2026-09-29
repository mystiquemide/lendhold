import { describe, expect, it } from "vitest";
import { interpretRequest } from "@/lib/intent";

const KEY = process.env.OPENAI_API_KEY;

describe.skipIf(!KEY)("live intent", () => {
  it("borrow without selling NVIDIA", async () => {
    const r = await interpretRequest("I need $50 without selling my NVIDIA");
    console.log("borrow:", JSON.stringify(r));
    expect(r.intent).toMatchObject({ action: "borrow", ticker: "NVDA", amountUsd: 50 });
    // NVDA exists as bStock and Ondo, so the app must ask which
    expect(r.needsClarification).toMatch(/bStock or the Ondo/);
  });

  it("repay my loan", async () => {
    const r = await interpretRequest("repay my loan");
    console.log("repay:", JSON.stringify(r));
    expect(r.intent.action).toBe("repay");
    expect(r.needsClarification).toBeUndefined();
  });

  it("buy $20 of Tesla on bStocks", async () => {
    const r = await interpretRequest("buy $20 of Tesla on bStocks");
    console.log("buy:", JSON.stringify(r));
    expect(r.intent).toMatchObject({ action: "buy", ticker: "TSLA", issuer: "bstock", amountUsd: 20 });
    expect(r.token).toMatchObject({ platform: "bstock" });
  });
});
