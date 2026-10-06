import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decide, statusText, type AlertLoan } from "@/lib/alerts/rules";
import { addWatch, getAlertStates, listWatches, MAX_WATCHES_PER_CHAT, removeWatch, saveAlertState } from "@/lib/store/alerts";
import { openDb } from "@/lib/store/db";
import type { Sql } from "@/lib/store/sql";

const loan = (over: Partial<AlertLoan> = {}): AlertLoan => ({
  marketId: "0xm",
  ticker: "TSLA",
  loanSymbol: "USD1",
  debtUsd: 600,
  collateralUsd: 1000,
  shares: 10,
  lltv: 0.75,
  cushion: 0.2,
  liquidationPricePerShare: 80,
  health: "watch",
  closesAt: null,
  ...over,
});

describe("alert rules", () => {
  it("alerts when health gets worse, with the back-to-safe amounts", () => {
    const d = decide(loan(), { health: "safe", closingFor: null }, "L");
    expect(d.message).toContain("TSLA loan is now Watch");
    expect(d.message).toContain("repay 150.00 USD1");
    expect(d.message).toContain("add 3.3333 shares");
    expect(d.message?.endsWith("\nL")).toBe(true);
    expect(d.next.health).toBe("watch");
  });

  it("stays quiet while health is unchanged", () => {
    expect(decide(loan(), { health: "watch", closingFor: null }, "L").message).toBeNull();
  });

  it("records a safe loan seen for the first time without a message", () => {
    const d = decide(loan({ health: "safe" }), undefined, "L");
    expect(d.message).toBeNull();
    expect(d.next.health).toBe("safe");
  });

  it("says when a loan recovers to safe", () => {
    expect(decide(loan({ health: "safe" }), { health: "at_risk", closingFor: null }, "L").message).toContain("back to Safe");
  });

  it("reminds once per market close for a loan that isn't safe", () => {
    const closesAt = Date.now() + 2 * 3600e3;
    const first = decide(loan({ closesAt }), { health: "watch", closingFor: null }, "L");
    expect(first.message).toContain("US market closes in");
    expect(first.next.closingFor).toBe(closesAt);
    expect(decide(loan({ closesAt }), first.next, "L").message).toBeNull();
  });

  it("no close reminder for a safe loan", () => {
    const d = decide(loan({ health: "safe", closesAt: Date.now() + 3600e3 }), { health: "safe", closingFor: null }, "L");
    expect(d.message).toBeNull();
  });

  it("status lists each loan, or says there are none", () => {
    const addr = "0xAbf039f2DC31084F5E0713708C96068126a043e9";
    expect(statusText(addr, [], () => "")).toBe("0xAbf0…43e9: no open loans.");
    expect(statusText(addr, [loan()], (id) => `/loan/${id}`)).toContain("TSLA: Watch, owe 600.00 USD1");
  });
});

describe("alert store", () => {
  let dir: string;
  let db: Sql;
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "lendhold-alerts-"));
    db = await openDb(join(dir, "a.db"));
  });
  afterEach(() => {
    db.close?.();
    rmSync(dir, { recursive: true, force: true });
  });

  it("adds, caps, lists and removes watches, clearing their state", async () => {
    expect(await addWatch("1", "0xAA", db)).toBe(true);
    expect(await addWatch("1", "0xaa", db)).toBe(true);
    for (let i = 0; i < MAX_WATCHES_PER_CHAT - 1; i++) await addWatch("1", `0x${i}`, db);
    expect(await addWatch("1", "0xff", db)).toBe(false);
    expect(await listWatches("1", db)).toHaveLength(MAX_WATCHES_PER_CHAT);

    await saveAlertState("1", "0xAA", { marketId: "m", health: "watch", closingFor: 5 }, db);
    expect((await getAlertStates("1", "0xaa", db)).get("m")).toEqual({ marketId: "m", health: "watch", closingFor: 5 });
    await saveAlertState("1", "0xaa", { marketId: "m", health: "safe", closingFor: null }, db);
    expect((await getAlertStates("1", "0xaa", db)).get("m")?.health).toBe("safe");

    expect(await removeWatch("1", "0xAA", db)).toBe(1);
    expect((await getAlertStates("1", "0xaa", db)).size).toBe(0);
    expect(await removeWatch("1", undefined, db)).toBe(MAX_WATCHES_PER_CHAT - 1);
    expect(await listWatches(undefined, db)).toEqual([]);
  });
});
