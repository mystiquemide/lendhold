import { connection } from "next/server";
import { CircleCheck } from "lucide-react";
import { Pill } from "@/components/ui/Pill";
import { SwapCosts } from "./SwapCosts";
import { findStockToken } from "@/lib/engine/tokens";
import { getProofStats, listProofRuns, type ProofRun, type ProofStats } from "@/lib/store/db";
import { PATH_LABELS, shortHex, utcDate } from "@/components/landing/format";

async function symbolFor(token: string | null): Promise<string | null> {
  if (!token) return null;
  try {
    return (await findStockToken(token))?.symbol ?? null;
  } catch {
    return null;
  }
}

async function actionLabel(run: ProofRun): Promise<string> {
  const verb = run.action.charAt(0).toUpperCase() + run.action.slice(1);
  const symbol = await symbolFor(run.token);
  return symbol ? `${verb} ${symbol}` : verb;
}

export async function ProofRuns() {
  await connection();
  let runs: ProofRun[];
  let stats: ProofStats | null;
  try {
    [runs, stats] = await Promise.all([listProofRuns(100), getProofStats()]);
  } catch (err) {
    console.error("proof runs unavailable", err);
    runs = [];
    stats = null;
  }
  const labels = await Promise.all(runs.map(actionLabel));

  return (
    <main className="mx-auto w-full max-w-[1224px] px-5 pb-16 pt-32 md:px-6 md:pb-24 md:pt-40">
        <div className="mb-8 flex max-w-[800px] flex-col gap-4 md:mb-12">
          <p className="text-sm leading-none uppercase tracking-[0.1em] text-[#333333]">Proof</p>
          <h1
            className="text-balance text-[34px] leading-[38px] tracking-[-0.015em] text-ink md:text-[44px] md:leading-[48px] lg:text-[56px] lg:leading-[1.05]"
          >
            Every run is on BNB Chain
          </h1>
          <p className="max-w-[640px] text-pretty text-base leading-6 text-body md:text-lg md:leading-normal">
            Every finished Lendhold run with its confirmed transactions. Each step counts only after we check it on-chain:
            it succeeded, came from the right wallet and called the planned contract.
          </p>
        </div>
        {stats && stats.runs > 0 && (
          <dl className="mb-8 grid grid-cols-2 gap-3 md:mb-12 md:grid-cols-4">
            {[
              ["Finished runs", stats.runs],
              ["Confirmed transactions", stats.confirmedTxs],
              ["Wallets", stats.wallets],
              ["Agent and skill runs", stats.byPath.agent + stats.byPath.skill],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col gap-2 rounded-3xl bg-sheet p-6">
                <dt className="text-[13px] leading-5 text-muted">{label}</dt>
                <dd className="num text-[34px] leading-[38px] tracking-[-0.015em] text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {runs.length === 0 && (
          <p className="rounded-3xl bg-sheet p-6 text-base leading-6 text-body md:p-8">
            No finished runs yet. They show up here as soon as one is confirmed on BNB Chain.
          </p>
        )}
        <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {runs.map((run, i) => {
            const tx = shortHex(run.lastTxHash);
            return (
              <li key={run.runId} className="flex flex-col gap-6 rounded-3xl bg-sheet p-6 md:p-8">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[13px] leading-5 text-muted">{utcDate(run.finishedAt)}</p>
                    <span className="rounded-pill bg-canvas px-3 py-1 text-[13px] leading-5 text-ink">
                      {PATH_LABELS[run.path] ?? run.path}
                    </span>
                  </div>
                  <h3 className="text-[22px] leading-7 text-ink">{labels[i]}</h3>
                  <p className="inline-flex items-center gap-1.5 text-[15px] leading-5 text-safe">
                    <CircleCheck size={16} strokeWidth={1.75} aria-hidden="true" />
                    {run.status === "done"
                      ? `${run.confirmedCount} ${run.confirmedCount === 1 ? "transaction" : "transactions"} confirmed`
                      : `${run.confirmedCount} of ${run.stepCount} confirmed, then stopped`}
                  </p>
                </div>
                <Pill
                  variant="secondary"
                  on="white"
                  size="md"
                  href={`https://bscscan.com/tx/${run.lastTxHash}`}
                  external
                  aria-label={`View transaction ${tx} on BscScan`}
                  className="mt-auto self-start"
                >
                  View on BscScan
                </Pill>
              </li>
            );
          })}
        </ul>
        <SwapCosts />
    </main>
  );
}
