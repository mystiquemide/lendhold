"use client";

import { Eye } from "lucide-react";
import { SAMPLE_WALLET, useWallet } from "./WalletProvider";

/** Says when the app is showing a read-only wallet, with a way back to your own. */
export function ReadOnlyBanner() {
  const w = useWallet();
  if (!w.ready || !w.readOnly) return null;
  return (
    <div role="status" className="mx-auto mb-4 flex w-full max-w-[480px] items-center gap-3 rounded-panel bg-sheet px-4 py-3 lg:max-w-[1040px]">
      <Eye size={18} strokeWidth={1.75} className="shrink-0 text-ink" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-[13px] leading-5 text-body">
        {w.address === SAMPLE_WALLET ? (
          <>
            <span className="text-ink">Sample view, read only.</span> These are the stock tokens held by Lista Lending&apos;s
            contract. Nothing can be signed.
          </>
        ) : (
          <>
            <span className="text-ink">Read-only view.</span> Real balances and plans. Nothing can be signed.
          </>
        )}
      </p>
      <button type="button" onClick={w.disconnect} className="min-h-11 shrink-0 text-[13px] leading-5 text-ink underline underline-offset-4">
        Use my wallet
      </button>
    </div>
  );
}
