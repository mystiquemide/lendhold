import { describe, expect, it } from "vitest";
import { buildSwap, getQuote, isQuoteAcceptable, type Quote } from "@/lib/binance/trading";
import { NVDAB, NVDAON, USDT, USER } from "../helpers";

const MSFTON = "0x6bfe75d1ad432050ea973c3a3dcd88f02e2444c3";
const usd = (n: number) => BigInt(Math.round(n * 1e6)) * 10n ** 12n;

interface RawQuote {
  fromToken: { tokenUnitPrice: string };
  toToken: { tokenUnitPrice: string };
}

/** Value received / value sent, from the quote's own unit prices (18-decimal tokens). */
function realizedRatio(q: Quote): number {
  const raw = q.raw as RawQuote;
  const sent = (Number(q.fromAmount) / 1e18) * Number(raw.fromToken.tokenUnitPrice);
  const got = (Number(q.toAmount) / 1e18) * Number(raw.toToken.tokenUnitPrice);
  return got / sent;
}

describe("live trading", () => {
  it("quotes USDT -> NVDAB, and the impact is a fraction matching the realized loss", async () => {
    const q = await getQuote({ from: USDT, to: NVDAB, amount: usd(50), userWalletAddress: USER });
    expect(q).not.toBeNull();
    expect(q!.toAmount).toBeGreaterThan(0n);
    expect(isQuoteAcceptable(q!)).toBe(true);
    expect(Math.abs(1 - realizedRatio(q!) - q!.priceImpact)).toBeLessThan(0.005);
  });

  it("quotes NVDAon -> USDT and returns null for NVDAon -> NVDAB", async () => {
    const sell = await getQuote({ from: NVDAON, to: USDT, amount: 10n ** 17n, userWalletAddress: USER });
    expect(sell).not.toBeNull();
    const issuerToIssuer = await getQuote({ from: NVDAON, to: NVDAB, amount: 10n ** 17n, userWalletAddress: USER });
    expect(issuerToIssuer).toBeNull();
  });

  it("rejects the MSFTon $50 buy and shows the fraction reading is right", async () => {
    const q = await getQuote({ from: USDT, to: MSFTON, amount: usd(50), userWalletAddress: USER });
    expect(q).not.toBeNull();
    console.log("MSFTon priceImpact:", q!.priceImpact, "realized value ratio:", realizedRatio(q!));
    expect(isQuoteAcceptable(q!)).toBe(false);
    expect(q!.priceImpact).toBeGreaterThan(0.5);
    expect(realizedRatio(q!)).toBeLessThan(0.01);
  });

  it("builds a USDT -> NVDAB swap", async () => {
    const amount = usd(50);
    const quote = await getQuote({ from: USDT, to: NVDAB, amount, userWalletAddress: USER });
    const swap = await buildSwap({ quote: quote!, from: USDT, to: NVDAB, amount, userWalletAddress: USER, slippagePercent: 1 });
    console.log("buildSwap keys:", Object.keys(swap.raw as object), "executionMode:", swap.executionMode, "rfq:", swap.rfq);
    expect(swap.tx).not.toBeNull();
    expect(swap.tx!.data.startsWith("0x")).toBe(true);
    expect(swap.tx!.value).toBe(0n);
    expect(swap.approval?.data.startsWith("0x095ea7b3")).toBe(true);
    expect(swap.minReceiveAmount).toBeGreaterThan(0n);
  });
});
