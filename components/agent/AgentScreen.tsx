"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, CircleCheck, CircleX, LoaderCircle } from "lucide-react";
import { formatUnits } from "viem";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { Pill } from "@/components/ui/Pill";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import { api, ApiError, fmtAmount, fmtShares, GENERIC_ERROR } from "@/lib/client/api";

const TOKEN_KEY = "lendhold:operator";

interface Status {
  status: string;
  message?: string;
  address?: string | null;
  ready?: boolean;
  blockers?: { code: string; message: string }[];
  maxUsdPerRun: number;
  devMode?: { enabled: boolean; expiresAt: number | null } | null;
  quotas?: { quotaLeft: number | null; defiQuotaLeft: number | null } | null;
  sessionExpireTime?: number | null;
}

interface Plan {
  id: string;
  action: string;
  steps: { idx: number; label: string }[];
  blockers: { code: string; message: string }[];
  notices: { code: string; message: string }[];
  display: {
    sharesAfter: number | null;
    receive: { symbol: string; amount: string; decimals: number } | null;
    debt: { symbol: string; amount: string; decimals: number } | null;
    riskPricePerShare: number | null;
  };
}

interface Run {
  status: string;
  steps: { idx: number; status: string; txHash: string | null; error: string | null }[];
}

/** What to do about each readiness blocker, on top of the server's message. */
const FIX: Record<string, string> = {
  SESSION_MISSING: "Sign in on the server with baw auth signin, then reload this page.",
  DEV_MODE_OFF: "Open the Binance App and turn on Developer Mode for the Agentic Wallet.",
  DEV_MODE_BALANCE_EXCEEDED: "Move funds out of the agent wallet until it is under the Developer Mode balance limit.",
  QUOTA_EXHAUSTED: "Wait for the daily quota to reset, or raise it in the Binance App.",
};

