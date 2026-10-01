import type { Health } from "@/lib/engine/risk";
import { cn } from "./cn";

const fillTone: Record<Health, string> = { safe: "bg-safe-tint", watch: "bg-watch-tint", at_risk: "bg-risk-tint" };

const usd = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Risk price on the left, current price on the right. Only drawn from real numbers. */
export function CushionRuler({
  riskPrice,
  price,
  cushionPct,
  health,
  priceLabel = "Price",
  className,
}: {
  riskPrice: number;
  price: number;
  cushionPct: number;
  health: Health;
  priceLabel?: string;
  className?: string;
}) {
  const at = Math.min(1, Math.max(0, riskPrice / price)) * 100;
  return (
    <div
      role="img"
      aria-label={`Cushion ${Math.round(cushionPct)}%: risk price $${usd.format(riskPrice)}, ${priceLabel.toLowerCase()} $${usd.format(price)}`}
      className={className}
    >
      <div aria-hidden="true">
        <p className="num mb-3 text-[15px] leading-5 text-ink">Cushion {Math.round(cushionPct)}%</p>
        <div className="relative h-2 rounded-pill bg-canvas">
          <div className="absolute inset-y-0 left-0 rounded-pill bg-line" style={{ width: `${at}%` }} />
          <div className={cn("absolute inset-y-0 right-0 rounded-pill", fillTone[health])} style={{ left: `${at}%` }} />
          <div className="absolute -top-1.5 h-5 w-0.5 bg-risk" style={{ left: `${at}%` }} />
          <div className="absolute -top-1 right-0 size-4 rounded-full border-2 border-sheet bg-ink" />
        </div>
        <div className="num mt-3 flex justify-between gap-4 text-[13px] leading-5">
          <span className="text-risk">Risk price ${usd.format(riskPrice)}</span>
          <span className="text-muted">
            {priceLabel} ${usd.format(price)}
          </span>
        </div>
      </div>
    </div>
  );
}
