"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, LoaderCircle } from "lucide-react";
import { formatUnits } from "viem";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { Pill } from "@/components/ui/Pill";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import { api, ApiError, fmtAmount, fmtShares } from "@/lib/client/api";
import { useWallet } from "./WalletProvider";

const USDT = "0x55d398326f99059fF775485246999027B3197955";

interface Status {
  symbol: string;
  session: { openState: boolean | null; nextOpenTime: number | null };
  asset: { openState: boolean | null; reasonCode: string | null; reasonMsg: string | null; nextOpenTime: number | null };
  price: { perShare: number | null } | null;
}

interface Quote {
  plan: {
    id: string;
    blockers: { code: string; message: string }[];
    notices: { code: string; message: string }[];
    display: { sharesAfter: number | null; conversionCostPct: number | null };
  };
}

const reopens = (t: number | null) =>
  t ? ` It reopens ${new Date(t).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}.` : "";

export function BuyScreen({ token }: { token: string }) {
  const { address } = useWallet();
  const router = useRouter();
  const [status, setStatus] = useState<Status | null | undefined>(undefined);
  const [usdt, setUsdt] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quotedFor, setQuotedFor] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!address) return;
    api<Status>(`/api/market-status?token=${token}`)
      .then(setStatus)
      .catch(() => setStatus(null));
    api<{ amount: string; decimals: number }>(`/api/balance?address=${address}&token=${USDT}`)
      .then((b) => setUsdt(Number(formatUnits(BigInt(b.amount), b.decimals))))
      .catch(() => setUsdt(null));
  }, [address, token]);

  const valid = /^\d*\.?\d+$/.test(amount) && Number(amount) > 0;
  const short = valid && usdt != null && Number(amount) > usdt;

  useEffect(() => {
    if (!address || !valid || short) return;
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setQuoting(true);
      setError(null);
      try {
        const q = await api<Quote>("/api/plan", {
          method: "POST",
          body: JSON.stringify({ address, action: "buy", token, amount, check: false }),
        });
        if (id !== seq.current) return;
        setQuote(q);
        setQuotedFor(amount);
      } catch (err) {
        if (id === seq.current) setError(err instanceof ApiError ? err.message : "Something went wrong on our side");
      } finally {
        if (id === seq.current) setQuoting(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [address, token, amount, valid, short]);

  if (status === undefined) {
    return (
      <div className="mx-auto w-full max-w-[560px]" aria-busy="true">
        <h1 className="sr-only">Buy</h1>
        <Skeleton className="h-[420px] rounded-panel bg-sheet!" />
      </div>
    );
  }
  if (status === null) {
    return (
      <div className="mx-auto w-full max-w-[560px]">
        <Notice tone="risk" action={<Pill variant="secondary" on="white" href="/app">Back to your stocks</Pill>}>
          We can&apos;t find this stock right now.
        </Notice>
      </div>
    );
  }

  const closed = status.session.openState === false || status.asset.openState === false;
  const current = quote && quotedFor === amount;
  const blockers = current ? quote.plan.blockers : [];
  const d = current ? quote.plan.display : null;
  const canReview = !!current && valid && !short && !closed && blockers.length === 0 && !quoting;

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4">
      <Link href="/app" className="inline-flex min-h-11 items-center gap-1 self-start text-[15px] leading-6 text-ink hover:underline">
        <ChevronLeft size={18} strokeWidth={1.75} aria-hidden="true" />
        Your stocks
      </Link>

      <Panel className="flex flex-col gap-5">
        <div>
          <h1 className="text-[26px] leading-8 tracking-[-0.01em] text-ink">Buy {status.symbol}</h1>
          <p className="text-[15px] leading-6 text-muted">Pay with USDT on BNB Chain</p>
        </div>

        {closed && (
          <Notice tone="watch" title="Trading is closed">
            {status.asset.reasonMsg ?? `${status.symbol} can't be bought right now.`}
            {reopens(status.asset.nextOpenTime ?? status.session.nextOpenTime)}
          </Notice>
        )}

        <div>
          <label htmlFor="buy-amount" className="text-[13px] leading-5 text-muted">
            Amount to spend
          </label>
          <div
            className={cn(
              "mt-1 flex items-baseline gap-2 rounded-input border bg-sheet px-4 py-3 focus-within:border-action",
              short ? "border-risk" : "border-line",
            )}
          >
            <span className="text-[36px] leading-[44px] text-muted">$</span>
            <input
              id="buy-amount"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              placeholder="0.00"
              aria-invalid={short}
              onChange={(e) => setAmount(e.target.value.replace(",", ".").replace(/[^\d.]/g, ""))}
              className="num w-full min-w-0 bg-transparent text-[36px] leading-[44px] tracking-[-0.02em] text-ink outline-none placeholder:text-line focus-visible:outline-none"
            />
            {quoting && <LoaderCircle size={18} strokeWidth={1.75} className="shrink-0 animate-spin text-muted" aria-label="Updating" />}
          </div>
          {short && <p className="mt-2 text-[13px] leading-5 text-risk">You have {fmtAmount(usdt!)} USDT.</p>}
        </div>

        <div>
          <Row label="You get about" value={d?.sharesAfter != null ? `${fmtShares(d.sharesAfter)} shares` : "-"} />
          <Row label="Cost" value={d?.conversionCostPct != null ? `${Math.max(d.conversionCostPct, 0).toFixed(2)}%` : "-"} />
          <Row label="Your USDT" value={usdt != null ? fmtAmount(usdt) : "-"} />
        </div>

        {blockers.map((b) => (
          <Notice key={b.code} tone="risk">
            {b.message}
          </Notice>
        ))}
        {error && <Notice tone="risk">{error}</Notice>}

        <Pill
          variant="primary"
          fullWidth
          disabled={!canReview}
          onClick={() => quote && router.push(`/app/review/${quote.plan.id}?${new URLSearchParams({ amount })}`)}
        >
          Review
        </Pill>
      </Panel>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-3 text-[15px] leading-5 last:border-b-0">
      <span className="text-body">{label}</span>
      <span className="num text-right text-ink">{value}</span>
    </div>
  );
}
