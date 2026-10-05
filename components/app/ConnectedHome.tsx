"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatUnits } from "viem";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { Pill } from "@/components/ui/Pill";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import { api, fmtAmount, fmtShares, fmtUsd } from "@/lib/client/api";
import { useWallet } from "./WalletProvider";

interface Holding {
  address: string;
  symbol: string;
  name: string;
  logoUrl: string | null;
  ticker: string;
  platform: "bstock" | "ondo" | "xstocks";
  shares: number;
  valueUsd: number | null;
  status: "ready" | "convert" | "unsupported";
  reason: string;
  matchingBStock?: { address: string; symbol: string };
}

interface Position {
  marketId: string;
  name: string;
  ticker: string;
  logoUrl: string | null;
  loanSymbol: string;
  debt: string;
  loan: { decimals: number };
  collateral: { symbol: string; shares: number };
  risk: { health: "safe" | "watch" | "at_risk" };
}

const PLATFORM = { bstock: "bStocks", ondo: "Ondo", xstocks: "xStocks" } as const;

const HEALTH = {
  safe: { label: "Safe", cls: "bg-safe-tint text-safe" },
  watch: { label: "Watch", cls: "bg-watch-tint text-watch" },
  at_risk: { label: "At risk", cls: "bg-risk-tint text-risk" },
} as const;

function TokenIcon({ src, ticker }: { src: string | null; ticker: string }) {
  if (!src) {
    return (
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-canvas text-[13px] text-ink">
        {ticker.slice(0, 2)}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={40} height={40} className="size-10 shrink-0 rounded-full bg-canvas" />;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="px-2 text-sm leading-none uppercase tracking-[0.1em] text-[#333333]">{title}</h2>
      {children}
    </section>
  );
}

export function ConnectedHome() {
  const { address } = useWallet();
  const [holdings, setHoldings] = useState<Holding[] | null>(null);
  const [positions, setPositions] = useState<Position[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!address) return;
    setError(null);
    setHoldings(null);
    setPositions(null);
    try {
      const [h, p] = await Promise.all([
        api<{ holdings: Holding[] }>(`/api/holdings?address=${address}`),
        api<{ positions: Position[] }>(`/api/positions?address=${address}`),
      ]);
      setHoldings(h.holdings);
      setPositions(p.positions);
    } catch {
      setError("We can't reach Lendhold right now. Your wallet and loans are safe on BNB Chain.");
    }
  }, [address]);

  useEffect(() => {
    // Fetching on mount and when the account changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (error) {
    return (
      <Notice
        tone="risk"
        action={
          <Pill variant="secondary" on="white" onClick={load}>
            Try again
          </Pill>
        }
      >
        {error}
      </Notice>
    );
  }

  if (!holdings || !positions) {
    return (
      <div className="grid gap-3 lg:grid-cols-2" aria-busy="true" aria-label="Loading your stocks">
        <h1 className="sr-only">Your stocks</h1>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[88px] rounded-panel bg-sheet!" />
        ))}
      </div>
    );
  }

  const sorted = [...holdings].sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));

  return (
    <div className="flex flex-col gap-8">
      <h1 className="sr-only">Your loans and stocks</h1>
      {positions.length > 0 && (
        <Section title="Your loans">
          <ul className="grid gap-2 lg:grid-cols-2">
            {positions.map((p) => {
              const h = HEALTH[p.risk.health];
              return (
                <li key={p.marketId}>
                  <Link
                    href={`/app/loan/${p.marketId}`}
                    className="flex items-center gap-3 rounded-panel bg-sheet p-4 transition-colors duration-150 hover:bg-[#fbfbfb]"
                  >
                    <TokenIcon src={p.logoUrl} ticker={p.ticker} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-base leading-6 text-ink">{p.name}</p>
                        <span className={cn("rounded-pill px-2 py-0.5 text-xs leading-4", h.cls)}>{h.label}</span>
                      </div>
                      <p className="num text-[13px] leading-5 text-muted">
                        You owe {fmtAmount(Number(formatUnits(BigInt(p.debt), p.loan.decimals)))} {p.loanSymbol} ·{" "}
                        {fmtShares(p.collateral.shares)} shares held
                      </p>
                    </div>
                    <ChevronRight size={20} strokeWidth={1.75} className="shrink-0 text-muted" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <Section title="Your stocks">
        {sorted.length === 0 ? (
          <Panel className="flex flex-col gap-2 p-6">
            <p className="text-base leading-6 text-ink">No stock tokens in this wallet yet.</p>
            <p className="text-[15px] leading-6 text-body">
              Lendhold works with bStocks and Ondo tokens on BNB Chain. Switch to the wallet that holds them.
            </p>
          </Panel>
        ) : (
          <ul className="grid gap-2 lg:grid-cols-2">
            {sorted.map((h) => {
              const canBorrow = h.status !== "unsupported";
              return (
                <li key={h.address} className="flex flex-col gap-3 rounded-panel bg-sheet p-4">
                  <div className="flex items-center gap-3">
                    <TokenIcon src={h.logoUrl} ticker={h.ticker} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base leading-6 text-ink">{h.name}</p>
                      <p className="text-[13px] leading-5 text-muted">
                        {h.symbol} · {PLATFORM[h.platform]}
                      </p>
                    </div>
                    {canBorrow && (
                      <Pill variant="secondary" on="white" size="md" href={`/app/borrow/${h.address}`}>
                        Borrow
                      </Pill>
                    )}
                  </div>
                  <div className="num flex items-baseline justify-between gap-3 text-[15px] leading-5">
                    <span className="text-ink">{fmtShares(h.shares)} shares</span>
                    {canBorrow ? (
                      <span className="text-body">{h.valueUsd === null ? "Price unavailable" : fmtUsd(h.valueUsd)}</span>
                    ) : (
                      <span className="text-right text-muted">{h.reason}</span>
                    )}
                  </div>
                  {h.status === "convert" && h.matchingBStock && (
                    <p className="text-[13px] leading-5 text-muted">Converts to {h.matchingBStock.symbol} first</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}
