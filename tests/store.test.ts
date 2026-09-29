import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
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

  it("rejects invalid status values", () => {
    expect(() =>
      db.prepare("INSERT INTO runs (id, path, status) VALUES ('x','browser','bogus')").run(),
    ).toThrow();
  });
});
