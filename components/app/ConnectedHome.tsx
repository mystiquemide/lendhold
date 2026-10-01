"use client";

import { Panel } from "@/components/ui/Panel";
import { useWallet } from "./WalletProvider";

/** Placeholder until the Home screen (your loans and your stocks) lands in the next gate. */
export function ConnectedHome() {
  const { address } = useWallet();
  return (
    <Panel className="flex flex-col gap-2 p-8">
      <h1 className="text-[28px] leading-[34px] tracking-[-0.01em] text-ink">Connected</h1>
      <p className="break-all font-mono text-[13px] leading-5 text-muted">{address}</p>
      <p className="text-base leading-6 text-body">Your loans and your stocks show here next.</p>
    </Panel>
  );
}
