import { describe, expect, it } from "vitest";
import { createBaw, ensureAgentReady } from "@/lib/agent/baw";
import { encodeApprove } from "@/lib/lista/calldata";

const MOOLAH = "0x8F73b65B4caAf64FBA2aF91cC5D4a2A1318E5D8C";
const USDT = "0x55d398326f99059fF775485246999027B3197955";
const baw = createBaw({ bin: process.env.BAW_BIN || "baw" });

describe("live baw (read-only)", () => {
  it("reads status, address and settings", async () => {
    expect(await baw.walletStatus()).toBe("CONNECTED");
    const address = await baw.walletAddress("56");
    expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    const s = await baw.walletSettings();
    expect(s.devMode.enabled).toBe(true);
    const ready = await ensureAgentReady(1, baw);
    console.log("ensureAgentReady(1):", JSON.stringify({ ok: ready.ok, blockers: ready.blockers, address: ready.address }));
  });

  it("previews an approve(Moolah, 1) on USDT without executing it", async () => {
    const from = await baw.walletAddress("56");
    const p = await baw.contractCallPreview({ from, to: USDT, inputData: encodeApprove(MOOLAH, 1n) });
    console.log("preview keys:", Object.keys(p), "parsedTx:", JSON.stringify(p.parsedTx), "risks:", JSON.stringify(p.risks), "requireConfirmation:", p.requireConfirmation);
    expect(p.requestId).toMatch(/^[0-9a-f]{16,}$/);
    expect(p.parsedTx?.transactionType).toBe("Approve");
    expect(p.requireConfirmation).toBe(false);
    expect(p.risks?.riskDetails ?? []).toEqual([]);
  });

  it("quotes a market order", async () => {
    const q = await baw.marketOrderQuote({ fromTokenQty: "1", fromToken: USDT, toToken: "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d", slippage: 0.5 });
    expect(Number(q.toCoinAmount)).toBeGreaterThan(0.9);
  });
});
