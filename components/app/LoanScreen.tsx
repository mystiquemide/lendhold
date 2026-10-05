"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronLeft } from "lucide-react";
import { formatUnits } from "viem";
import { CushionRuler } from "@/components/ui/CushionRuler";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { Pill } from "@/components/ui/Pill";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import { api, ApiError, fmtAmount, fmtShares, fmtUsd } from "@/lib/client/api";
import { HEALTH, TokenIcon } from "./token";
import { useWallet } from "./WalletProvider";

interface Position {
  marketId: string;
  name: string;
  ticker: string;
  logoUrl: string | null;
  loanSymbol: string;
  params: { lltv: string; oracle: string; loanToken: string; collateralToken: string };
  collateral: { address: string; symbol: string; decimals: number; amount: string; shares: number };
  loan: { address: string; decimals: number };
  debt: string;
  aprPct: number;
  risk: {
    collateralUsd: number;
    debtUsd: number;
    lltv: number;
    liquidationPricePerShare: number | null;
    cushion: number | null;
    health: "safe" | "watch" | "at_risk";
  };
  sizing: { safeBorrowNew: string; buffer: number };
}

interface Balance {
  amount: string;
  decimals: number;
}

type SheetKind = "repay" | "deposit" | "withdraw";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
/** Rounded down to `places`, so a prefilled amount never exceeds what it came from. */
const floorTo = (n: number, places: number) => {
  const f = 10 ** places;
  return (Math.floor(n * f) / f).toFixed(places);
};

function Row({ label, value, held }: { label: string; value: string; held?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-3.5 text-[15px] leading-5 last:border-b-0">
      <span className="text-body">{label}</span>
      <span className="num flex items-center gap-2 text-right text-ink">
        {value}
        {held && <span className="rounded-pill bg-safe-tint px-2 py-0.5 text-xs leading-4 text-safe">held</span>}
      </span>
    </div>
  );
}

