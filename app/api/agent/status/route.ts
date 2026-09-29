import { handle, json } from "@/lib/api";
import { AgentError, ensureAgentReady, getBaw } from "@/lib/agent/baw";
import { requireOperator } from "@/lib/agent/auth";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  requireOperator(req);
  const baw = getBaw();
  const maxUsdPerRun = getConfig().AGENT_MAX_USD_PER_RUN;
  let status: string;
  try {
    status = await baw.walletStatus();
  } catch (err) {
    const message = err instanceof AgentError ? err.message : "baw is not available";
    return json({ status: "UNAVAILABLE", message, maxUsdPerRun });
  }
  if (status !== "CONNECTED") return json({ status, maxUsdPerRun, blockers: [{ code: "SESSION_MISSING", message: `Agentic Wallet is ${status}` }] });

  const ready = await ensureAgentReady(0, baw);
  const s = ready.settings;
  const balances = await baw.walletBalance({ binanceChainId: "56" }).catch(() => []);
  return json({
    status,
    address: ready.address ?? null,
    ready: ready.ok,
    blockers: ready.blockers,
    maxUsdPerRun,
    devMode: s
      ? {
          enabled: s.devMode.enabled,
          expiresAt: s.devMode.expiresAt ?? null,
          dailyLimit: s.devMode.dailyLimit ?? null,
          quotaUsed: s.developerModeQuotaUsed,
          balanceExceeded: s.devMode.balanceExceeded ?? false,
        }
      : null,
    quotas: s ? { dailyLimit: s.dailyLimit, quotaUsed: s.quotaUsed, quotaLeft: s.quotaLeft, defiQuotaLeft: s.defiQuotaLeft ?? null } : null,
    limits: s ? { tradeAllTokens: s.tradeAllTokens, abnormalTxnHandling: s.abnormalTxnHandling } : null,
    sessionExpireTime: s?.sessionExpireTime ?? null,
    inactiveSignOutTime: s?.inactiveSignOutTime ?? null,
    balances,
  });
});
