"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, CircleCheck, CircleX, LoaderCircle } from "lucide-react";
import { formatUnits, toHex } from "viem";
import { CushionRuler } from "@/components/ui/CushionRuler";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { Pill } from "@/components/ui/Pill";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import { api, ApiError, fmtAmount, fmtShares } from "@/lib/client/api";
import { fromJson } from "@/lib/json";
import type { Plan, PlanAction, Step } from "@/lib/engine/planner";
import type { Holding } from "@/lib/engine/holdings";
import { useWallet } from "./WalletProvider";

type StepStatus = "pending" | "simulated" | "sent" | "confirmed" | "skipped" | "failed";

interface RunRecord {
  id: string;
  path: string;
  address: string | null;
  status: "planned" | "running" | "done" | "failed" | "stopped";
  planJson: string | null;
  steps: { idx: number; status: StepStatus; txHash: string | null; error: string | null }[];
}

/** What the page is doing with a step right now, on top of the server record. */
type Phase = "checking" | "signing" | "sent";

interface Stop {
  idx: number;
  kind: "cancelled" | "failed";
  message: string;
}

const TITLES: Record<PlanAction, { running: string; done: string }> = {
  borrow: { running: "Borrowing", done: "Done" },
  repay: { running: "Repaying", done: "Done" },
  deposit: { running: "Depositing", done: "Done" },
  withdraw: { running: "Withdrawing", done: "Done" },
  buy: { running: "Buying", done: "Done" },
};

const POLL_MS = 3000;
const BSCSCAN = "https://bscscan.com/tx/";
const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const amt = (a: { symbol: string; amount: bigint; decimals: number }) =>
  `${fmtAmount(Number(formatUnits(a.amount, a.decimals)))} ${a.symbol}`;

function walletError(err: unknown): Stop["kind"] | string {
  const e = err as { code?: number; message?: string };
  if (e?.code === 4001) return "cancelled";
  return e?.message ? `Your wallet returned an error: ${e.message}` : "Your wallet didn't respond. Try again.";
}

