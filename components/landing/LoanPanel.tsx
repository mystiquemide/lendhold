import { connection } from "next/server";
import { getShareExample } from "@/lib/engine/snapshot";
import { fmt2 } from "./format";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-3.5 text-[15px] leading-5">
      <span className="text-body">{label}</span>
      <span className="num text-right text-ink">{value}</span>
    </div>
  );
}

export async function LoanPanel() {
  await connection();
  let e;
  try {
    e = await getShareExample("NVDA");
  } catch (err) {
    console.error("who it's for loan panel unavailable", err);
    return null;
  }
  const owe = `${fmt2(e.safeBorrow)} ${e.loanSymbol}`;
  const monthly = `${fmt2((e.safeBorrow * e.aprPct) / 100 / 12)} ${e.loanSymbol}`;
  const risk = e.riskPricePerShare === null ? null : `$${fmt2(e.riskPricePerShare)}`;
  const label = `Lendhold loan screen for one ${e.name} share: you owe ${owe}, about ${monthly} interest a month${risk ? `, risk price ${risk}` : ""}`;

  return (
    <div className="mt-10 ml-6 -mb-7 w-[460px] max-w-[calc(100%-24px)] md:ml-9 lg:mt-0 lg:ml-0 lg:max-w-none">
      <div role="img" aria-label={label} className="rounded-t-3xl bg-sheet p-7 pb-14">
        <div aria-hidden="true">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-[22px] leading-7 text-ink">Your loan</p>
            <p className="text-[13px] leading-5 text-muted">Example: 1 {e.name} share</p>
          </div>
          <p className="num mt-4 text-[40px] leading-[44px] tracking-[-0.02em] text-ink">{owe}</p>
          <p className="text-[13px] leading-5 text-muted">You owe</p>
          <div className="mt-3">
            <Row label="Interest" value={`About ${monthly} a month`} />
            <Row label="Your stock" value={`1.000 ${e.ticker}, still yours`} />
            {risk && <Row label="Risk price" value={`${e.name} below ${risk}`} />}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="flex h-12 items-center justify-center rounded-pill bg-action text-base text-on-action">Repay</div>
            <div className="flex h-12 items-center justify-center rounded-pill bg-canvas text-base text-ink">Add stock</div>
          </div>
        </div>
      </div>
    </div>
  );
}