const amt = (a: { symbol: string; amount: string; decimals: number }) =>
  `${fmtAmount(Number(formatUnits(BigInt(a.amount), a.decimals)))} ${a.symbol}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const time = (t: number) => new Date(t).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });

function readToken() {
  try {
    return window.sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function AgentScreen() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Reading the saved token once on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(readToken());
  }, []);

  const call = useCallback(
    <T,>(path: string, init?: RequestInit) => api<T>(path, { ...init, headers: { "x-operator-token": token ?? "" } }),
    [token],
  );

  const loadStatus = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      setStatus(await call<Status>("/api/agent/status"));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        try {
          window.sessionStorage.removeItem(TOKEN_KEY);
        } catch {}
        setToken(null);
        setError("That operator token isn't right.");
      } else {
        setError(err instanceof ApiError ? err.message : GENERIC_ERROR);
      }
    }
  }, [token, call]);

  useEffect(() => {
    // Fetching status whenever the token changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStatus();
  }, [loadStatus]);

  if (token === undefined) return <Skeleton className="h-[200px] rounded-panel bg-sheet!" />;

  if (!token) {
    return (
      <Panel className="flex flex-col gap-4">
        <h1 className="text-[26px] leading-8 tracking-[-0.01em] text-ink">Agent</h1>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            try {
              window.sessionStorage.setItem(TOKEN_KEY, draft.trim());
            } catch {}
            setToken(draft.trim());
          }}
        >
          <div>
            <label htmlFor="op-token" className="text-[13px] leading-5 text-muted">
              Operator token
            </label>
            <input
              id="op-token"
              type="password"
              autoComplete="off"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="mt-1 w-full rounded-input border border-line bg-sheet px-4 py-3 text-base text-ink outline-none focus:border-action"
            />
          </div>
          {error && <Notice tone="risk">{error}</Notice>}
          <Pill variant="primary" type="submit" fullWidth disabled={!draft.trim()}>
            Continue
          </Pill>
        </form>
      </Panel>
    );
  }

  if (error) {
    return (
      <Notice tone="risk" action={<Pill variant="secondary" on="white" onClick={loadStatus}>Try again</Pill>}>
        {error}
      </Notice>
    );
  }
  if (!status) return <Skeleton className="h-[200px] rounded-panel bg-sheet!" />;

  const connected = status.status === "CONNECTED";
  const blockers = status.blockers ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Panel className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[22px] leading-7 text-ink">Agent wallet</h1>
          <span className={cn("rounded-pill px-3 py-1 text-[13px] leading-5", connected ? "bg-safe-tint text-safe" : "bg-risk-tint text-risk")}>
            {status.status}
          </span>
        </div>
        <div className="text-[15px] leading-5">
          {status.address && <Line label="Address" value={short(status.address)} mono />}
          {status.devMode && <Line label="Developer Mode" value={status.devMode.enabled ? "On" : "Off"} />}
          {status.quotas?.quotaLeft != null && <Line label="Left today" value={`${status.quotas.quotaLeft} swaps`} />}
          {status.quotas?.defiQuotaLeft != null && <Line label="Contract calls left" value={String(status.quotas.defiQuotaLeft)} />}
          {status.sessionExpireTime && <Line label="Session ends" value={time(status.sessionExpireTime)} />}
          <Line label="Cap per run" value={`$${status.maxUsdPerRun}`} />
        </div>
        {status.status === "UNAVAILABLE" && <Notice tone="risk">{status.message ?? "The baw CLI isn't available on this server."}</Notice>}
        {blockers.map((b) => (
          <Notice key={b.code} tone="risk" title={b.message}>
            {FIX[b.code] ?? "Fix this in the Binance App, then reload."}
          </Notice>
        ))}
      </Panel>

      {connected && status.address && status.ready && <Ask call={call} address={status.address} cap={status.maxUsdPerRun} />}
    </div>
  );
}

function Line({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-3 last:border-b-0">
      <span className="text-body">{label}</span>
      <span className={cn("text-right text-ink", mono ? "font-mono text-[13px]" : "num")}>{value}</span>
    </div>
  );
}

type Call = <T>(path: string, init?: RequestInit) => Promise<T>;

function Ask({ call, address, cap }: { call: Call; address: string; cap: number }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);

  const makePlan = async () => {
    setBusy(true);
    setError(null);
    setQuestion(null);
    setPlan(null);
    try {
      const r = await call<{
        intent: { action: string; amountUsd: number | null };
        token: { address: string } | null;
        needsClarification?: string;
      }>("/api/intent", { method: "POST", body: JSON.stringify({ text }) });
      if (r.needsClarification || !r.token) {
        setQuestion(r.needsClarification ?? "Which stock do you mean?");
        return;
      }
      if (r.intent.action === "status") {
        setQuestion("Status requests show on the loan screen. Ask to borrow, repay or buy here.");
        return;
      }
      const p = await call<{ plan: Plan }>("/api/plan", {
        method: "POST",
        body: JSON.stringify({
          address,
          action: r.intent.action,
          token: r.token.address,
          ...(r.intent.amountUsd ? { amount: String(r.intent.amountUsd) } : {}),
        }),
      });
      setPlan(p.plan);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : GENERIC_ERROR);
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      const r = await call<{ runId: string }>("/api/agent/run", { method: "POST", body: JSON.stringify({ planId: plan.id }) });
      setRunId(r.runId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : GENERIC_ERROR);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!runId) return;
    let live = true;
    const tick = async () => {
      try {
        const r = await api<{ run: Run }>(`/api/runs/${runId}`);
        if (!live) return;
        setRun(r.run);
        if (r.run.status === "done" || r.run.status === "failed" || r.run.status === "stopped") return;
      } catch {}
      if (live) setTimeout(tick, 3000);
    };
    tick();
    return () => {
      live = false;
    };
  }, [runId]);

  const d = plan?.display;

  return (
    <Panel className="flex flex-col gap-5">
      <div>
        <label htmlFor="ask" className="text-[15px] leading-6 text-ink">
          What do you need?
        </label>
        <textarea
          id="ask"
          rows={2}
          value={text}
          placeholder="I need $20 without selling my NVIDIA"
          onChange={(e) => setText(e.target.value)}
          disabled={!!runId}
          className="mt-2 w-full resize-none rounded-input border border-line bg-sheet px-4 py-3 text-base leading-6 text-ink outline-none placeholder:text-muted focus:border-action"
        />
      </div>
      {!runId && (
        <Pill variant="secondary" on="white" fullWidth disabled={!text.trim()} loading={busy && !plan} onClick={makePlan}>
          Plan
        </Pill>
      )}
      {question && <Notice tone="info">{question}</Notice>}
      {error && <Notice tone="risk">{error}</Notice>}

      {plan && (
        <div className="flex flex-col gap-4">
          <div className="text-[15px] leading-5">
            {d?.sharesAfter != null && <Line label="You keep" value={`${fmtShares(d.sharesAfter)} shares`} />}
            {d?.receive && <Line label="You get" value={amt(d.receive)} />}
            {d?.debt && <Line label="You owe" value={amt(d.debt)} />}
            {d?.riskPricePerShare != null && <Line label="Risk price" value={`Below $${fmtAmount(d.riskPricePerShare)} a share`} />}
          </div>
          {plan.notices.map((n) => (
            <Notice key={n.code} tone="watch">
              {n.message}
            </Notice>
          ))}
          {plan.blockers.map((b) => (
            <Notice key={b.code} tone="risk">
              {b.message}
            </Notice>
          ))}
          <ol className="flex flex-col">
            {plan.steps.map((s, i) => {
              const rec = run?.steps.find((r) => r.idx === s.idx);
              return (
                <li key={s.idx} className="flex items-start gap-3 border-b border-line py-3 last:border-b-0">
                  <span className="num flex size-6 shrink-0 items-center justify-center rounded-full bg-canvas text-xs text-ink">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] leading-6 text-ink">{s.label}</p>
                    {rec?.txHash && (
                      <a
                        href={`https://bscscan.com/tx/${rec.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="num inline-flex items-center gap-0.5 text-[13px] leading-5 text-muted hover:text-ink"
                      >
                        {short(rec.txHash)}
                        <ArrowUpRight size={14} strokeWidth={1.75} aria-label="View on BscScan" />
                      </a>
                    )}
                    {rec?.error && <p className="text-[13px] leading-5 text-risk">{rec.error}</p>}
                  </div>
                  {rec && <StepBadge status={rec.status} />}
                </li>
              );
            })}
          </ol>
          {!runId && (
            <>
              <p className="text-[13px] leading-5 text-muted">Cap ${cap} per run. Runs from the agent wallet, no signature prompts.</p>
              <Pill variant="primary" fullWidth disabled={plan.blockers.length > 0} loading={busy} onClick={start}>
                Run on Agentic Wallet
              </Pill>
            </>
          )}
          {run?.status === "done" && <Notice tone="info">Done. Every step is confirmed on BNB Chain.</Notice>}
          {run?.status === "failed" && <Notice tone="risk">The run stopped. The failed step shows why.</Notice>}
        </div>
      )}
    </Panel>
  );
}

function StepBadge({ status }: { status: string }) {
  const base = "inline-flex shrink-0 items-center gap-1 text-[13px] leading-6";
  if (status === "confirmed" || status === "skipped")
    return (
      <span className={cn(base, "text-safe")}>
        <CircleCheck size={16} strokeWidth={1.75} aria-hidden="true" />
        {status === "confirmed" ? "Confirmed" : "Already done"}
      </span>
    );
  if (status === "failed")
    return (
      <span className={cn(base, "text-risk")}>
        <CircleX size={16} strokeWidth={1.75} aria-hidden="true" />
        Failed
      </span>
    );
  if (status === "sent" || status === "simulated")
    return (
      <span className={cn(base, "text-ink")}>
        <LoaderCircle size={14} strokeWidth={1.75} className="animate-spin" aria-hidden="true" />
        {status === "sent" ? "Sent" : "Checking"}
      </span>
    );
  return <span className={cn(base, "text-muted")}>Waiting</span>;
}
