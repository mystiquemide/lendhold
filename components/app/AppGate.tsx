"use client";

import type { ReactNode } from "react";
import { Notice } from "@/components/ui/Notice";
import { Pill } from "@/components/ui/Pill";
import { Skeleton } from "@/components/ui/Skeleton";
import { ConnectPanel } from "./ConnectPanel";
import { useWallet } from "./WalletProvider";

/** Shows connect, then the wrong-network notice, then the screen. */
export function AppGate({ children }: { children: ReactNode }) {
  const w = useWallet();
  if (!w.ready) return <Skeleton className="h-[240px] rounded-panel bg-sheet!" />;
  if (!w.address) return <ConnectPanel />;
  if (!w.onBsc) {
    return (
      <Notice
        tone="watch"
        title="Wrong network"
        action={
          <Pill variant="primary" onClick={() => w.switchToBsc()}>
            Switch to BNB Chain
          </Pill>
        }
      >
        Lendhold runs on BNB Chain. Switch your wallet to continue.
        {w.error && <span className="mt-2 block text-risk">{w.error}</span>}
      </Notice>
    );
  }
  return <>{children}</>;
}
