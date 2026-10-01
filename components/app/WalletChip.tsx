"use client";

import { useState } from "react";
import { Pill } from "@/components/ui/Pill";
import { Sheet } from "@/components/ui/Sheet";
import { useWallet } from "./WalletProvider";

function short(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function WalletChip() {
  const w = useWallet();
  const [open, setOpen] = useState(false);
  if (!w.address) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Wallet ${short(w.address)}, open wallet options`}
        className="flex min-h-11 items-center gap-2 rounded-pill bg-sheet px-4 font-mono text-[13px] leading-5 text-ink hover:bg-[#ececec]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {w.wallet && <img src={w.wallet.info.icon} alt="" width={20} height={20} className="size-5 rounded" />}
        {short(w.address)}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Your wallet">
        <p className="text-[13px] leading-5 text-muted">{w.wallet?.info.name}</p>
        <p className="mt-1 break-all font-mono text-[15px] leading-6 text-ink">{w.address}</p>
        <div className="mt-6 flex flex-col gap-3">
          <Pill variant="secondary" on="white" href={`https://bscscan.com/address/${w.address}`} external fullWidth>
            View on BscScan
          </Pill>
          <Pill
            variant="primary"
            fullWidth
            onClick={() => {
              setOpen(false);
              w.disconnect();
            }}
          >
            Disconnect
          </Pill>
        </div>
      </Sheet>
    </>
  );
}
