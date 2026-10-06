"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, LoaderCircle } from "lucide-react";
import { formatUnits } from "viem";
import { CushionRuler } from "@/components/ui/CushionRuler";
import { Notice } from "@/components/ui/Notice";
import { Pill } from "@/components/ui/Pill";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import { api, ApiError, fmtAmount, fmtShares } from "@/lib/client/api";
import { PANE_LEFT_BOTTOM, PANE_LEFT_TOP, PANE_RIGHT, SPLIT } from "./split";
import { useWallet } from "./WalletProvider";

interface Holding {
  address: string;
  symbol: string;
  name: string;
  ticker: string;
  platform: "bstock" | "ondo" | "xstocks";
  shares: number;
  perSharePrice: number | null;
  status: "ready" | "convert" | "unsupported";
  reason: string;
  matchingBStock?: { address: string; symbol: string };
}

interface PlanResponse {
  plan: {
    id: string;
    market: { id: string; loanSymbol: string; loanDecimals: number; minBorrow: string } | null;
    sizing: { safeBorrowNew: string; maxBorrowNew: string; notices: { code: string; message: string }[] } | null;
    notices: { code: string; message: string }[];
    blockers: { code: string; message: string }[];
    display: {
      sharesBefore: number | null;
      sharesAfter: number | null;
      riskPricePerShare: number | null;
      cushionPct: number | null;
      health: "safe" | "watch" | "at_risk" | null;
      conversionCostPct: number | null;
    };
  };
}

interface MarketOption {
  id: string;
  loanSymbol: string;
  lltv: number;
  availableUsd: number;
  aprPct: number;
}

const compactUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });

const units = (raw: string, decimals: number) => Number(formatUnits(BigInt(raw), decimals));

/** Two decimals, rounded down, so a prefilled amount never exceeds the limit it came from. */
const floor2 = (n: number) => (Math.floor(n * 100) / 100).toFixed(2);

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-3 text-[15px] leading-5 last:border-b-0">
      <span className="text-body">{label}</span>
      <span className="num text-right text-ink">{value}</span>
    </div>
  );
}

function blockerAction(code: string, h: Holding) {
  if (code === "NO_MARKET") return { label: "Back to your stocks", href: "/app" };
  if (code === "BELOW_MIN_LOAN" || code === "NO_COLLATERAL" || code === "INSUFFICIENT_BALANCE")
    return { label: `Buy more ${h.ticker}`, href: `/app/buy/${h.matchingBStock?.address ?? h.address}` };
  return null;
}

