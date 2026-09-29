import { describe, expect, it } from "vitest";
import { loadConfig } from "@/lib/config.core";

describe("loadConfig", () => {
  it("applies defaults for optional keys", () => {
    const c = loadConfig({
      BINANCE_WEB3_API_KEY: "k",
      BINANCE_WEB3_API_SECRET: "s",
      OPERATOR_TOKEN: "",
    });
    expect(c.BSC_RPC_URL).toBe("https://bsc-dataseed.bnbchain.org");
    expect(c.AGENT_MAX_USD_PER_RUN).toBe(50);
    expect(c.DATABASE_PATH).toBe("./data/lendhold.db");
    expect(c.OPERATOR_TOKEN).toBeUndefined();
  });

  it("names the missing key without echoing values", () => {
    expect(() => loadConfig({ BINANCE_WEB3_API_KEY: "secret-value" })).toThrow(
      /BINANCE_WEB3_API_SECRET/,
    );
    try {
      loadConfig({ BINANCE_WEB3_API_KEY: "secret-value" });
    } catch (e) {
      expect(String(e)).not.toContain("secret-value");
    }
  });
});
