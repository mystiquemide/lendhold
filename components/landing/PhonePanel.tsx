import { LogoMark } from "@/components/ui/Logo";
import type { ShareExample } from "@/lib/engine/snapshot";
import { fmt2 } from "./format";

const fillTone = { safe: "bg-safe-tint", watch: "bg-watch-tint", at_risk: "bg-risk-tint" } as const;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line py-2 text-[13px] leading-5 last:border-b-0">
      <span className="text-muted">{label}</span>
      <span className="num text-ink">{value}</span>
    </div>
  );
}

export function PhonePanel({ example: e }: { example: ShareExample }) {
  const label = `Lendhold borrow screen for one ${e.name} share: safe to borrow ${fmt2(e.safeBorrow)} ${e.loanSymbol}, risk price $${e.riskPricePerShare === null ? "not applicable" : fmt2(e.riskPricePerShare)}`;
  const riskAt = e.riskPricePerShare === null ? null : Math.min(1, Math.max(0, e.riskPricePerShare / e.sharePrice));
  return (
    <div
      role="img"
      aria-label={label}
      className="flex w-[300px] flex-col overflow-hidden rounded-[44px] border border-line bg-sheet px-5 py-6 shadow-float md:z-30 md:absolute md:left-[49px] md:bottom-0"
    >
      <div aria-hidden="true" className="flex flex-col gap-3">
        <div className="flex items-center gap-1.5 text-ink">
          <LogoMark className="size-5" />
          <span className="text-[15px] leading-none tracking-[-0.02em]">lendhold</span>
        </div>
        <div>
          <p className="text-xl leading-6 text-ink">Borrow against {e.name}</p>
          <p className="text-[13px] leading-5 text-muted">Example: 1 share at today&apos;s price</p>
        </div>
        <span className="num w-fit rounded-pill bg-safe-tint px-2.5 py-1 text-xs leading-4 text-safe">
          1.000 {e.ticker} held
        </span>
        <p className="num text-[40px] leading-[44px] tracking-[-0.02em] text-ink">${fmt2(e.safeBorrow)}</p>
        <div>
          <Row label="Safe up to" value={`${fmt2(e.safeBorrow)} ${e.loanSymbol}`} />
          <Row label="Most" value={`${fmt2(e.maxBorrow)} ${e.loanSymbol}`} />
          <Row label="Minimum" value={`${fmt2(e.minLoan)} ${e.loanSymbol}`} />
          <Row label="Interest" value={`${fmt2(e.aprPct)}% a year`} />
        </div>
        {riskAt !== null && e.cushionPct !== null && e.riskPricePerShare !== null && (
          <div>
            <p className="num mb-2 text-xs leading-4 text-ink">Cushion {Math.round(e.cushionPct)}%</p>
            <div className="relative h-2 rounded-pill bg-canvas">
              <div className={`absolute inset-y-0 right-0 rounded-pill ${fillTone[e.health]}`} style={{ left: `${riskAt * 100}%` }} />
              <div className="absolute -top-1 h-4 w-0.5 bg-risk" style={{ left: `${riskAt * 100}%` }} />
              <div className="absolute -top-px right-0 size-2.5 rounded-full bg-ink" />
            </div>
            <div className="num mt-2 flex justify-between text-xs leading-4 text-muted">
              <span>Risk price ${fmt2(e.riskPricePerShare)}</span>
              <span>Lista price ${fmt2(e.sharePrice)}</span>
            </div>
          </div>
        )}
        <div className="mt-3 flex h-12 items-center justify-center rounded-pill bg-action text-base text-on-action">Review</div>
      </div>
    </div>
  );
}