export function LoanScreen({ marketId }: { marketId: string }) {
  const { address } = useWallet();
  const [pos, setPos] = useState<Position | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetKind | null>(null);

  const load = useCallback(async () => {
    if (!address) return;
    setError(null);
    try {
      const r = await api<{ positions: Position[] }>(`/api/positions?address=${address}`);
      setPos(r.positions.find((p) => p.marketId.toLowerCase() === marketId.toLowerCase()) ?? null);
    } catch {
      setError("We can't reach Lendhold right now. Your wallet and loans are safe on BNB Chain.");
    }
  }, [address, marketId]);

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
  if (pos === undefined) {
    return (
      <div className="mx-auto w-full max-w-[560px]" aria-busy="true">
        <h1 className="sr-only">Your loan</h1>
        <Skeleton className="h-[480px] rounded-panel bg-sheet!" />
      </div>
    );
  }
  if (pos === null) {
    return (
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4">
        <Panel className="flex flex-col items-start gap-4">
          <h1 className="text-[26px] leading-8 tracking-[-0.01em] text-ink">This loan is closed</h1>
          <p className="text-[15px] leading-6 text-body">Nothing is deposited and nothing is owed in this market.</p>
          <Pill variant="secondary" on="white" href="/app">
            Back to your stocks
          </Pill>
        </Panel>
      </div>
    );
  }

  const debt = Number(formatUnits(BigInt(pos.debt), pos.loan.decimals));
  const owes = BigInt(pos.debt) > 0n;
  const pricePerShare = pos.collateral.shares > 0 ? pos.risk.collateralUsd / pos.collateral.shares : null;
  const health = HEALTH[pos.risk.health];
  const cushionPct = pos.risk.cushion == null ? null : pos.risk.cushion * 100;
  const worried = owes && pos.risk.health !== "safe";
  const safeMore = Number(formatUnits(BigInt(pos.sizing.safeBorrowNew), pos.loan.decimals));

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4">
      <Link href="/app" className="inline-flex min-h-11 items-center gap-1 self-start text-[15px] leading-6 text-ink hover:underline">
        <ChevronLeft size={18} strokeWidth={1.75} aria-hidden="true" />
        Your stocks
      </Link>

      <Panel className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <TokenIcon src={pos.logoUrl} ticker={pos.ticker} />
          <h1 className="min-w-0 flex-1 truncate text-[26px] leading-8 tracking-[-0.01em] text-ink">
            {pos.name} {owes ? "loan" : "deposit"}
          </h1>
          {owes && <span className={cn("rounded-pill px-3 py-1 text-[13px] leading-5", health.cls)}>{health.label}</span>}
        </div>

        {owes && pos.risk.liquidationPricePerShare != null && cushionPct != null && pricePerShare && (
          <CushionRuler
            riskPrice={pos.risk.liquidationPricePerShare}
            price={pricePerShare}
            cushionPct={cushionPct}
            health={pos.risk.health}
            priceLabel={`${pos.name} now`}
          />
        )}

        {worried && cushionPct != null && (
          <Notice tone={pos.risk.health === "at_risk" ? "risk" : "watch"}>
            Your stock is {fmtAmount(cushionPct)}% above the risk price. Repay some or add stock to stay safe.
          </Notice>
        )}

        <div className="-mt-3">
          {owes && pos.risk.liquidationPricePerShare != null && (
            <Row label="Risk starts at" value={`$${fmtAmount(pos.risk.liquidationPricePerShare)} a share`} />
          )}
          {pricePerShare != null && <Row label={`${pos.name} now`} value={`$${fmtAmount(pricePerShare)} a share`} />}
          {owes && <Row label="You owe" value={`${fmtAmount(debt)} ${pos.loanSymbol}`} />}
          {owes && <Row label="Interest" value={`${fmtAmount(pos.aprPct)}% a year`} />}
          <Row label="Deposited" value={`${fmtShares(pos.collateral.shares)} shares`} held />
          {!owes && <Row label="Worth" value={fmtUsd(pos.risk.collateralUsd)} />}
          {!owes && safeMore > 0 && <Row label="Safe to borrow" value={`${fmtAmount(safeMore)} ${pos.loanSymbol}`} />}
        </div>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            {owes ? (
              <Pill variant="primary" fullWidth onClick={() => setSheet("repay")}>
                Repay
              </Pill>
            ) : null}
            <Pill
              variant={owes ? "secondary" : "primary"}
              on="white"
              fullWidth
              onClick={() => setSheet("deposit")}
              className={owes ? undefined : "col-span-2"}
            >
              Add stock
            </Pill>
          </div>
          <button
            type="button"
            onClick={() => setSheet("withdraw")}
            className="inline-flex min-h-11 items-center gap-1.5 self-center text-base leading-6 text-ink hover:underline"
          >
            Withdraw stock
            <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        <details className="group rounded-panel bg-canvas">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-[15px] leading-6 text-ink [&::-webkit-details-marker]:hidden">
            Details
            <ChevronLeft size={18} strokeWidth={1.75} aria-hidden="true" className="-rotate-90 transition-transform duration-150 group-open:rotate-90" />
          </summary>
          <div className="px-4 pb-4 text-[13px] leading-5">
            {[
              ["Lending market", short(pos.marketId)],
              ["Liquidation threshold", `${Math.round(pos.risk.lltv * 100)}%`],
              ["Price oracle", short(pos.params.oracle)],
              ["Collateral token", short(pos.params.collateralToken)],
              ["Loan token", short(pos.params.loanToken)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-1.5">
                <span className="text-muted">{k}</span>
                <span className="font-mono text-ink">{v}</span>
              </div>
            ))}
          </div>
        </details>
      </Panel>

      <ActionSheet kind={sheet} pos={pos} onClose={() => setSheet(null)} />
    </div>
  );
}

const SHEETS: Record<SheetKind, { title: string; label: string; cta: string }> = {
  repay: { title: "Repay", label: "Amount to repay", cta: "Review repayment" },
  deposit: { title: "Add stock", label: "Amount to add", cta: "Review deposit" },
  withdraw: { title: "Withdraw stock", label: "Amount to withdraw", cta: "Review withdrawal" },
};

