import { connection } from "next/server";
import { CushionRuler } from "@/components/ui/CushionRuler";
import { getShareExample, getStockSnapshot } from "@/lib/engine/snapshot";
import { fmt2 } from "./format";

function settled<T>(name: string, result: PromiseSettledResult<T>): T | null {
  if (result.status === "fulfilled") return result.value;
  console.error(`the risk: ${name} unavailable`, result.reason);
  return null;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-4 text-[15px] leading-5 md:text-[17px] md:leading-6">
      <span className="text-body">{label}</span>
      <span className="num text-right text-ink">{value}</span>
    </div>
  );
}

export async function TheRisk() {
  await connection();
  const [snap, ex] = await Promise.allSettled([getStockSnapshot("NVDA"), getShareExample("NVDA")]);
  const s = settled("snapshot", snap);
  const e = settled("share example", ex);
  const ruler =
    e && e.riskPricePerShare !== null && e.cushionPct !== null
      ? { riskPrice: e.riskPricePerShare, price: e.sharePrice, cushionPct: e.cushionPct, health: e.health }
      : null;

  return (
    <section aria-labelledby="risk-title" className="bg-sheet">
      <div className="mx-auto max-w-[1224px] px-5 pb-12 md:px-6 md:pb-24">
        <div className="mb-8 flex max-w-[800px] flex-col gap-4 md:mb-12">
          <p className="text-sm leading-none uppercase tracking-[0.1em] text-[#333333]">The risk</p>
          <h2
            id="risk-title"
            className="text-balance text-[34px] leading-[38px] tracking-[-0.015em] text-ink md:text-[44px] md:leading-[48px] lg:text-[56px] lg:leading-[1.05]"
          >
            Know the risk price before you sign
          </h2>
        </div>
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
          <div>
            <p className="max-w-[540px] text-pretty text-base leading-6 text-body md:text-lg md:leading-normal">
              If NVIDIA falls to the risk price, part of your stock is sold to repay the loan. Lendhold shows that price on
              every screen, keeps extra room when the US market is closed, and tells you when you&apos;re getting close.
            </p>
            {(s || e) && (
              <div className="mt-6 border-t border-line">
                {s && <Fact label="Safe amount" value={`${Math.round(s.safePct)}% of your stock's value right now`} />}
                {e && <Fact label="Minimum loan" value={`${fmt2(e.minLoan)} ${e.loanSymbol} (set by Lista)`} />}
                {e && <Fact label="Interest" value={`${fmt2(e.aprPct)}% a year right now`} />}
              </div>
            )}
          </div>
          {ruler && (
            <div className="self-start rounded-[32px] bg-canvas p-6 md:rounded-[36px] md:p-9">
              <p className="text-[13px] leading-5 text-muted">Example: 1 NVIDIA share, safe amount</p>
              <CushionRuler {...ruler} priceLabel="Lista price" className="mt-6" />
              <p className="mt-6 text-[15px] leading-5 text-body">
                {s && !s.marketOpen
                  ? "The US market is closed, so the safe amount keeps extra room for a price gap at the open."
                  : "Borrowing less moves the risk price lower and the cushion wider."}
              </p>
            </div>
          )}
        </div>
        <p className="mt-10 text-xl leading-7 text-ink md:mt-12 md:text-2xl md:leading-8">We show facts. You decide.</p>
      </div>
    </section>
  );
}
