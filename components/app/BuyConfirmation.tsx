"use client";

import { CircleCheck } from "lucide-react";
import { formatUnits } from "viem";
import { fmtShares, fmtUsd } from "@/lib/client/api";
import type { Plan } from "@/lib/engine/planner";
import { TokenIcon } from "./token";
import type { StockInfo } from "./StockHeader";

/** The finished-purchase card: the stock and the position first, the transaction underneath. */
export function BuyConfirmation({ plan, stock, priceNow }: { plan: Plan; stock: StockInfo | null; priceNow: number | null }) {
  const swap = plan.steps.find((s) => s.swap)?.swap;
  const spent = swap ? Number(formatUnits(swap.amountIn, swap.fromDecimals)) : null;
  const shares = plan.display.sharesAfter;
  const paidPerShare = spent != null && shares ? spent / shares : null;
  const ticker = stock?.ticker ?? swap?.toSymbol ?? "";
  const valueNow = priceNow != null && shares ? priceNow * shares : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 pt-2 text-center">
        <span className="[&>*]:size-16!">
          <TokenIcon src={stock?.logoUrl ?? null} ticker={ticker} />
        </span>
        <div>
          <h1 className="text-[26px] leading-8 tracking-[-0.01em] text-ink">{stock?.name ?? swap?.toSymbol ?? "Purchase"}</h1>
          <p className="num text-[15px] leading-6 text-muted">
            {ticker}
            {stock?.symbol ? ` · ${stock.symbol}` : ""}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-safe-tint px-3 py-1 text-[13px] leading-5 text-safe">
          <CircleCheck size={14} strokeWidth={2} aria-hidden="true" />
          Purchase confirmed
        </span>
      </div>

      <div className="rounded-input bg-canvas p-5 text-center">
        <p className="text-[13px] leading-5 text-muted">You now hold about</p>
        <p className="num mt-1 text-[40px] leading-[46px] tracking-[-0.02em] text-ink">
          {shares != null ? fmtShares(shares) : "-"}
          <span className="ml-2 text-lg text-muted">shares</span>
        </p>
        <p className="mt-1 text-[13px] leading-5 text-body">In your own wallet on BNB Chain</p>
      </div>

      <dl className="grid grid-cols-2 gap-3">
        <Stat label="Total invested" value={spent != null ? `${fmtUsd(spent)}` : "-"} sub={swap ? `Paid in ${swap.fromSymbol}` : undefined} />
        <Stat label="Price per share" value={paidPerShare != null ? fmtUsd(paidPerShare) : "-"} sub="Including swap cost" />
        <Stat label="Worth now" value={valueNow != null ? fmtUsd(valueNow) : "-"} sub={priceNow != null ? `${fmtUsd(priceNow)} a share` : undefined} />
        <Stat
          label="Can borrow"
          value={stock?.borrowable ? "Yes" : stock ? "No" : "-"}
          sub={stock?.borrowable ? "Use it as collateral on Lista" : stock ? "No Lista market yet" : undefined}
        />
      </dl>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-input border border-line p-4">
      <dt className="text-[13px] leading-5 text-muted">{label}</dt>
      <dd className="num text-[20px] leading-7 text-ink">{value}</dd>
      {sub && <dd className="text-[12px] leading-4 text-muted">{sub}</dd>}
    </div>
  );
}
