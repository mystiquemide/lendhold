import { Bell } from "lucide-react";

const BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT?.replace(/^@/, "");

/** Opens the Lendhold bot with the wallet prefilled, so one tap starts watching it. Hidden until a bot is set. */
export function AlertsLink({ address }: { address: string | null | undefined }) {
  if (!BOT || !address) return null;
  return (
    <a
      href={`https://t.me/${BOT}?start=${address}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center gap-2 self-start text-[15px] leading-6 text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
    >
      <Bell size={18} strokeWidth={1.75} aria-hidden="true" />
      Get alerts on Telegram
    </a>
  );
}
