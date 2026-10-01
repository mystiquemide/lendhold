import { connection } from "next/server";
import { getShareExample } from "@/lib/engine/snapshot";
import { fmt2 } from "./format";

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-3.5 text-[15px] leading-5">
      <span className="text-body">{label}</span>
      <span className="num flex items-center gap-2 text-right text-ink">
        {children}
      </span>
    </div>
  );
}

export async function ReviewPanel() {
  await connection();
  let e;
  try {
    e = await getShareExample("NVDA");
  } catch (err) {
    console.error("how it works review panel unavailable", err);
    return null;
  }
  const amount = `${fmt2(e.safeBorrow)} ${e.loanSymbol}`;
  const risk =
    e.riskPricePerShare === null ? null : `$${fmt2(e.riskPricePerShare)}`;
  const label = `Lendhold review screen for one ${e.name} share: you keep 1.000 ${e.ticker}, you get ${amount}, you owe ${amount}${risk ? `, risk price below ${risk}` : ""}`;

  return (
    <div className="lg:flex-1 lg:pl-12 lg:pt-[52px]">
      <div className="mt-8 ml-6 -mb-7 w-[460px] max-w-[calc(100%-24px)] md:ml-9 lg:mt-0 lg:ml-0 lg:max-w-none">
        <div
          role="img"
          aria-label={label}
          className="rounded-t-3xl border border-line bg-sheet p-7 shadow-float"
        >
          <div aria-hidden="true">
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-[22px] leading-7 text-ink">Review</p>
              <p className="text-[13px] leading-5 text-muted">
                Example: 1 {e.name} share, safe amount
              </p>
            </div>
            <div className="mt-2">
              <Row label="You keep">
                1.000 {e.ticker}
                <span className="rounded-pill bg-safe-tint px-2 py-0.5 text-xs leading-4 text-safe">
                  held
                </span>
              </Row>
              <Row label="You get">{amount}</Row>
              <Row label="You owe">{amount}</Row>
              <Row label="Interest">{fmt2(e.aprPct)}% a year</Row>
              {risk && (
                <div className="border-b border-line pb-3.5">
                  <div className="flex items-center justify-between gap-4 pt-3.5 text-[15px] leading-5">
                    <span className="text-body">Risk price</span>
                    <span className="num text-right text-ink">
                      {e.name} below {risk}
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] leading-5 text-muted">
                    Below this, part of your stock is sold to repay.
                  </p>
                </div>
              )}
            </div>
            <div className="mt-5 flex h-[52px] items-center justify-center rounded-pill bg-action text-[17px] text-on-action">
              Confirm and borrow
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
