import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { toJson } from "@/lib/json";
import {
  createRun,
  latestShowcasePlan,
  listConfirmedSteps,
  listProofRuns,
  getRun,
  listRuns,
  openDb,
  updateRunStatus,
  upsertStep,
} from "@/lib/store/db";

let dir: string;
let db: Database.Database;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "lendhold-"));
  db = openDb(join(dir, "nested", "test.db"));
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("run store", () => {
  it("creates and reads a run with no steps", () => {
    const run = createRun(
      { path: "browser", address: "0xabc", action: "borrow", token: "TSLAon" },
      db,
    );
    expect(run.status).toBe("planned");
    const read = getRun(run.id, db);
    expect(read?.address).toBe("0xabc");
    expect(read?.steps).toEqual([]);
    expect(getRun("missing", db)).toBeUndefined();
  });

  it("returns steps ordered by idx", () => {
    const run = createRun({ path: "agent" }, db);
    upsertStep({ runId: run.id, idx: 1, kind: "swap", status: "pending" }, db);
    upsertStep({ runId: run.id, idx: 0, kind: "approve", status: "pending" }, db);
    expect(getRun(run.id, db)?.steps.map((s) => s.idx)).toEqual([0, 1]);
  });

  it("updates run status", () => {
    const run = createRun({ path: "browser" }, db);
    const updated = updateRunStatus(run.id, "running", db);
    expect(updated?.status).toBe("running");
    expect(getRun(run.id, db)?.status).toBe("running");
  });

  it("overwrites a step on the second upsert", () => {
    const run = createRun({ path: "browser" }, db);
    upsertStep({ runId: run.id, idx: 0, kind: "approve", status: "pending" }, db);
    upsertStep(
      { runId: run.id, idx: 0, kind: "approve", status: "sent", txHash: "0x1" },
      db,
    );
    const steps = getRun(run.id, db)!.steps;
    expect(steps).toHaveLength(1);
    expect(steps[0].status).toBe("sent");
    expect(steps[0].txHash).toBe("0x1");
  });

  it("lists runs newest first with a limit", () => {
    const a = createRun({ path: "browser" }, db);
    const b = createRun({ path: "agent" }, db);
    const c = createRun({ path: "browser" }, db);
    expect(listRuns(10, db).map((r) => r.id)).toEqual([c.id, b.id, a.id]);
    expect(listRuns(2, db)).toHaveLength(2);
  });

  it("accepts the skill path and rejects unknown paths", () => {
    expect(createRun({ path: "skill", address: "0xabc" }, db).path).toBe("skill");
    expect(() => db.prepare("INSERT INTO runs (id, path, status) VALUES ('y','other','planned')").run()).toThrow();
  });

  it("rebuilds a runs table created before the skill path and keeps its rows", () => {
    const legacy = join(dir, "legacy.db");
    const old = new Database(legacy);
    old.exec(`CREATE TABLE runs (
      id TEXT PRIMARY KEY,
      path TEXT CHECK(path IN ('browser','agent')),
      address TEXT, action TEXT, token TEXT, market_id TEXT,
      plan_json TEXT, status TEXT CHECK(status IN ('planned','running','done','failed','stopped')),
      created_at INTEGER, updated_at INTEGER
    );
    INSERT INTO runs VALUES ('r1','agent','0xabc','borrow','0xtok','0xmkt','{}','done',1,2);`);
    old.close();
    const migrated = openDb(legacy);
    expect(getRun("r1", migrated)).toMatchObject({ path: "agent", address: "0xabc", status: "done", createdAt: 1, updatedAt: 2 });
    expect(createRun({ path: "skill" }, migrated).path).toBe("skill");
    migrated.close();
    // opening again is a no-op
    const again = openDb(legacy);
    expect(listRuns(10, again)).toHaveLength(2);
    again.close();
  });

  it("rejects invalid status values", () => {
    expect(() =>
      db.prepare("INSERT INTO runs (id, path, status) VALUES ('x','browser','bogus')").run(),
    ).toThrow();
  });
});