function ActionSheet({ kind, pos, onClose }: { kind: SheetKind | null; pos: Position; onClose(): void }) {
  const { address } = useWallet();
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [all, setAll] = useState(false);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const owes = BigInt(pos.debt) > 0n;
  const debt = Number(formatUnits(BigInt(pos.debt), pos.loan.decimals));
  const deposited = Number(formatUnits(BigInt(pos.collateral.amount), pos.collateral.decimals));
  // With debt, keep enough stock that the safe amount still covers what's owed.
  const keepFraction = owes && pos.risk.collateralUsd > 0 ? pos.risk.debtUsd / (pos.risk.lltv * pos.sizing.buffer) / pos.risk.collateralUsd : 0;
  const maxWithdraw = Math.max(0, deposited * (1 - keepFraction));

  useEffect(() => {
    if (!kind || !address) return;
    // Resetting the sheet each time it opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProblem(null);
    setBalance(null);
    setAll(kind === "withdraw" && !owes);
    setAmount(kind === "withdraw" && !owes ? floorTo(deposited, 6) : "");
    if (kind === "withdraw") return;
    const token = kind === "repay" ? pos.loan.address : pos.collateral.address;
    api<Balance>(`/api/balance?address=${address}&token=${token}`)
      .then(setBalance)
      .catch(() => setBalance(null));
  }, [kind, address, owes, deposited, pos.loan.address, pos.collateral.address]);

  if (!kind) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;

  const s = SHEETS[kind];
  const unit = kind === "repay" ? pos.loanSymbol : pos.collateral.symbol;
  const have = balance ? Number(formatUnits(BigInt(balance.amount), balance.decimals)) : null;
  const invalid = !all && (amount === "" || !/^\d*\.?\d+$/.test(amount) || Number(amount) <= 0);

  const submit = async () => {
    if (!address || invalid) return;
    setBusy(true);
    setProblem(null);
    const sent = all ? "all" : amount;
    try {
      const r = await api<{ plan: { id: string; blockers: { message: string }[] } }>("/api/plan", {
        method: "POST",
        body: JSON.stringify({ address, action: kind, token: pos.collateral.address, marketId: pos.marketId, amount: sent, check: false }),
      });
      if (r.plan.blockers.length > 0) {
        setProblem(r.plan.blockers.map((b) => b.message).join(" "));
        setBusy(false);
        return;
      }
      router.push(`/app/review/${r.plan.id}?${new URLSearchParams({ amount: sent })}`);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : "Something went wrong on our side");
      setBusy(false);
    }
  };

  const fill = (v: string, isAll = false) => {
    setAll(isAll);
    setAmount(v);
  };

  return (
    <Sheet open onClose={onClose} title={s.title}>
      <div className="flex flex-col gap-5">
        <div>
          <label htmlFor="sheet-amount" className="text-[13px] leading-5 text-muted">
            {s.label}
          </label>
          <div className="mt-1 flex items-baseline gap-2 rounded-input border border-line bg-sheet px-4 py-3 focus-within:border-action">
            <input
              id="sheet-amount"
              inputMode="decimal"
              autoComplete="off"
              value={all && kind === "repay" ? fmtAmount(debt) : amount}
              placeholder="0.00"
              onChange={(e) => fill(e.target.value.replace(",", ".").replace(/[^\d.]/g, ""))}
              className="num w-full min-w-0 bg-transparent text-[28px] leading-9 tracking-[-0.02em] text-ink outline-none placeholder:text-line"
            />
            <span className="shrink-0 text-base text-muted">{unit}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {kind === "repay" && (
            <Pill variant="secondary" on="white" size="md" onClick={() => fill("", true)}>
              Repay all
            </Pill>
          )}
          {kind === "deposit" && have != null && have > 0 && (
            <Pill variant="secondary" on="white" size="md" onClick={() => fill("", true)}>
              Add all
            </Pill>
          )}
          {kind === "withdraw" && (owes ? maxWithdraw > 0 : true) && (
            <Pill
              variant="secondary"
              on="white"
              size="md"
              onClick={() => (owes ? fill(floorTo(maxWithdraw, 6)) : fill(floorTo(deposited, 6), true))}
            >
              {owes ? "Most that stays safe" : "Withdraw all"}
            </Pill>
          )}
        </div>

        <div className="text-[13px] leading-5 text-muted">
          {kind === "repay" && (
            <>
              <p>
                You owe {fmtAmount(debt)} {pos.loanSymbol}.
                {have != null && ` You have ${fmtAmount(have)} ${pos.loanSymbol}.`}
              </p>
              <p className="mt-1">If you repay part, Lista needs the rest to stay above its minimum loan.</p>
            </>
          )}
          {kind === "deposit" && have != null && (
            <p>
              You have {fmtAmount(have)} {unit} in your wallet. More stock lets you borrow more safely.
            </p>
          )}
          {kind === "withdraw" &&
            (owes ? (
              <p>
                You can take back up to {floorTo(maxWithdraw, 6)} {unit} and keep the loan safe.
              </p>
            ) : (
              <p>Nothing is owed, so you can take it all back.</p>
            ))}
        </div>

        {problem && <Notice tone="risk">{problem}</Notice>}

        <Pill variant="primary" fullWidth disabled={invalid} loading={busy} onClick={submit}>
          {s.cta}
        </Pill>
      </div>
    </Sheet>
  );
}
