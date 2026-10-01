import { connection } from "next/server";
import { CircleCheck } from "lucide-react";
import { Pill } from "@/components/ui/Pill";
import { TextLink } from "@/components/ui/TextLink";
import { findStockToken } from "@/lib/engine/tokens";
import { listProofRuns, type ProofRun } from "@/lib/store/db";
import { PATH_LABELS, shortHex, utcDate } from "./format";

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

export async function Proof() {
  await connection();
  let runs: ProofRun[];
  try {
    runs = listProofRuns(3);
  } catch (err) {
    console.error("proof runs unavailable", err);
    return null;
  }
  if (runs.length === 0) return null;
  const labels = await Promise.all(runs.map(actionLabel));

  return (
    <section id="proof" aria-labelledby="proof-title" className="scroll-mt-24 bg-sheet">
      <div className="mx-auto max-w-[1224px] px-5 pb-12 md:px-6 md:pb-24">
        <div className="mb-8 flex max-w-[800px] flex-col gap-4 md:mb-12">
          <p className="text-sm leading-none uppercase tracking-[0.1em] text-[#333333]">Proof</p>
          <h2
            id="proof-title"
            className="text-balance text-[34px] leading-[38px] tracking-[-0.015em] text-ink md:text-[44px] md:leading-[48px] lg:text-[56px] lg:leading-[1.05]"
          >
            Every run is on BNB Chain
          </h2>
        </div>
        <ul className="grid gap-3 md:grid-cols-3">
          {runs.map((run, i) => {
            const tx = shortHex(run.lastTxHash);
            return (
              <li key={run.runId} className="flex flex-col gap-6 rounded-3xl bg-canvas p-6 md:p-8">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[13px] leading-5 text-muted">{utcDate(run.finishedAt)}</p>
                    <span className="rounded-pill bg-sheet px-3 py-1 text-[13px] leading-5 text-ink">
                      {PATH_LABELS[run.path] ?? run.path}
                    </span>
                  </div>
                  <h3 className="text-[22px] leading-7 text-ink">{labels[i]}</h3>
                  <p className="inline-flex items-center gap-1.5 text-[15px] leading-5 text-safe">
                    <CircleCheck size={16} strokeWidth={1.75} aria-hidden="true" />
                    {run.confirmedCount} {run.confirmedCount === 1 ? "transaction" : "transactions"} confirmed
                  </p>
                </div>
                <Pill
                  variant="secondary"
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
        <TextLink href="/runs" className="mt-8">
          See every run
        </TextLink>
      </div>
    </section>
  );
}
