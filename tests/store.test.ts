import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import {
  createRun,
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