export function BorrowScreen({ token }: { token: string }) {
  const { address } = useWallet();
  const router = useRouter();
  const [holding, setHolding] = useState<Holding | null | undefined>(undefined);
  const [res, setRes] = useState<PlanResponse | null>(null);
  /** The amount and receive choice the current plan was built for. */
  const [plannedFor, setPlannedFor] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [receive, setReceive] = useState<"USDT" | "loan">("USDT");
  const [planning, setPlanning] = useState(false);
  /** null lets the planner pick the market with the most liquidity. */
  const [marketId, setMarketId] = useState<string | null>(null);
  const [markets, setMarkets] = useState<{ selectedId: string | null; markets: MarketOption[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const touched = useRef(false);

  const plan = useCallback(
    async (amt: string | null, rcv: "USDT" | "loan", mkt: string | null = null) => {
      if (!address) return;
      const my = ++seq.current;
      setPlanning(true);
      setError(null);
      try {
        const r = await api<PlanResponse>("/api/plan", {
          method: "POST",
          body: JSON.stringify({
            address,
            action: "borrow",
            token,
            receive: rcv,
            check: false,
            ...(amt ? { amount: amt } : {}),
            ...(mkt ? { marketId: mkt } : {}),
          }),
        });
        if (my !== seq.current) return;
        setRes(r);
        let planned = amt;
        if (!touched.current && r.plan.sizing && r.plan.market) {
          planned = floor2(units(r.plan.sizing.safeBorrowNew, r.plan.market.loanDecimals));
          setAmount(planned);
        }
        setPlannedFor(`${planned}|${rcv}|${mkt}`);
      } catch (err) {
        if (my === seq.current) setError(err instanceof ApiError ? err.message : "Something went wrong on our side");
      } finally {
        if (my === seq.current) setPlanning(false);
      }
    },
    [address, token],
  );

  useEffect(() => {
    if (!address) return;
    let live = true;
    api<{ holdings: Holding[] }>(`/api/holdings?address=${address}`)
      .then((r) => live && setHolding(r.holdings.find((h) => h.address.toLowerCase() === token.toLowerCase()) ?? null))
      .catch(() => live && setHolding(null));
    // First plan with the safe amount when the screen opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    plan(null, "USDT");
    return () => {
      live = false;
    };
  }, [address, token, plan]);

  useEffect(() => {
    if (!touched.current) return;
    const valid = /^\d+(\.\d+)?$/.test(amount) && Number(amount) > 0;
    if (!valid) return;
    const t = setTimeout(() => plan(amount, receive, marketId), 600);
    return () => clearTimeout(t);
  }, [amount, receive, marketId, plan]);

  const collateralAddress = holding?.platform === "ondo" ? holding.matchingBStock?.address : holding?.address;
  useEffect(() => {
    if (!collateralAddress || !address) return;
    let live = true;
    api<{ selectedId: string | null; markets: MarketOption[] }>(`/api/markets?collateral=${collateralAddress}&user=${address}`)
      .then((r) => live && setMarkets(r))
      .catch(() => live && setMarkets(null));
    return () => {
      live = false;
    };
  }, [collateralAddress, address]);

  const p = res?.plan;
  const m = p?.market;
  const sizing = p?.sizing;
  const safe = sizing && m ? units(sizing.safeBorrowNew, m.loanDecimals) : null;
  const max = sizing && m ? units(sizing.maxBorrowNew, m.loanDecimals) : null;
  const minLoan = m ? Math.ceil(units(m.minBorrow, m.loanDecimals) * 100) / 100 : null;
  const typed = Number(amount);
  const invalid = amount !== "" && !(/^\d+(\.\d+)?$/.test(amount) && typed > 0);
  const overMax = max !== null && typed > max;
  const blockers = p?.blockers ?? [];
  const notices = useMemo(() => {
    const all = [...(sizing?.notices ?? []), ...(p?.notices ?? [])];
    return all.filter((n, i) => all.findIndex((x) => x.code === n.code) === i);
  }, [sizing, p]);
  const d = p?.display;
  const loanIsUsdt = m?.loanSymbol === "USDT";
  const current = plannedFor === `${amount}|${receive}|${marketId}`;
  const liveMarkets = (markets?.markets ?? []).filter((o) => o.availableUsd > 0);
  const canReview = !!p && current && blockers.length === 0 && !invalid && !planning && amount !== "";

  if (holding === undefined) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <h1 className="sr-only">Borrow</h1>
        <Skeleton className="h-[420px] rounded-panel bg-sheet!" />
      </div>
    );
  }

  if (holding === null) {
    return (
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4">
        <Notice tone="watch" title="This stock isn't in your wallet">
          Pick a stock you hold from your list.
        </Notice>
        <Pill variant="secondary" on="cloud" href="/app">
          Back to your stocks
        </Pill>
      </div>
    );
  }

  const h = holding!;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/app" className="inline-flex min-h-11 items-center gap-1 self-start text-[15px] leading-6 text-ink hover:underline">
        <ChevronLeft size={18} strokeWidth={1.75} aria-hidden="true" />
        Your stocks
      </Link>

      <div className={cn(SPLIT, "gap-5")}>
        <div className={cn(PANE_LEFT_TOP, "lg:gap-5")}>
          <div>
            <h1 className="text-[26px] leading-8 tracking-[-0.01em] text-ink">Borrow against {h.name}</h1>
            <p className="num text-[15px] leading-6 text-muted">
              {fmtShares(h.shares)} {h.ticker} held
            </p>
            {h.platform === "ondo" && h.matchingBStock && (
              <p className="mt-2 text-[13px] leading-5 text-body">
                Your {h.symbol} becomes {h.matchingBStock.symbol} first.
                {d?.sharesBefore != null && d.sharesAfter != null && d.conversionCostPct != null
                  ? ` ${fmtShares(d.sharesBefore)} shares become ${fmtShares(d.sharesAfter)} shares, ${Math.max(d.conversionCostPct, 0).toFixed(2)}% conversion cost.`
                  : ""}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="amount" className="text-[13px] leading-5 text-muted">
              Amount to borrow
            </label>
            <div
              className={cn(
                "mt-1 flex items-baseline gap-2 rounded-input border bg-sheet px-4 py-3 focus-within:border-action",
                overMax || invalid ? "border-risk" : "border-line",
              )}
            >
              <input
                id="amount"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                placeholder="0.00"
                aria-invalid={overMax || invalid}
                aria-describedby="amount-help"
                onChange={(e) => {
                  touched.current = true;
                  setAmount(e.target.value.replace(",", ".").replace(/[^\d.]/g, ""));
                }}
                className="num w-full min-w-0 bg-transparent text-[36px] leading-[44px] tracking-[-0.02em] text-ink outline-none placeholder:text-line focus-visible:outline-none"
              />
              <span className="shrink-0 text-lg text-muted">{m?.loanSymbol ?? ""}</span>
              {planning && <LoaderCircle size={18} strokeWidth={1.75} className="shrink-0 animate-spin text-muted" aria-label="Updating" />}
            </div>
            <p id="amount-help" className="mt-2 text-[13px] leading-5 text-muted">
              {invalid ? "Enter a number like 25 or 25.50." : "Prefilled with the safe amount. Change it if you need less."}
            </p>
          </div>
        </div>

        <div className={cn(PANE_RIGHT, "lg:gap-5")}>

          {safe !== null && (
            <div>
              <div className="flex items-center justify-between gap-4 border-b border-line py-3 text-[15px] leading-5">
                <span className="text-body">Safe up to</span>
                <button
                  type="button"
                  onClick={() => {
                    touched.current = true;
                    setAmount(floor2(safe));
                  }}
                  className="num text-right text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
                >
                  {fmtAmount(safe)} {m?.loanSymbol}
                </button>
              </div>
              {max !== null && <Row label="Most" value={`${fmtAmount(max)} ${m?.loanSymbol}`} />}
              {minLoan !== null && <Row label="Minimum" value={`${fmtAmount(minLoan)} ${m?.loanSymbol}`} />}
            </div>
          )}

          {blockers.length === 0 && d?.riskPricePerShare != null && d.cushionPct != null && d.health && h.perSharePrice && (
            <CushionRuler
              riskPrice={d.riskPricePerShare}
              price={h.perSharePrice}
              cushionPct={d.cushionPct}
              health={d.health}
              priceLabel="Price now"
            />
          )}

          {liveMarkets.length > 1 && m && (
            <fieldset>
              <legend className="text-[13px] leading-5 text-muted">Lista market</legend>
              <div className="mt-2 flex flex-col gap-1">
                {liveMarkets.map((o) => {
                  const chosen = m.id.toLowerCase() === o.id.toLowerCase();
                  const best = o.id === markets?.selectedId;
                  return (
                    <label
                      key={o.id}
                      className={cn(
                        "flex min-h-11 cursor-pointer items-center gap-3 rounded-input border px-3 py-2 text-[15px] leading-5 has-focus-visible:outline-2 has-focus-visible:outline-action",
                        chosen ? "border-ink bg-sheet" : "border-line hover:border-ink",
                      )}
                    >
                      <input
                        type="radio"
                        name="market"
                        value={o.id}
                        checked={chosen}
                        onChange={() => {
                          // A new market has its own limits, so start again from its safe amount.
                          const next = best ? null : o.id;
                          touched.current = false;
                          setMarketId(next);
                          plan(null, receive, next);
                        }}
                        className="sr-only"
                      />
                      <span className="w-12 shrink-0 text-ink">{o.loanSymbol}</span>
                      <span className="num flex-1 whitespace-nowrap text-body">{o.aprPct.toFixed(2)}% APR</span>
                      <span className="num whitespace-nowrap text-right text-[13px] text-muted">
                        {compactUsd.format(o.availableUsd)} free
                        {new Set(liveMarkets.map((x) => x.lltv)).size > 1 ? ` · ${Math.round(o.lltv * 100)}% LLTV` : ""}
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-2 text-[13px] leading-5 text-muted">
                {new Set(liveMarkets.map((o) => o.lltv)).size === 1
                  ? `All at ${Math.round(liveMarkets[0].lltv * 100)}% LLTV. `
                  : ""}
                We pick the market with the most free liquidity. Rates move with use.
              </p>
            </fieldset>
          )}

          {notices.map((n) => (
            <Notice key={n.code} tone="watch">
              {n.message}
            </Notice>
          ))}

          {blockers.map((b) => {
            const act = blockerAction(b.code, h);
            return (
              <Notice
                key={b.code}
                tone="risk"
                action={
                  act ? (
                    <Pill variant="secondary" on="white" size="md" href={act.href}>
                      {act.label}
                    </Pill>
                  ) : undefined
                }
              >
                {b.message}
              </Notice>
            );
          })}

          {error && <Notice tone="risk">{error}</Notice>}
        </div>

        <div className={cn(PANE_LEFT_BOTTOM, "lg:gap-5")}>
          {m && !loanIsUsdt && (
            <fieldset>
              <legend className="text-[13px] leading-5 text-muted">You receive</legend>
              <div className="mt-2 grid grid-cols-2 gap-1 rounded-pill bg-canvas p-1">
                {(["USDT", "loan"] as const).map((opt) => (
                  <label
                    key={opt}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center justify-center rounded-pill text-[15px] leading-5 transition-colors duration-150 has-focus-visible:outline-2 has-focus-visible:outline-action",
                      receive === opt ? "bg-sheet text-ink" : "text-body hover:text-ink",
                    )}
                  >
                    <input
                      type="radio"
                      name="receive"
                      value={opt}
                      checked={receive === opt}
                      onChange={() => {
                        touched.current = true;
                        setReceive(opt);
                      }}
                      className="sr-only"
                    />
                    {opt === "USDT" ? "USDT" : m.loanSymbol}
                  </label>
                ))}
              </div>
              {receive === "USDT" && (
                <p className="mt-2 text-[13px] leading-5 text-muted">
                  Lista lends {m.loanSymbol}. We swap it to USDT in the same plan.
                </p>
              )}
            </fieldset>
          )}

          <Pill
            variant="primary"
            fullWidth
            disabled={!canReview}
            loading={planning}
            onClick={() => {
              if (!p) return;
              const q = new URLSearchParams({ amount, receive });
              router.push(`/app/review/${p.id}?${q}`);
            }}
          >
            Review
          </Pill>
        </div>
      </div>
    </div>
  );
}
