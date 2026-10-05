import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { Sql } from "@/lib/store/sql";
import { toJson } from "@/lib/json";
import {
  createRun,
  latestShowcasePlan,
  listConfirmedSteps,
  listProofRuns,
  listRunsWithSteps,
  getRun,
  listRuns,
  openDb,
  updateRunStatus,
  upsertStep,
} from "@/lib/store/db";

let dir: string;
let db: Sql;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "lendhold-"));
  db = (await openDb(join(dir, "nested", "test.db")));
});

afterEach(() => {
  db.close?.();
  rmSync(dir, { recursive: true, force: true });
});

describe("run store", () => {
  it("creates and reads a run with no steps", async () => {
    const run = (await createRun(
      { path: "browser", address: "0xabc", action: "borrow", token: "TSLAon" },
      db,
    ));
    expect(run.status).toBe("planned");
    const read = (await getRun(run.id, db));
    expect(read?.address).toBe("0xabc");
    expect(read?.steps).toEqual([]);
    expect((await getRun("missing", db))).toBeUndefined();
  });

  it("returns steps ordered by idx", async () => {
    const run = (await createRun({ path: "agent" }, db));
    (await upsertStep({ runId: run.id, idx: 1, kind: "swap", status: "pending" }, db));
    (await upsertStep({ runId: run.id, idx: 0, kind: "approve", status: "pending" }, db));
    expect((await getRun(run.id, db))?.steps.map((s) => s.idx)).toEqual([0, 1]);
  });

  it("updates run status", async () => {
    const run = (await createRun({ path: "browser" }, db));
    const updated = (await updateRunStatus(run.id, "running", db));
    expect(updated?.status).toBe("running");
    expect((await getRun(run.id, db))?.status).toBe("running");
  });

  it("overwrites a step on the second upsert", async () => {
    const run = (await createRun({ path: "browser" }, db));
    (await upsertStep({ runId: run.id, idx: 0, kind: "approve", status: "pending" }, db));
    (await upsertStep(
      { runId: run.id, idx: 0, kind: "approve", status: "sent", txHash: "0x1" },
      db,
    ));
    const steps = (await getRun(run.id, db))!.steps;
    expect(steps).toHaveLength(1);
    expect(steps[0].status).toBe("sent");
    expect(steps[0].txHash).toBe("0x1");
  });

  it("lists runs newest first with a limit", async () => {
    const a = (await createRun({ path: "browser" }, db));
    const b = (await createRun({ path: "agent" }, db));
    const c = (await createRun({ path: "browser" }, db));
    expect((await listRuns(10, db)).map((r) => r.id)).toEqual([c.id, b.id, a.id]);
    expect((await listRuns(2, db))).toHaveLength(2);
  });

  it("accepts the skill path and rejects unknown paths", async () => {
    expect((await createRun({ path: "skill", address: "0xabc" }, db)).path).toBe("skill");
    await expect(db.run("INSERT INTO runs (id, path, status) VALUES ('y','other','planned')")).rejects.toThrow();
  });

  it("rebuilds a runs table created before the skill path and keeps its rows", async () => {
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
    const migrated = (await openDb(legacy));
    expect((await getRun("r1", migrated))).toMatchObject({ path: "agent", address: "0xabc", status: "done", createdAt: 1, updatedAt: 2 });
    expect((await createRun({ path: "skill" }, migrated)).path).toBe("skill");
    migrated.close?.();
    // opening again is a no-op
    const again = (await openDb(legacy));
    expect((await listRuns(10, again))).toHaveLength(2);
    again.close?.();
  });

  it("rejects invalid status values", async () => {
    await expect(db.run("INSERT INTO runs (id, path, status) VALUES ('x','browser','bogus')")).rejects.toThrow();
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
    const a = (await createRun({ path: "agent", address: "0xA", action: "deposit", planJson: plan("deposit", ["Allow X", "Deposit X"]) }, db));
    (await upsertStep({ runId: a.id, idx: 0, kind: "approve", status: "confirmed", txHash: "0xh0" }, db));
    (await upsertStep({ runId: a.id, idx: 1, kind: "supplyCollateral", status: "pending" }, db));
    const b = (await createRun({ path: "skill", address: "0xB", action: "borrow", planJson: plan("borrow", ["Allow Y", "Deposit Y"]) }, db));
    await new Promise((r) => setTimeout(r, 5));
    (await upsertStep({ runId: b.id, idx: 1, kind: "supplyCollateral", status: "confirmed", txHash: "0xh1" }, db));
    (await upsertStep({ runId: b.id, idx: 0, kind: "approve", status: "confirmed", txHash: null }, db));
    const rows = (await listConfirmedSteps(5, db));
    expect(rows.map((r) => [r.txHash, r.label, r.path, r.address])).toEqual([
      ["0xh1", "Deposit Y", "skill", "0xB"],
      ["0xh0", "Allow X", "agent", "0xA"],
    ]);
    expect((await listConfirmedSteps(1, db))).toHaveLength(1);
  });

  it("picks the latest done borrow, repay or deposit plan, else any done run", async () => {
    expect((await latestShowcasePlan(db))).toBeNull();
    const buy = (await createRun({ path: "browser", action: "buy", planJson: plan("buy", ["Buy"]) }, db));
    (await updateRunStatus(buy.id, "done", db));
    expect((await latestShowcasePlan(db))?.action).toBe("buy");
    const dep = (await createRun({ path: "agent", action: "deposit", planJson: plan("deposit", ["Allow", "Deposit"]) }, db));
    (await updateRunStatus(dep.id, "done", db));
    const failed = (await createRun({ path: "agent", action: "borrow", planJson: plan("borrow", ["Allow"]) }, db));
    (await updateRunStatus(failed.id, "failed", db));
    const shown = (await latestShowcasePlan(db));
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

  it("lists finished runs with confirmed transactions for proof", async () => {
    const done = (await createRun({ path: "agent", action: "deposit", token: "0xabc" }, db));
    (await upsertStep({ runId: done.id, idx: 0, kind: "approve", status: "confirmed", txHash: "0xa0" }, db));
    (await upsertStep({ runId: done.id, idx: 1, kind: "supplyCollateral", status: "confirmed", txHash: "0xa1" }, db));
    (await updateRunStatus(done.id, "done", db));
    const failed = (await createRun({ path: "browser", action: "borrow" }, db));
    (await upsertStep({ runId: failed.id, idx: 0, kind: "approve", status: "confirmed", txHash: "0xb0" }, db));
    (await updateRunStatus(failed.id, "failed", db));
    const empty = (await createRun({ path: "skill", action: "repay" }, db));
    (await updateRunStatus(empty.id, "done", db));

    const rows = (await listProofRuns(3, db));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ runId: done.id, path: "agent", action: "deposit", confirmedCount: 2, lastTxHash: "0xa1" });
  });

  it("lists runs with steps, filtered by wallet and path", async () => {
    const a = (await createRun({ path: "agent", address: "0xAbC" }, db));
    (await upsertStep({ runId: a.id, idx: 0, kind: "approve", status: "confirmed", txHash: "0xt0" }, db));
    (await createRun({ path: "browser", address: "0xabc" }, db));
    (await createRun({ path: "agent", address: "0xdef" }, db));

    const rows = (await listRunsWithSteps({ address: "0xabc", path: "agent" }, 10, db));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(a.id);
    expect(rows[0].steps[0]).toMatchObject({ kind: "approve", txHash: "0xt0" });
    expect((await listRunsWithSteps({}, 10, db))).toHaveLength(3);
  });
});
