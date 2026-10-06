import "server-only";
import { listPositions, type PositionSummary } from "@/lib/engine/positions";
import { getAlertStates, listWatches, saveAlertState } from "@/lib/store/alerts";
import { decide, type AlertLoan } from "./rules";
import { sendTelegram } from "./telegram";

export function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

export const loanLink = (marketId: string) => `${siteUrl()}/app/loan/${marketId}`;

export function toAlertLoan(p: PositionSummary): AlertLoan {
  return {
    marketId: p.marketId,
    ticker: p.ticker,
    loanSymbol: p.loanSymbol,
    debtUsd: p.risk.debtUsd,
    collateralUsd: p.risk.collateralUsd,
    shares: p.collateral.shares,
    lltv: p.risk.lltv,
    cushion: p.risk.cushion,
    liquidationPricePerShare: p.risk.liquidationPricePerShare,
    health: p.risk.health,
    closesAt: p.sizing.notices.find((n) => n.code === "CLOSING_SOON")?.closesAt ?? null,
  };
}

export async function loansFor(address: string): Promise<AlertLoan[]> {
  return (await listPositions(address)).filter((p) => p.debt > 0n).map(toAlertLoan);
}

export interface CheckResult {
  watches: number;
  sent: number;
  errors: number;
}

/** Checks every watched wallet once and sends what changed. Positions are read once per wallet. */
export async function runAlertCheck(): Promise<CheckResult> {
  const watches = await listWatches();
  const byAddress = new Map<string, string[]>();
  for (const w of watches) byAddress.set(w.address, [...(byAddress.get(w.address) ?? []), w.chatId]);
  let sent = 0;
  let errors = 0;
  for (const [address, chats] of byAddress) {
    let loans: AlertLoan[];
    try {
      loans = await loansFor(address);
    } catch (err) {
      errors += 1;
      console.error("alert check: positions failed", address, err instanceof Error ? err.message : err);
      continue;
    }
    for (const chatId of chats) {
      const states = await getAlertStates(chatId, address);
      for (const loan of loans) {
        const d = decide(loan, states.get(loan.marketId), loanLink(loan.marketId));
        try {
          if (d.message) {
            await sendTelegram(chatId, d.message);
            sent += 1;
          }
          await saveAlertState(chatId, address, { marketId: d.marketId, ...d.next });
        } catch (err) {
          errors += 1;
          console.error("alert check: send failed", chatId, err instanceof Error ? err.message : err);
        }
      }
    }
  }
  return { watches: watches.length, sent, errors };
}
