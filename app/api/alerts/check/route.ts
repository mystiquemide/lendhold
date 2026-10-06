import { handle, json } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { secretMatches } from "@/lib/alerts/secret";
import { runAlertCheck } from "@/lib/alerts/service";
import { telegramConfigured } from "@/lib/alerts/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Called by a scheduler every few minutes with `Authorization: Bearer $ALERTS_CRON_SECRET`. */
export const POST = handle(async (req) => {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  if (!secretMatches(bearer, "ALERTS_CRON_SECRET")) throw new AppError("UNAUTHORIZED", "Not allowed", 401);
  if (!telegramConfigured()) throw new AppError("NOT_CONFIGURED", "Telegram alerts are not set up", 503);
  return json(await runAlertCheck());
});
