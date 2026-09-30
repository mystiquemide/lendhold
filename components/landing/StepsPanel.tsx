import { CircleCheck, ExternalLink } from "lucide-react";
import type { ConfirmedStep } from "@/lib/store/db";
import { PATH_LABELS, shortHex, utcDate } from "./format";

export function StepsPanel({ rows }: { rows: ConfirmedStep[] }) {
  const wallet = rows[0]?.address ?? null;
  return (
    <section
      aria-label="Latest transactions on BNB Chain"
      className="w-full rounded-2xl border border-line bg-sheet p-6 shadow-float md:z-20 md:absolute md:left-[367px] md:top-[184px] md:w-[720px]"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] leading-6 text-ink">Latest on BNB Chain</h2>
        {wallet && <span className="rounded-pill bg-canvas px-3 py-1 font-mono text-[13px] leading-5 text-ink">{shortHex(wallet)}</span>}
      </div>
      <ul className="mt-4 divide-y divide-line">
        {rows.map((row) => {
          const short = shortHex(row.txHash);
          return (
            <li key={`${row.runId}:${row.txHash}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
              <div className="min-w-0">
                <p className="text-[15px] leading-5 text-ink">{row.label ?? row.kind}</p>
                <p className="text-[13px] leading-5 text-muted">
                  {PATH_LABELS[row.path] ?? row.path} <span aria-hidden="true">·</span> {utcDate(row.confirmedAt)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1 text-[13px] leading-5 text-safe">
                  <CircleCheck size={16} strokeWidth={1.75} aria-hidden="true" />
                  Confirmed
                </span>
                <a
                  href={`https://bscscan.com/tx/${row.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`View transaction ${short} on BscScan`}
                  className="inline-flex items-center gap-1 font-mono text-[13px] leading-5 text-ink hover:underline"
                >
                  {short}
                  <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
                </a>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[13px] leading-5 text-muted">
        Each step is checked on-chain: it succeeded, came from this wallet and called the planned contract.
      </p>
    </section>
  );
}
