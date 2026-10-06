import "server-only";
import type { Health } from "@/lib/engine/risk";
import { getDb } from "./db";
import type { Sql } from "./sql";

export const MAX_WATCHES_PER_CHAT = 5;

export interface Watch {
  chatId: string;
  address: string;
}

export interface AlertState {
  marketId: string;
  health: Health | null;
  closingFor: number | null;
}

const resolve = (sql?: Sql) => (sql ? Promise.resolve(sql) : getDb());

/** Returns false when the chat already watches the maximum number of wallets. */
export async function addWatch(chatId: string, address: string, sql?: Sql): Promise<boolean> {
  const db = await resolve(sql);
  const addr = address.toLowerCase();
  const rows = await db.all<{ address: string }>("SELECT address FROM tg_watches WHERE chat_id = ?", [chatId]);
  if (rows.some((r) => r.address === addr)) return true;
  if (rows.length >= MAX_WATCHES_PER_CHAT) return false;
  await db.run("INSERT INTO tg_watches (chat_id, address, created_at) VALUES (?, ?, ?) ON CONFLICT(chat_id, address) DO NOTHING", [
    chatId,
    addr,
    Date.now(),
  ]);
  return true;
}

/** Removes one wallet, or every wallet for the chat when no address is given. Returns how many were removed. */
export async function removeWatch(chatId: string, address?: string, sql?: Sql): Promise<number> {
  const db = await resolve(sql);
  const where = address ? "chat_id = ? AND address = ?" : "chat_id = ?";
  const args = address ? [chatId, address.toLowerCase()] : [chatId];
  const before = await db.all<{ address: string }>(`SELECT address FROM tg_watches WHERE ${where}`, args);
  await db.run(`DELETE FROM tg_watches WHERE ${where}`, args);
  await db.run(`DELETE FROM tg_alert_state WHERE ${where}`, args);
  return before.length;
}

export async function listWatches(chatId?: string, sql?: Sql): Promise<Watch[]> {
  const db = await resolve(sql);
  const rows = await db.all<{ chat_id: string; address: string }>(
    chatId
      ? "SELECT chat_id, address FROM tg_watches WHERE chat_id = ? ORDER BY created_at"
      : "SELECT chat_id, address FROM tg_watches ORDER BY created_at",
    chatId ? [chatId] : [],
  );
  return rows.map((r) => ({ chatId: String(r.chat_id), address: r.address }));
}

export async function getAlertStates(chatId: string, address: string, sql?: Sql): Promise<Map<string, AlertState>> {
  const db = await resolve(sql);
  const rows = await db.all<{ market_id: string; health: Health | null; closing_for: number | string | null }>(
    "SELECT market_id, health, closing_for FROM tg_alert_state WHERE chat_id = ? AND address = ?",
    [chatId, address.toLowerCase()],
  );
  return new Map(
    rows.map((r) => [
      r.market_id,
      { marketId: r.market_id, health: r.health, closingFor: r.closing_for === null ? null : Number(r.closing_for) },
    ]),
  );
}

export async function saveAlertState(chatId: string, address: string, state: AlertState, sql?: Sql): Promise<void> {
  const db = await resolve(sql);
  await db.run(
    `INSERT INTO tg_alert_state (chat_id, address, market_id, health, closing_for, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(chat_id, address, market_id) DO UPDATE SET
       health = excluded.health, closing_for = excluded.closing_for, updated_at = excluded.updated_at`,
    [chatId, address.toLowerCase(), state.marketId, state.health, state.closingFor, Date.now()],
  );
}
