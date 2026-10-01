export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, handler: (...args: never[]) => void): void;
  removeListener?(event: string, handler: (...args: never[]) => void): void;
}

export interface WalletInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export interface WalletDetail {
  info: WalletInfo;
  provider: Eip1193Provider;
}

interface AnnounceEvent extends Event {
  detail: WalletDetail;
}

/** Listens for EIP-6963 wallet announcements and asks wallets to announce. Returns an unsubscribe function. */
export function watchWallets(onWallet: (w: WalletDetail) => void): () => void {
  const handler = (e: Event) => {
    const detail = (e as AnnounceEvent).detail;
    if (detail?.info?.uuid && detail.provider) onWallet(detail);
  };
  window.addEventListener("eip6963:announceProvider", handler);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  return () => window.removeEventListener("eip6963:announceProvider", handler);
}

export function isBinanceWallet(info: WalletInfo): boolean {
  return /binance/i.test(info.rdns) || /binance/i.test(info.name);
}

/** Binance Wallet first, then the rest by name. */
export function sortWallets(list: WalletDetail[]): WalletDetail[] {
  return [...list].sort((a, b) => {
    const ab = isBinanceWallet(a.info) ? 0 : 1;
    const bb = isBinanceWallet(b.info) ? 0 : 1;
    return ab - bb || a.info.name.localeCompare(b.info.name);
  });
}

export const BSC_CHAIN_ID = 56;
export const BSC_CHAIN_HEX = "0x38";

export const BSC_ADD_PARAMS = {
  chainId: BSC_CHAIN_HEX,
  chainName: "BNB Smart Chain",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: ["https://bsc-dataseed.bnbchain.org"],
  blockExplorerUrls: ["https://bscscan.com"],
};