export function RunScreen({ runId }: { runId: string }) {
  const { address, wallet, onBsc } = useWallet();
  const [run, setRun] = useState<RunRecord | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [phase, setPhase] = useState<Record<number, Phase>>({});
  const [stop, setStop] = useState<Stop | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const busy = useRef(false);

  const load = useCallback(async () => {
    const { run: r } = await api<{ run: RunRecord }>(`/api/runs/${runId}`);
    setRun(r);
    if (r.planJson) setPlan((p) => p ?? fromJson<Plan>(r.planJson!));
    return r;
  }, [runId]);

  useEffect(() => {
    // Loading the run record on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((err) => setLoadError(err instanceof ApiError ? err.message : "Something went wrong on our side"));
  }, [load]);

  const mine = !!run?.address && !!address && run.address.toLowerCase() === address.toLowerCase();

  /** Posts a hash and keeps asking until the server has verified the receipt. */
  const confirm = useCallback(
    async (idx: number, txHash: string) => {
      setPhase((p) => ({ ...p, [idx]: "sent" }));
      for (;;) {
        try {
          const res = await api<{ run: RunRecord; pending?: boolean }>(`/api/runs/${runId}/steps`, {
            method: "POST",
            body: JSON.stringify({ idx, txHash }),
          });
          setRun(res.run);
          if (!res.pending) return null;
        } catch (err) {
          if (err instanceof ApiError && err.status === 422) {
            await load();
            return err.message;
          }
          if (!(err instanceof ApiError) || err.status !== 0) return err instanceof Error ? err.message : String(err);
        }
        await sleep(POLL_MS);
      }
    },
    [runId, load],
  );

  const send = useCallback(
    async (tx: { to: string; data: string; value?: bigint }) => {
      if (!wallet || !address) throw new Error("Connect your wallet to sign.");
      return (await wallet.provider.request({
        method: "eth_sendTransaction",
        params: [{ from: address, to: tx.to, data: tx.data, ...(tx.value ? { value: toHex(tx.value) } : {}) }],
      })) as string;
    },
    [wallet, address],
  );

  /** Waits for a side transaction the run doesn't track (a swap allowance) to be mined. */
  const mined = useCallback(
    async (hash: string) => {
      for (let i = 0; i < 100; i++) {
        const receipt = (await wallet!.provider.request({ method: "eth_getTransactionReceipt", params: [hash] })) as {
          status: string;
        } | null;
        if (receipt) return receipt.status === "0x1";
        await sleep(POLL_MS);
      }
      return false;
    },
    [wallet],
  );

  const runStep = useCallback(
    async (step: Step, planId: string): Promise<Stop | null> => {
      const fail = (message: string): Stop => ({ idx: step.idx, kind: "failed", message });
      setPhase((p) => ({ ...p, [step.idx]: "checking" }));

      let tx: { to: string; data: string; value?: bigint };
      if (step.kind === "swap" && step.swap) {
        const built = await api<{
          tx: { to: string; data: string; value?: string } | null;
          approval: { spender: string; data: string } | null;
          rfq: unknown;
        }>("/api/swap/build", { method: "POST", body: JSON.stringify({ planId, idx: step.idx }) });
        if (!built.tx) {
          return fail(`This swap route needs a signed quote, which the browser can't do yet. Plan again and receive ${step.swap.fromSymbol} instead.`);
        }
        if (built.approval) {
          setPhase((p) => ({ ...p, [step.idx]: "signing" }));
          const approveHash = await send({ to: step.swap.from, data: built.approval.data });
          setPhase((p) => ({ ...p, [step.idx]: "checking" }));
          if (!(await mined(approveHash))) return fail(`The ${step.swap.fromSymbol} allowance for the swap failed on-chain.`);
        }
        tx = { to: built.tx.to, data: built.tx.data, value: built.tx.value ? BigInt(built.tx.value) : undefined };
      } else {
        if (!step.to || !step.data) return fail("This step has no transaction to send.");
        const sim = await api<{ ok: boolean; reason?: string }>("/api/simulate", {
          method: "POST",
          body: JSON.stringify({ planId, idx: step.idx }),
        });
        if (!sim.ok) return fail(`The check failed before signing: ${sim.reason ?? "the call would revert"}. Nothing was sent.`);
        tx = { to: step.to, data: step.data, value: step.value };
      }

      setPhase((p) => ({ ...p, [step.idx]: "signing" }));
      const hash = await send(tx);
      const problem = await confirm(step.idx, hash);
      return problem ? fail(problem) : null;
    },
    [send, mined, confirm],
  );

  const advance = useCallback(async () => {
    if (busy.current || !plan || !mine || !onBsc) return;
    busy.current = true;
    setStop(null);
    try {
      let current = await load();
      for (const step of plan.steps) {
        const rec = current.steps.find((s) => s.idx === step.idx);
        if (rec?.status === "confirmed" || rec?.status === "skipped") continue;
        try {
          // A step with a hash is only ever waited on, never sent again.
          const result =
            rec?.status === "sent" && rec.txHash
              ? await confirm(step.idx, rec.txHash).then((m) => (m ? ({ idx: step.idx, kind: "failed", message: m } as Stop) : null))
              : await runStep(step, plan.id);
          if (result) {
            setStop(result);
            return;
          }
        } catch (err) {
          const e = err instanceof ApiError ? err.message : walletError(err);
          setStop(
            e === "cancelled"
              ? { idx: step.idx, kind: "cancelled", message: "You cancelled in your wallet. Nothing was sent for this step." }
              : { idx: step.idx, kind: "failed", message: e },
          );
          return;
        } finally {
          setPhase((p) => {
            const next = { ...p };
            delete next[step.idx];
            return next;
          });
        }
        current = await load();
      }
    } finally {
      busy.current = false;
    }
  }, [plan, mine, onBsc, load, confirm, runStep]);

  // Start or resume as soon as the run and a matching wallet are both ready.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !run || !plan || !mine || !onBsc) return;
    if (run.status === "done") return;
    if (run.steps.some((s) => s.status === "failed")) {
      const f = run.steps.find((s) => s.status === "failed")!;
      // Showing the stored failure on load.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStop({ idx: f.idx, kind: "failed", message: f.error ?? "This step failed." });
      started.current = true;
      return;
    }
    started.current = true;
    advance();
  }, [run, plan, mine, onBsc, advance]);

  const done = run?.status === "done";
  useEffect(() => {
    if (!done || !address || !plan) return;
    api<{ holdings: Holding[] }>(`/api/holdings?address=${address}`)
      .then((r) => {
        const h = r.holdings.find((x) => x.address.toLowerCase() === plan.token.toLowerCase());
        setPrice(h?.perSharePrice ?? null);
      })
      .catch(() => {});
  }, [done, address, plan]);

  if (loadError) {
    return (
      <Notice tone="risk" action={<Pill variant="secondary" on="white" href="/app">Back to your stocks</Pill>}>
        {loadError}
      </Notice>
    );
  }
  if (!run || !plan) {
    return (
      <div className="mx-auto w-full max-w-[560px]" aria-busy="true">
        <h1 className="sr-only">Run</h1>
        <Skeleton className="h-[420px] rounded-panel bg-sheet!" />
      </div>
    );
  }

  const confirmedCount = run.steps.filter((s) => s.status === "confirmed").length;
  const d = plan.display;
  const title = TITLES[plan.action];
  const owes = !!d.debt && d.debt.amount > 0n;

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4">
      <title>{`${done ? title.done : title.running} | Lendhold`}</title>
      <Panel className="flex flex-col gap-6">
        <div>
          <h1 className="text-[26px] leading-8 tracking-[-0.01em] text-ink">{done ? title.done : title.running}</h1>
          {!done && <p className="text-[15px] leading-6 text-body">Sign each step in your wallet. Keep this page open.</p>}
        </div>

        {!mine && !done && (
          <Notice tone="watch" title={address && wallet ? "Different wallet" : "Connect to sign"}>
            {address && wallet
              ? "This run belongs to another wallet. Switch to that wallet to continue."
              : "This view can't sign. Connect the wallet that made this plan to continue."}
          </Notice>
        )}

        {done && (
          <div className="-mt-3">
            {summaryRows(plan).map((r) => (
              <SummaryRow key={r.label} {...r} />
            ))}
          </div>
        )}
        {done && owes && d.riskPricePerShare != null && d.cushionPct != null && d.health && price && (
          <CushionRuler riskPrice={d.riskPricePerShare} price={price} cushionPct={d.cushionPct} health={d.health} priceLabel="Price now" />
        )}

        <ol className="flex flex-col">
          {plan.steps.map((s, i) => {
            const rec = run.steps.find((r) => r.idx === s.idx);
            return (
              <li key={s.idx} className="flex items-start gap-3 border-b border-line py-3 last:border-b-0">
                <span className="num flex size-6 shrink-0 items-center justify-center rounded-full bg-canvas text-xs text-ink">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] leading-6 text-ink">{s.label}</p>
                  {rec?.txHash && (
                    <a
                      href={`${BSCSCAN}${rec.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="num inline-flex items-center gap-0.5 text-[13px] leading-5 text-muted hover:text-ink"
                    >
                      {short(rec.txHash)}
                      <ArrowUpRight size={14} strokeWidth={1.75} aria-label="View on BscScan" />
                    </a>
                  )}
                </div>
                <StepState status={rec?.status ?? "pending"} phase={phase[s.idx]} stopped={stop?.idx === s.idx ? stop.kind : null} />
              </li>
            );
          })}
        </ol>

        {stop && (
          <Notice
            tone={stop.kind === "cancelled" ? "watch" : "risk"}
            action={
              mine ? (
                <Pill variant="secondary" on="white" size="md" onClick={advance}>
                  {stop.kind === "cancelled" ? "Try again" : "Try this step again"}
                </Pill>
              ) : undefined
            }
          >
            {stop.message}
          </Notice>
        )}

        {done && (
          <div className="flex flex-col items-center gap-3">
            <p className="text-[13px] leading-5 text-muted">
              {confirmedCount} transaction{confirmedCount === 1 ? "" : "s"} confirmed on BNB Chain
            </p>
            {owes && plan.market ? (
              <Pill variant="primary" fullWidth href={`/app/loan/${plan.market.id}`}>
                View my loan
              </Pill>
            ) : (
              <Pill variant="secondary" on="white" fullWidth href="/app">
                Back to your stocks
              </Pill>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}

/** The Done rows say what moved, in the terms of the action that ran. */
function summaryRows(plan: Plan): { label: string; value: string; held?: boolean }[] {
  const d = plan.display;
  const moved = d.sharesBefore != null && d.sharesAfter != null ? Math.abs(d.sharesAfter - d.sharesBefore) : null;
  const rows: { label: string; value: string; held?: boolean }[] = [];
  if (plan.action === "deposit") {
    if (moved != null) rows.push({ label: "You deposited", value: `${fmtShares(moved)} shares` });
    if (d.sharesAfter != null) rows.push({ label: "Now in Lista", value: `${fmtShares(d.sharesAfter)} shares`, held: true });
  } else if (plan.action === "withdraw") {
    if (moved != null) rows.push({ label: "Back in your wallet", value: `${fmtShares(moved)} shares` });
    if (d.sharesAfter != null) rows.push({ label: "Still in Lista", value: `${fmtShares(d.sharesAfter)} shares` });
  } else if (d.sharesAfter != null) {
    rows.push({ label: "You still hold", value: `${fmtShares(d.sharesAfter)} shares`, held: true });
  }
  if (d.receive) rows.push({ label: "You received", value: amt(d.receive) });
  if (d.debt && d.debt.amount > 0n) rows.push({ label: "You owe", value: amt(d.debt) });
  if (d.debt && d.debt.amount > 0n && d.riskPricePerShare != null) {
    rows.push({ label: "Risk price", value: `$${fmtAmount(d.riskPricePerShare)} a share` });
  }
  return rows;
}

function SummaryRow({ label, value, held }: { label: string; value: string; held?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-3.5 text-[15px] leading-5">
      <span className="text-body">{label}</span>
      <span className="num flex items-center gap-2 text-right text-ink">
        {value}
        {held && <span className="rounded-pill bg-safe-tint px-2 py-0.5 text-xs leading-4 text-safe">held</span>}
      </span>
    </div>
  );
}

function StepState({ status, phase, stopped }: { status: StepStatus; phase?: Phase; stopped: Stop["kind"] | null }) {
  const base = "inline-flex shrink-0 items-center gap-1 text-[13px] leading-6";
  if (status === "confirmed" || status === "skipped") {
    return (
      <span className={cn(base, "text-safe")}>
        <CircleCheck size={16} strokeWidth={1.75} aria-hidden="true" />
        {status === "confirmed" ? "Confirmed" : "Already done"}
      </span>
    );
  }
  if (stopped === "failed" || status === "failed") {
    return (
      <span className={cn(base, "text-risk")}>
        <CircleX size={16} strokeWidth={1.75} aria-hidden="true" />
        Failed
      </span>
    );
  }
  if (stopped === "cancelled") return <span className={cn(base, "text-watch")}>Cancelled</span>;
  const label =
    phase === "checking"
      ? "Checking"
      : phase === "signing"
        ? "Waiting for your signature"
        : phase === "sent" || status === "sent"
          ? "Sent"
          : "Waiting";
  return (
    <span className={cn(base, phase ? "text-ink" : "text-muted")} aria-live="polite">
      {phase && <LoaderCircle size={14} strokeWidth={1.75} className="animate-spin" aria-hidden="true" />}
      {label}
    </span>
  );
}
