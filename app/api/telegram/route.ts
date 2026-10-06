import { z } from "zod";
import { json } from "@/lib/api";
import { replyTo } from "@/lib/alerts/commands";
import { secretMatches } from "@/lib/alerts/secret";
import { sendTelegram } from "@/lib/alerts/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const update = z.object({
  message: z
    .object({
      chat: z.object({ id: z.union([z.number(), z.string()]), type: z.string() }),
      text: z.string().max(500).optional(),
    })
    .optional(),
});

/** Telegram webhook. Registered with setWebhook and secret_token = TELEGRAM_WEBHOOK_SECRET. */
export async function POST(req: Request): Promise<Response> {
  if (!secretMatches(req.headers.get("x-telegram-bot-api-secret-token"), "TELEGRAM_WEBHOOK_SECRET")) {
    return json({ ok: false }, 401);
  }
  const parsed = update.safeParse(await req.json().catch(() => null));
  const msg = parsed.success ? parsed.data.message : undefined;
  // Always answer 200 so Telegram doesn't retry a message we can't handle.
  if (!msg?.text || msg.chat.type !== "private") return json({ ok: true });
  const chatId = String(msg.chat.id);
  try {
    await sendTelegram(chatId, await replyTo(chatId, msg.text));
  } catch (err) {
    console.error("telegram webhook", err instanceof Error ? err.message : err);
    await sendTelegram(chatId, "Something went wrong on our side. Try again in a minute.").catch(() => {});
  }
  return json({ ok: true });
}
