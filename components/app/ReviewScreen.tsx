"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, CircleCheck, CircleX } from "lucide-react";
import { formatUnits } from "viem";
import { Notice } from "@/components/ui/Notice";
import { Pill } from "@/components/ui/Pill";
import { Skeleton } from "@/components/ui/Skeleton";
import { api, ApiError, fmtAmount, fmtShares } from "@/lib/client/api";
import { cn } from "@/components/ui/cn";
import { PANE_LEFT_BOTTOM, PANE_LEFT_TOP, PANE_RIGHT, SPLIT } from "./split";
import { useWallet } from "./WalletProvider";

type Amount = { symbol: string; amount: string; decimals: number };

interface ReviewResponse {
  plan: {
    id: string;
    action: string;
    address: string;
    token: string;
    /** Missing on plans stored before this field existed. */
    request?: { amount?: string; collateralAmount?: string; receive?: "USDT" | "loan"; withdraw?: boolean; marketId?: string };
    market: { id: string; loanSymbol: string; loanDecimals: number; params: { lltv: string; oracle: string; loanToken: string; collateralToken: string } } | null;
    steps: {
      idx: number;
      label: string;
      kind: string;
      to?: string;
      amount?: string;
      swap?: { fromSymbol: string; amountIn: string; fromDecimals: number };
    }[];
    sizing: { safeBorrowNew: string } | null;
    blockers: { code: string; message: string }[];
    notices: { code: string; message: string }[];
    display: {
      sharesBefore: number | null;
      sharesAfter: number | null;
      receive: Amount | null;
      debt: Amount | null;
      aprPct: number | null;
      riskPricePerShare: number | null;
      conversionCostPct: number | null;
    };
  };
  review: {
    ok: boolean;
    steps: { idx: number; status: "simulated_ok" | "simulated_failed" | "checked" | "check_failed"; reason?: string }[];
    problems: string[];
  } | null;
  expiresAt: number;
  expired: boolean;
}

const amt = (a: Amount) => `${fmtAmount(Number(formatUnits(BigInt(a.amount), a.decimals)))} ${a.symbol}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const STATUS = {
  simulated_ok: { label: "Simulated", ok: true },
  checked: { label: "Checked", ok: true },
  simulated_failed: { label: "Simulation failed", ok: false },
  check_failed: { label: "Check failed", ok: false },
} as const;

const CONFIRM_LABEL: Record<string, string> = {
  borrow: "Confirm and borrow",
  repay: "Confirm and repay",
  deposit: "Confirm and deposit",
  withdraw: "Confirm and withdraw",
  buy: "Confirm and buy",
};

type Plan = ReviewResponse["plan"];
type TopRow = { label: string; value: string; note?: string; held?: boolean };

function Held() {
  return <span className="rounded-pill bg-safe-tint px-2 py-0.5 text-xs leading-4 text-safe">held</span>;
}

const RISK_NOTE = "Below this, part of your stock is sold to repay.";

/** The rows above the steps, in the terms of the action being reviewed. */
function topRows(plan: Plan): TopRow[] {
  const d = plan.display;
  const m = plan.market;
  const rows: TopRow[] = [];
  const owes = !!d.debt && BigInt(d.debt.amount) > 0n;
  const risk = (label: string) =>
    owes && d.riskPricePerShare != null ? [{ label, value: `Below $${fmtAmount(d.riskPricePerShare)} a share`, note: RISK_NOTE }] : [];
  const moved = d.sharesBefore != null && d.sharesAfter != null ? Math.abs(d.sharesAfter - d.sharesBefore) : null;

  switch (plan.action) {
    case "repay": {
      const step = plan.steps.find((s) => s.kind === "repay");
      const pay = step?.amount && m ? `${fmtAmount(Number(formatUnits(BigInt(step.amount), m.loanDecimals)))} ${m.loanSymbol}` : "All you owe";
      rows.push({ label: "You pay", value: pay });
      rows.push({ label: "You owe after", value: d.debt ? amt(d.debt) : `0.00 ${m?.loanSymbol ?? ""}`.trim() });
      rows.push(...risk("Risk price after"));
      break;
    }
    case "deposit": {
      if (d.sharesBefore != null) rows.push({ label: "Deposited before", value: `${fmtShares(d.sharesBefore)} shares` });
      if (d.sharesAfter != null) rows.push({ label: "Deposited after", value: `${fmtShares(d.sharesAfter)} shares`, held: true });
      if (plan.sizing && m) {
        rows.push({ label: "Safe to borrow after", value: `${fmtAmount(Number(formatUnits(BigInt(plan.sizing.safeBorrowNew), m.loanDecimals)))} ${m.loanSymbol}` });
      }
      rows.push(...risk("Risk price after"));
      break;
    }
    case "withdraw": {
      if (moved != null) rows.push({ label: "Back to your wallet", value: `${fmtShares(moved)} shares` });
      if (d.sharesAfter != null) rows.push({ label: "Still deposited", value: `${fmtShares(d.sharesAfter)} shares` });
      if (owes) rows.push({ label: "You owe", value: amt(d.debt!) });
      rows.push(...risk("Risk price after"));
      break;
    }
    case "buy": {
      const swap = plan.steps.find((s) => s.swap)?.swap;
      if (swap) rows.push({ label: "You pay", value: `${fmtAmount(Number(formatUnits(BigInt(swap.amountIn), swap.fromDecimals)))} ${swap.fromSymbol}` });
      if (d.sharesAfter != null) rows.push({ label: "You get about", value: `${fmtShares(d.sharesAfter)} shares`, held: true });
      break;
    }
    default: {
      if (d.sharesAfter != null) rows.push({ label: "You keep", value: `${fmtShares(d.sharesAfter)} shares`, held: true });
      if (d.receive) rows.push({ label: "You get", value: amt(d.receive) });
      if (d.debt) rows.push({ label: "You owe", value: amt(d.debt) });
      if (d.aprPct != null) rows.push({ label: "Interest", value: `${fmtAmount(d.aprPct)}% a year` });
      if (d.riskPricePerShare != null) rows.push({ label: "Risk price", value: `Below $${fmtAmount(d.riskPricePerShare)} a share`, note: RISK_NOTE });
    }
  }
  if (d.conversionCostPct != null) rows.push({ label: "Conversion cost", value: `${Math.max(d.conversionCostPct, 0).toFixed(2)}%` });
  return rows;
}

function Row({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="border-b border-line py-3.5">
      <div className="flex items-center justify-between gap-4 text-[15px] leading-5">
        <span className="text-body">{label}</span>
        <span className="num flex items-center gap-2 text-right text-ink">{value}</span>
      </div>
      {note && <p className="mt-1 text-[13px] leading-5 text-muted">{note}</p>}
    </div>
  );
}

function useCountdown(until: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  if (!until) return null;
  const left = Math.max(0, Math.floor((until - now) / 1000));
  return { left, text: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` };
}

