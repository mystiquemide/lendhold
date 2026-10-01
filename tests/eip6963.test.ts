import { describe, expect, it } from "vitest";
import { sortWallets, type WalletDetail } from "@/lib/wallet/eip6963";

const w = (name: string, rdns: string): WalletDetail => ({
  info: { uuid: name, name, icon: "", rdns },
  provider: { request: async () => null },
});

describe("sortWallets", () => {
  it("puts Binance Wallet first, then sorts by name", () => {
    const out = sortWallets([w("Rabby", "io.rabby"), w("MetaMask", "io.metamask"), w("Binance Wallet", "com.binance.wallet")]);
    expect(out.map((x) => x.info.name)).toEqual(["Binance Wallet", "MetaMask", "Rabby"]);
  });
});
