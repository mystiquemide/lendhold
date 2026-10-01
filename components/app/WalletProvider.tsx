"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getAddress, type Address } from "viem";
import {
  BSC_ADD_PARAMS,
  BSC_CHAIN_HEX,
  BSC_CHAIN_ID,
  sortWallets,
  watchWallets,
  type WalletDetail,
} from "@/lib/wallet/eip6963";

const WALLET_KEY = "lendhold:wallet";
const ELIGIBLE_KEY = "lendhold:eligible";

function readStore(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStore(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked. The session still works without it.
  }
}

interface WalletState {
  /** False until the first client render, so the server and client agree. */
  ready: boolean;
  wallets: WalletDetail[];
  wallet: WalletDetail | null;
  address: Address | null;
  chainId: number | null;
  onBsc: boolean;
  eligible: boolean;
  connecting: string | null;
  error: string | null;
  connect(w: WalletDetail): Promise<void>;
  disconnect(): void;
  switchToBsc(): Promise<void>;
  confirmEligible(): void;
  clearError(): void;
}

const WalletContext = createContext<WalletState | null>(null);

function errorMessage(err: unknown): string {
  const e = err as { code?: number; message?: string };
  if (e?.code === 4001) return "You cancelled the request in your wallet.";
  if (e?.code === -32002) return "Your wallet already has a request open. Check the wallet window.";
  return "Your wallet didn't respond. Try again.";
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [wallets, setWallets] = useState<WalletDetail[]>([]);
  const [wallet, setWallet] = useState<WalletDetail | null>(null);
  const [address, setAddress] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [eligible, setEligible] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const restored = useRef(false);

  const attach = useCallback(async (w: WalletDetail, accounts: unknown) => {
    const list = Array.isArray(accounts) ? (accounts as string[]) : [];
    if (list.length === 0) return false;
    const chain = (await w.provider.request({ method: "eth_chainId" })) as string;
    setWallet(w);
    setAddress(getAddress(list[0]));
    setChainId(Number.parseInt(chain, 16));
    writeStore(WALLET_KEY, w.info.rdns);
    return true;
  }, []);

  useEffect(() => {
    // Reading browser-only state once on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
    setEligible(readStore(ELIGIBLE_KEY) === "yes");
    const last = readStore(WALLET_KEY);
    return watchWallets((w) => {
      setWallets((prev) => (prev.some((p) => p.info.uuid === w.info.uuid) ? prev : sortWallets([...prev, w])));
      if (!restored.current && last && w.info.rdns === last) {
        restored.current = true;
        w.provider
          .request({ method: "eth_accounts" })
          .then((accounts) => attach(w, accounts))
          .catch(() => writeStore(WALLET_KEY, null));
      }
    });
  }, [attach]);

  useEffect(() => {
    const p = wallet?.provider;
    if (!p?.on) return;
    const onAccounts = (accounts: string[]) => {
      if (accounts.length === 0) {
        setWallet(null);
        setAddress(null);
        setChainId(null);
        writeStore(WALLET_KEY, null);
      } else {
        setAddress(getAddress(accounts[0]));
      }
    };
    const onChain = (hex: string) => setChainId(Number.parseInt(hex, 16));
    p.on("accountsChanged", onAccounts);
    p.on("chainChanged", onChain);
    return () => {
      p.removeListener?.("accountsChanged", onAccounts);
      p.removeListener?.("chainChanged", onChain);
    };
  }, [wallet]);

  const connect = useCallback(
    async (w: WalletDetail) => {
      setError(null);
      setConnecting(w.info.uuid);
      try {
        const accounts = await w.provider.request({ method: "eth_requestAccounts" });
        if (!(await attach(w, accounts))) setError("Your wallet didn't share an account. Try again.");
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setConnecting(null);
      }
    },
    [attach],
  );

  const disconnect = useCallback(() => {
    wallet?.provider
      .request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] })
      .catch(() => {});
    setWallet(null);
    setAddress(null);
    setChainId(null);
    writeStore(WALLET_KEY, null);
  }, [wallet]);

  const switchToBsc = useCallback(async () => {
    if (!wallet) return;
    setError(null);
    try {
      await wallet.provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BSC_CHAIN_HEX }] });
    } catch (err) {
      if ((err as { code?: number })?.code === 4902) {
        try {
          await wallet.provider.request({ method: "wallet_addEthereumChain", params: [BSC_ADD_PARAMS] });
        } catch (addErr) {
          setError(errorMessage(addErr));
        }
      } else {
        setError(errorMessage(err));
      }
    }
  }, [wallet]);

  const confirmEligible = useCallback(() => {
    setEligible(true);
    writeStore(ELIGIBLE_KEY, "yes");
  }, []);

  const value = useMemo<WalletState>(
    () => ({
      ready,
      wallets,
      wallet,
      address,
      chainId,
      onBsc: chainId === BSC_CHAIN_ID,
      eligible,
      connecting,
      error,
      connect,
      disconnect,
      switchToBsc,
      confirmEligible,
      clearError: () => setError(null),
    }),
    [ready, wallets, wallet, address, chainId, eligible, connecting, error, connect, disconnect, switchToBsc, confirmEligible],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}