export function ReviewScreen({ planId, amount, receive }: { planId: string; amount: string | null; receive: string | null }) {
  const { address } = useWallet();
  const router = useRouter();
  const [res, setRes] = useState<ReviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const countdown = useCountdown(res && !res.expired ? res.expiresAt : null);
  const expired = res?.expired || countdown?.left === 0;

  useEffect(() => {
    let live = true;
    api<ReviewResponse>(`/api/plan/${planId}`)
      .then((r) => live && setRes(r))
      .catch((err) => live && setError(err instanceof ApiError ? err.message : "Something went wrong on our side"));
    return () => {
      live = false;
    };
  }, [planId]);

  const refresh = useCallback(async () => {
    if (!res || !address) return;
    setRefreshing(true);
    setError(null);
    try {
      const r = await api<{ plan: { id: string } }>("/api/plan", {
        method: "POST",
        body: JSON.stringify({
          address,
          action: res.plan.action,
          token: res.plan.token,
          check: false,
          ...(res.plan.request ?? {
            ...(amount ? { amount } : {}),
            ...(receive === "USDT" || receive === "loan" ? { receive } : {}),
          }),
        }),
      });
      const q = new URLSearchParams({ ...(amount ? { amount } : {}), ...(receive ? { receive } : {}) });
      router.replace(`/app/review/${r.plan.id}?${q}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong on our side");
      setRefreshing(false);
    }
  }, [res, address, amount, receive, router]);

  if (error && !res) {
    return (
      <Notice tone="risk" action={<Pill variant="secondary" on="white" href="/app">Back to your stocks</Pill>}>
        {error}
      </Notice>
    );
  }
  if (!res) {
    return (
      <div aria-busy="true">
        <h1 className="sr-only">Review</h1>
        <Skeleton className="h-[560px] rounded-panel bg-sheet!" />
      </div>
    );
  }

  const { plan, review } = res;
  const notMine = address && plan.address.toLowerCase() !== address.toLowerCase();
  const checks = new Map((review?.steps ?? []).map((s) => [s.idx, s]));
  const problems = review && !review.ok ? review.problems : [];
  const canConfirm = !expired && !notMine && !!review?.ok && plan.steps.length > 0;
  const backHref =
    plan.action === "buy"
      ? `/app/buy/${plan.token}`
      : plan.action !== "borrow" && plan.market
        ? `/app/loan/${plan.market.id}`
        : `/app/borrow/${plan.token}`;

  return (
    <div className="flex flex-col gap-4">
      <Link href={backHref} className="inline-flex min-h-11 items-center gap-1 self-start text-[15px] leading-6 text-ink hover:underline">
        <ChevronLeft size={18} strokeWidth={1.75} aria-hidden="true" />
        {plan.action === "borrow" || plan.action === "buy" ? "Change amount" : "Back to your loan"}
      </Link>
      <div className={cn(SPLIT, "gap-6")}>
        <div className={cn(PANE_LEFT_TOP, "lg:gap-6")}>
          <h1 className="text-[26px] leading-8 tracking-[-0.01em] text-ink">Review</h1>

          <div className="-mt-3">
            {topRows(res.plan).map((r) => (
              <Row key={r.label} label={r.label} value={r.held ? <>{r.value}<Held /></> : r.value} note={r.note} />
            ))}
          </div>

          {plan.notices.map((n) => (
            <Notice key={n.code} tone="watch">
              {n.message}
            </Notice>
          ))}

        </div>

        <div className={cn(PANE_RIGHT, "lg:gap-6")}>
          {plan.steps.length > 0 && (
            <div>
              <h2 className="text-[13px] leading-5 text-muted">Steps your wallet will sign</h2>
              <ol className="mt-2 flex flex-col">
                {plan.steps.map((s, i) => {
                  const c = checks.get(s.idx);
                  const st = c ? STATUS[c.status] : null;
                  return (
                    <li key={s.idx} className="flex items-start gap-3 border-b border-line py-3 last:border-b-0">
                      <span className="num flex size-6 shrink-0 items-center justify-center rounded-full bg-canvas text-xs text-ink">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] leading-6 text-ink">{s.label}</p>
                        {c?.reason && <p className="text-[13px] leading-5 text-risk">{c.reason}</p>}
                      </div>
                      {st && (
                        <span className={`inline-flex shrink-0 items-center gap-1 text-[13px] leading-6 ${st.ok ? "text-safe" : "text-risk"}`}>
                          {st.ok ? (
                            <CircleCheck size={16} strokeWidth={1.75} aria-hidden="true" />
                          ) : (
                            <CircleX size={16} strokeWidth={1.75} aria-hidden="true" />
                          )}
                          {st.label}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {plan.market && (
            <details className="group rounded-panel bg-canvas">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-[15px] leading-6 text-ink [&::-webkit-details-marker]:hidden">
                Details
                <ChevronLeft size={18} strokeWidth={1.75} aria-hidden="true" className="-rotate-90 transition-transform duration-150 group-open:rotate-90" />
              </summary>
              <div className="px-4 pb-4 text-[13px] leading-5">
                {[
                  ["Lending market", short(plan.market.id)],
                  ["Liquidation threshold", `${Math.round((Number(plan.market.params.lltv) / 1e18) * 100)}%`],
                  ["Price oracle", short(plan.market.params.oracle)],
                  ["Collateral token", short(plan.market.params.collateralToken)],
                  ["Loan token", short(plan.market.params.loanToken)],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 py-1.5">
                    <span className="text-muted">{k}</span>
                    <span className="font-mono text-ink">{v}</span>
                  </div>
                ))}
              </div>
            </details>
          )}

        </div>

        <div className={cn(PANE_LEFT_BOTTOM, "lg:gap-6")}>
          {notMine && <Notice tone="risk">This plan was made for a different wallet. Go back and plan again.</Notice>}
          {plan.blockers.map((b) => (
            <Notice key={b.code} tone="risk">
              {b.message}
            </Notice>
          ))}
          {problems
            .filter((p) => !plan.blockers.some((b) => b.message === p))
            .map((p) => (
              <Notice key={p} tone="risk">
                {p}
              </Notice>
            ))}
          {error && <Notice tone="risk">{error}</Notice>}

          {expired ? (
            <div className="flex flex-col gap-3">
              <Notice tone="watch">Prices moved. Refresh the plan to see current numbers.</Notice>
              <Pill variant="primary" fullWidth loading={refreshing} onClick={refresh}>
                Refresh plan
              </Pill>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Pill variant="primary" fullWidth disabled={!canConfirm} onClick={() => router.push(`/app/run/new?plan=${plan.id}`)}>
                {CONFIRM_LABEL[plan.action] ?? "Confirm"}
              </Pill>
              {countdown && (
                <p className="num text-[13px] leading-5 text-muted" aria-live="off">
                  Plan valid for {countdown.text}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
