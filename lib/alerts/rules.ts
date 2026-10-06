import { backToSafe, type Health } from "@/lib/engine/risk";
import { fmtDuration } from "@/lib/engine/sizing";

export interface AlertLoan {
  marketId: string;
  ticker: string;
  loanSymbol: string;
  debtUsd: number;
  collateralUsd: number;
  shares: number;
  lltv: number;
  cushion: number | null;
  liquidationPricePerShare: number | null;
  health: Health;
  /** Set when a real market close is under four hours away. */
  closesAt: number | null;
}

export interface PrevState {
  health: Health | null;
  closingFor: number | null;
}

export interface Decision {
  marketId: string;
  next: { health: Health; closingFor: number | null };
  message: string | null;
}

const RANK: Record<Health, number> = { safe: 0, watch: 1, at_risk: 2 };
const LABEL: Record<Health, string> = { safe: "Safe", watch: "Watch", at_risk: "At risk" };

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function fixLine(l: AlertLoan): string {
  const price = l.shares > 0 ? l.collateralUsd / l.shares : 0;
  const fix = backToSafe(l, price);
  return fix
    ? `Back to safe: repay ${money(fix.repayUsd)} ${l.loanSymbol}, or add ${fix.addShares.toFixed(4)} shares.`
    : "";
}

function riskLine(l: AlertLoan): string {
  const parts = [];
  if (l.cushion !== null) parts.push(`${pct(l.cushion)} price drop before part of your ${l.ticker} is sold`);
  if (l.liquidationPricePerShare !== null) parts.push(`risk price $${money(l.liquidationPricePerShare)} a share`);
  return parts.join(", ");
}

/**
 * One decision per loan with debt. Alerts when health gets worse, when it recovers to safe,
 * and once per market close when the loan is not safe. A loan seen for the first time is
 * recorded quietly unless it is already not safe.
 */
export function decide(loan: AlertLoan, prev: PrevState | undefined, link: string): Decision {
  const next = { health: loan.health, closingFor: prev?.closingFor ?? null };
  const lines: string[] = [];
  const was = prev?.health ?? null;

  if (was === null ? loan.health !== "safe" : RANK[loan.health] > RANK[was]) {
    lines.push(`${loan.ticker} loan is now ${LABEL[loan.health]}.`, `${riskLine(loan)}.`, fixLine(loan));
  } else if (was !== null && was !== "safe" && loan.health === "safe") {
    lines.push(`${loan.ticker} loan is back to Safe. ${riskLine(loan)}.`);
  }

  if (loan.closesAt && loan.closesAt !== prev?.closingFor && loan.health !== "safe") {
    next.closingFor = loan.closesAt;
    if (lines.length === 0) {
      lines.push(
        `US market closes in ${fmtDuration(loan.closesAt - Date.now())}. Your ${loan.ticker} loan is ${LABEL[loan.health]}: ${riskLine(loan)}.`,
        "Prices can jump while the market is closed.",
        fixLine(loan),
      );
    }
  }

  const body = lines.filter(Boolean);
  return { marketId: loan.marketId, next, message: body.length ? `${body.join("\n")}\n${link}` : null };
}

export function statusText(address: string, loans: AlertLoan[], link: (marketId: string) => string): string {
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  if (loans.length === 0) return `${short}: no open loans.`;
  return [
    `${short}:`,
    ...loans.map(
      (l) => `${l.ticker}: ${LABEL[l.health]}, owe ${money(l.debtUsd)} ${l.loanSymbol}. ${riskLine(l)}. ${link(l.marketId)}`,
    ),
  ].join("\n");
}