describe("landing queries", () => {
  const plan = (action: string, labels: string[]) =>
    toJson({
      action,
      steps: labels.map((label, i) => ({ label, kind: i === 0 ? "approve" : "supplyCollateral", to: `0x${i}`, selector: "0xabcdef01", amount: 5n })),
      display: { sharesBefore: 0, sharesAfter: 1.5 },
    });

  it("lists confirmed steps with hashes, newest first, with plan labels", async () => {
    const a = createRun({ path: "agent", address: "0xA", action: "deposit", planJson: plan("deposit", ["Allow X", "Deposit X"]) }, db);
    upsertStep({ runId: a.id, idx: 0, kind: "approve", status: "confirmed", txHash: "0xh0" }, db);
    upsertStep({ runId: a.id, idx: 1, kind: "supplyCollateral", status: "pending" }, db);
    const b = createRun({ path: "skill", address: "0xB", action: "borrow", planJson: plan("borrow", ["Allow Y", "Deposit Y"]) }, db);
    await new Promise((r) => setTimeout(r, 5));
    upsertStep({ runId: b.id, idx: 1, kind: "supplyCollateral", status: "confirmed", txHash: "0xh1" }, db);
    upsertStep({ runId: b.id, idx: 0, kind: "approve", status: "confirmed", txHash: null }, db);
    const rows = listConfirmedSteps(5, db);
    expect(rows.map((r) => [r.txHash, r.label, r.path, r.address])).toEqual([
      ["0xh1", "Deposit Y", "skill", "0xB"],
      ["0xh0", "Allow X", "agent", "0xA"],
    ]);
    expect(listConfirmedSteps(1, db)).toHaveLength(1);
  });

  it("picks the latest done borrow, repay or deposit plan, else any done run", () => {
    expect(latestShowcasePlan(db)).toBeNull();
    const buy = createRun({ path: "browser", action: "buy", planJson: plan("buy", ["Buy"]) }, db);
    updateRunStatus(buy.id, "done", db);
    expect(latestShowcasePlan(db)?.action).toBe("buy");
    const dep = createRun({ path: "agent", action: "deposit", planJson: plan("deposit", ["Allow", "Deposit"]) }, db);
    updateRunStatus(dep.id, "done", db);
    const failed = createRun({ path: "agent", action: "borrow", planJson: plan("borrow", ["Allow"]) }, db);
    updateRunStatus(failed.id, "failed", db);
    const shown = latestShowcasePlan(db);
    expect(shown).toEqual({
      action: "deposit",
      path: "agent",
      steps: [
        { kind: "approve", to: "0x0", selector: "0xabcdef01" },
        { kind: "supplyCollateral", to: "0x1", selector: "0xabcdef01" },
      ],
      display: { sharesBefore: 0, sharesAfter: 1.5 },
    });
  });

  it("lists finished runs with confirmed transactions for proof", () => {
    const done = createRun({ path: "agent", action: "deposit", token: "0xabc" }, db);
    upsertStep({ runId: done.id, idx: 0, kind: "approve", status: "confirmed", txHash: "0xa0" }, db);
    upsertStep({ runId: done.id, idx: 1, kind: "supplyCollateral", status: "confirmed", txHash: "0xa1" }, db);
    updateRunStatus(done.id, "done", db);
    const failed = createRun({ path: "browser", action: "borrow" }, db);
    upsertStep({ runId: failed.id, idx: 0, kind: "approve", status: "confirmed", txHash: "0xb0" }, db);
    updateRunStatus(failed.id, "failed", db);
    const empty = createRun({ path: "skill", action: "repay" }, db);
    updateRunStatus(empty.id, "done", db);

    const rows = listProofRuns(3, db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ runId: done.id, path: "agent", action: "deposit", confirmedCount: 2, lastTxHash: "0xa1" });
  });
});
