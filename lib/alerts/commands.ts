import "server-only";
import { isAddress } from "viem";
import { addWatch, listWatches, MAX_WATCHES_PER_CHAT, removeWatch } from "@/lib/store/alerts";
import { statusText } from "./rules";
import { loanLink, loansFor } from "./service";

const HELP = [
  "Lendhold sends a message when a loan moves toward its risk price, and before the US market closes if a loan isn't safe.",
  "",
  "/watch 0x… start watching a wallet",
  "/unwatch 0x… stop (or /unwatch to stop all)",
  "/status your loans now",
].join("\n");

/** Turns one incoming chat message into the reply text. */
export async function replyTo(chatId: string, text: string): Promise<string> {
  const [rawCmd, arg] = text.trim().split(/\s+/, 2);
  const cmd = rawCmd.toLowerCase().replace(/@\w+$/, "");

  if ((cmd === "/start" && arg) || cmd === "/watch") {
    if (!arg || !isAddress(arg)) return "Send /watch followed by your BNB Chain wallet address, like /watch 0xAbc…";
    if (!(await addWatch(chatId, arg))) return `You can watch up to ${MAX_WATCHES_PER_CHAT} wallets. /unwatch one first.`;
    const loans = await loansFor(arg);
    return `Watching ${arg.slice(0, 6)}…${arg.slice(-4)}. Checked every 5 minutes.\n\n${statusText(arg, loans, loanLink)}`;
  }
  if (cmd === "/unwatch") {
    if (arg && !isAddress(arg)) return "That isn't a wallet address.";
    const n = await removeWatch(chatId, arg);
    return n === 0 ? "Nothing to stop." : `Stopped watching ${n === 1 ? "1 wallet" : `${n} wallets`}.`;
  }
  if (cmd === "/status") {
    const watches = await listWatches(chatId);
    if (watches.length === 0) return "No wallets watched yet. /watch 0x… to start.";
    const parts = await Promise.all(watches.map(async (w) => statusText(w.address, await loansFor(w.address), loanLink)));
    return parts.join("\n\n");
  }
  return HELP;
}
