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
import { summarizePortfolio } from "@/lib/engine/portfolio";
import { HEALTH, TokenIcon } from "./token";
import { AlertsLink } from "./AlertsLink";
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
  aprPct: number;
  risk: { health: "safe" | "watch" | "at_risk"; collateralUsd: number; debtUsd: number; cushion: number | null };
}

/** NVIDIA bStock: the most liquid bStock, used as the default first buy. */
const NVDAB = "0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436";

const PLATFORM = { bstock: "bStocks", ondo: "Ondo", xstocks: "xStocks" } as const;


function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="px-2 text-sm leading-none uppercase tracking-[0.1em] text-[#333333]">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-[13px] leading-5 text-muted">{label}</dt>
      <dd className="num text-[22px] leading-7 text-ink">{value}</dd>
    </div>
  );
}

function PortfolioSummary({ positions, address }: { positions: Position[]; address: string | null }) {
  const p = summarizePortfolio(positions);
  const w = p.weakest;
  return (
    <Panel className="flex flex-col gap-4 p-5">
      <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="You owe" value={fmtUsd(p.debtUsd)} />
        <Stat label="Stocks held as collateral" value={fmtUsd(p.collateralUsd)} />
        <Stat label="Borrowed of value" value={`${(p.ltv * 100).toFixed(1)}%`} />
        <Stat label="Average rate" value={p.aprPct === null ? "None" : `${p.aprPct.toFixed(2)}% APR`} />
      </dl>
      {w && (
        <p className="text-[13px] leading-5 text-body">
          Closest to the line:{" "}
          <Link href={`/app/loan/${w.marketId}`} className="text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
            {w.ticker}
          </Link>
          , {(w.cushion * 100).toFixed(1)}% price drop before part is sold. Each loan is its own Lista market, so one loan
          getting close doesn&apos;t touch the others.
        </p>
      )}
      {p.debtUsd > 0 && <AlertsLink address={address} />}
    </Panel>
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
      <div className="mx-auto w-full max-w-[560px]">
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
      </div>
    );
  }

  if (!holdings || !positions) {
    return (
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2" aria-busy="true" aria-label="Loading your stocks">
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
          <PortfolioSummary positions={positions} address={address} />
          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
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
              Lendhold works with bStocks and Ondo tokens on BNB Chain. Switch to the wallet that holds them, buy
              one here, or look around with a sample wallet.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Pill variant="primary" size="md" href={`/app/buy/${NVDAB}`}>
                Buy a stock
              </Pill>
              <Pill variant="secondary" on="white" size="md" href="/app?sample=1">
                Explore the sample wallet
              </Pill>
            </div>
          </Panel>
        ) : (
          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
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
