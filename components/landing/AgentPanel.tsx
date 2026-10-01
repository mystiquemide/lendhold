import { connection } from "next/server";
import { CircleCheck, ExternalLink } from "lucide-react";
import { listConfirmedSteps } from "@/lib/store/db";
import { PATH_LABELS, shortHex, utcDate } from "./format";

export async function AgentPanel() {
  await connection();
  let rows;
  try {
    rows = listConfirmedSteps(3, undefined, ["agent", "skill"]);
  } catch (err) {
    console.error("how it works agent panel unavailable", err);
    return null;
  }
  if (rows.length === 0) return null;

  return (
    <div className="ml-6 -mb-7 flex max-w-[calc(100%-24px)] flex-1 flex-col md:ml-9 lg:ml-12">
      <section aria-label="Latest agent steps on BNB Chain" className="flex-1 rounded-t-3xl border border-line bg-sheet p-7 pb-14">
        <p className="text-[17px] leading-6 text-ink">Latest agent steps</p>
        <ul className="mt-2 divide-y divide-line">
          {rows.map((row) => {
            const short = shortHex(row.txHash);
            return (
              <li key={`${row.runId}:${row.txHash}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
                <div className="min-w-0">
                  <p className="text-[15px] leading-5 text-ink">{row.label ?? row.kind}</p>
                  <p className="text-[13px] leading-5 text-muted">
                    {PATH_LABELS[row.path] ?? row.path} <span aria-hidden="true">·</span> {utcDate(row.confirmedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <CircleCheck size={16} strokeWidth={1.75} className="text-safe" aria-label="Confirmed" />
                  <a
                    href={`https://bscscan.com/tx/${row.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`View transaction ${short} on BscScan`}
                    className="inline-flex min-h-6 items-center gap-1 py-0.5 font-mono text-[13px] leading-5 text-ink hover:underline"
                  >
                    {short}
                    <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
