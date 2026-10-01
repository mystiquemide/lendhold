import { fromJson } from "@/lib/json";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export type RunPath = "browser" | "agent" | "skill";
export type RunStatus = "planned" | "running" | "done" | "failed" | "stopped";
export type StepStatus =
  | "pending"
  | "simulated"
  | "sent"
  | "confirmed"
  | "skipped"
  | "failed";

export const RUN_STATUSES: readonly RunStatus[] = [
  "planned",
  "running",
  "done",
  "failed",
  "stopped",
];
export const STEP_STATUSES: readonly StepStatus[] = [
  "pending",
  "simulated",
  "sent",
  "confirmed",
  "skipped",
  "failed",
];

export interface Run {
  id: string;
  path: RunPath;
  address: string | null;
  action: string | null;
  token: string | null;
  marketId: string | null;
  planJson: string | null;
  status: RunStatus;
  createdAt: number;
  updatedAt: number;
}

export interface RunStep {
  runId: string;
  idx: number;
  kind: string | null;
  status: StepStatus;
  simJson: string | null;
  txHash: string | null;
  orderId: string | null;
  error: string | null;
  updatedAt: number;
}

export interface RunWithSteps extends Run {
  steps: RunStep[];
}

export interface CreateRunInput {
  id?: string;
  path: RunPath;
  address?: string | null;
  action?: string | null;
  token?: string | null;
  marketId?: string | null;
  planJson?: string | null;
  status?: RunStatus;
}

export interface UpsertStepInput {
  runId: string;
  idx: number;
  kind?: string | null;
  status: StepStatus;
  simJson?: string | null;
  txHash?: string | null;
  orderId?: string | null;
  error?: string | null;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  path TEXT CHECK(path IN ('browser','agent','skill')),
  address TEXT, action TEXT, token TEXT, market_id TEXT,
  plan_json TEXT, status TEXT CHECK(status IN ('planned','running','done','failed','stopped')),
  created_at INTEGER, updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS run_steps (
  run_id TEXT, idx INTEGER, kind TEXT,
  status TEXT CHECK(status IN ('pending','simulated','sent','confirmed','skipped','failed')),
  sim_json TEXT, tx_hash TEXT, order_id TEXT, error TEXT, updated_at INTEGER,
  PRIMARY KEY(run_id, idx)
);
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS built_txs (
  plan_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  to_address TEXT NOT NULL,
  selector TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(plan_id, idx)
);
`;

export function openDb(path: string): Database.Database {
  if (path !== ":memory:") {
    mkdirSync(dirname(resolve(path)), { recursive: true });
  }
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  migrateRunsPathCheck(db);
  db.exec(SCHEMA);
  return db;
}

/** SQLite cannot alter a CHECK constraint, so databases created before the 'skill' path get their runs table rebuilt. */
function migrateRunsPathCheck(db: Database.Database): void {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'runs'").get() as
    | { sql: string }
    | undefined;
  if (!row || row.sql.includes("'skill'")) return;
  db.transaction(() => {
    db.exec("ALTER TABLE runs RENAME TO runs_old");
    db.exec(`CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  path TEXT CHECK(path IN ('browser','agent','skill')),
  address TEXT, action TEXT, token TEXT, market_id TEXT,
  plan_json TEXT, status TEXT CHECK(status IN ('planned','running','done','failed','stopped')),
  created_at INTEGER, updated_at INTEGER
)`);
    db.exec("INSERT INTO runs SELECT id, path, address, action, token, market_id, plan_json, status, created_at, updated_at FROM runs_old");
    db.exec("DROP TABLE runs_old");
  })();
}

let shared: Database.Database | undefined;

export function getDb(): Database.Database {
  shared ??= openDb(process.env.DATABASE_PATH?.trim() || "./data/lendhold.db");
  return shared;
}

interface RunRow {
  id: string;
  path: RunPath;
  address: string | null;
  action: string | null;
  token: string | null;
  market_id: string | null;
  plan_json: string | null;
  status: RunStatus;
  created_at: number;
  updated_at: number;
}

interface StepRow {
  run_id: string;
  idx: number;
  kind: string | null;
  status: StepStatus;
  sim_json: string | null;
  tx_hash: string | null;
  order_id: string | null;
  error: string | null;
  updated_at: number;
}

const toRun = (r: RunRow): Run => ({
  id: r.id,
  path: r.path,
  address: r.address,
  action: r.action,
  token: r.token,
  marketId: r.market_id,
  planJson: r.plan_json,
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toStep = (r: StepRow): RunStep => ({
  runId: r.run_id,
  idx: r.idx,
  kind: r.kind,
  status: r.status,
  simJson: r.sim_json,
  txHash: r.tx_hash,
  orderId: r.order_id,
  error: r.error,
  updatedAt: r.updated_at,
});

export function createRun(
  input: CreateRunInput,
  db: Database.Database = getDb(),
): Run {
  const now = Date.now();
  const id = input.id ?? randomUUID();
  db.prepare(
    `INSERT INTO runs (id, path, address, action, token, market_id, plan_json, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.path,
    input.address ?? null,
    input.action ?? null,
    input.token ?? null,
    input.marketId ?? null,
    input.planJson ?? null,
    input.status ?? "planned",
    now,
    now,
  );
  return getRun(id, db) as RunWithSteps;
}

export function getRun(
  id: string,
  db: Database.Database = getDb(),
): RunWithSteps | undefined {
  const row = db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as
    | RunRow
    | undefined;
  if (!row) return undefined;
  const steps = db
    .prepare("SELECT * FROM run_steps WHERE run_id = ? ORDER BY idx ASC")
    .all(id) as StepRow[];
  return { ...toRun(row), steps: steps.map(toStep) };
}

export function listRuns(
  limit = 50,
  db: Database.Database = getDb(),
): Run[] {
  const rows = db
    .prepare("SELECT * FROM runs ORDER BY created_at DESC, rowid DESC LIMIT ?")
    .all(limit) as RunRow[];
  return rows.map(toRun);
}

export function updateRunStatus(
  id: string,
  status: RunStatus,
  db: Database.Database = getDb(),
): Run | undefined {
  db.prepare("UPDATE runs SET status = ?, updated_at = ? WHERE id = ?").run(
    status,
    Date.now(),
    id,
  );
  const row = db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as
    | RunRow
    | undefined;
  return row ? toRun(row) : undefined;
}

export function upsertStep(
  input: UpsertStepInput,
  db: Database.Database = getDb(),
): RunStep {
  const now = Date.now();
  db.prepare(
    `INSERT INTO run_steps (run_id, idx, kind, status, sim_json, tx_hash, order_id, error, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(run_id, idx) DO UPDATE SET
       kind = excluded.kind,
       status = excluded.status,
       sim_json = excluded.sim_json,
       tx_hash = excluded.tx_hash,
       order_id = excluded.order_id,
       error = excluded.error,
       updated_at = excluded.updated_at`,
  ).run(
    input.runId,
    input.idx,
    input.kind ?? null,
    input.status,
    input.simJson ?? null,
    input.txHash ?? null,
    input.orderId ?? null,
    input.error ?? null,
    now,
  );
  const row = db
    .prepare("SELECT * FROM run_steps WHERE run_id = ? AND idx = ?")
    .get(input.runId, input.idx) as StepRow;
  return toStep(row);
}

export interface PlanRow {
  id: string;
  address: string;
  json: string;
  createdAt: number;
}

export function savePlan(
  plan: { id: string; address: string; json: string },
  db: Database.Database = getDb(),
): PlanRow {
  const now = Date.now();
  db.prepare("INSERT OR REPLACE INTO plans (id, address, json, created_at) VALUES (?, ?, ?, ?)").run(
    plan.id,
    plan.address,
    plan.json,
    now,
  );
  return { ...plan, createdAt: now };
}

export function getPlanRow(id: string, db: Database.Database = getDb()): PlanRow | undefined {
  const row = db.prepare("SELECT * FROM plans WHERE id = ?").get(id) as
    | { id: string; address: string; json: string; created_at: number }
    | undefined;
  return row ? { id: row.id, address: row.address, json: row.json, createdAt: row.created_at } : undefined;
}

export interface BuiltTx {
  planId: string;
  idx: number;
  to: string;
  selector: string;
}

export function saveBuiltTx(tx: BuiltTx, db: Database.Database = getDb()): void {
  db.prepare(
    "INSERT OR REPLACE INTO built_txs (plan_id, idx, to_address, selector, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(tx.planId, tx.idx, tx.to.toLowerCase(), tx.selector.toLowerCase(), Date.now());
}

export function getBuiltTx(
  planId: string,
  idx: number,
  db: Database.Database = getDb(),
): BuiltTx | undefined {
  const row = db.prepare("SELECT * FROM built_txs WHERE plan_id = ? AND idx = ?").get(planId, idx) as
    | { plan_id: string; idx: number; to_address: string; selector: string }
    | undefined;
  return row
    ? { planId: row.plan_id, idx: row.idx, to: row.to_address, selector: row.selector }
    : undefined;
}

export function listRunsByAddress(
  address: string,
  limit = 50,
  db: Database.Database = getDb(),
): Run[] {
  const rows = db
    .prepare("SELECT * FROM runs WHERE lower(address) = lower(?) ORDER BY created_at DESC, rowid DESC LIMIT ?")
    .all(address, limit) as RunRow[];
  return rows.map(toRun);
}

export interface ConfirmedStep {
  runId: string;
  path: RunPath;
  action: string | null;
  address: string | null;
  kind: string | null;
  label: string | null;
  txHash: string;
  confirmedAt: number;
}

interface PlanStepJson {
  label?: string;
  kind?: string;
  to?: string;
  selector?: string;
}

interface PlanJson {
  steps?: PlanStepJson[];
  display?: { sharesBefore?: number | null; sharesAfter?: number | null };
}

function parsePlan(json: string | null): PlanJson | null {
  if (!json) return null;
  try {
    return fromJson<PlanJson>(json);
  } catch {
    return null;
  }
}

/** Confirmed steps that have a transaction hash, newest first, optionally limited to some run paths. */
export function listConfirmedSteps(
  limit: number,
  db: Database.Database = getDb(),
  paths?: readonly RunPath[],
): ConfirmedStep[] {
  const pathFilter = paths && paths.length > 0 ? `AND r.path IN (${paths.map(() => "?").join(", ")})` : "";
  const rows = db
    .prepare(
      `SELECT s.run_id, s.idx, s.kind, s.tx_hash, s.updated_at, r.path, r.action, r.address, r.plan_json
       FROM run_steps s JOIN runs r ON r.id = s.run_id
       WHERE s.status = 'confirmed' AND s.tx_hash IS NOT NULL AND s.tx_hash != '' ${pathFilter}
       ORDER BY s.updated_at DESC, s.rowid DESC
       LIMIT ?`,
    )
    .all(...(paths ?? []), limit) as {
    run_id: string;
    idx: number;
    kind: string | null;
    tx_hash: string;
    updated_at: number;
    path: RunPath;
    action: string | null;
    address: string | null;
    plan_json: string | null;
  }[];
  return rows.map((r) => ({
    runId: r.run_id,
    path: r.path,
    action: r.action,
    address: r.address,
    kind: r.kind,
    label: parsePlan(r.plan_json)?.steps?.[r.idx]?.label ?? null,
    txHash: r.tx_hash,
    confirmedAt: r.updated_at,
  }));
}

export interface ShowcasePlan {
  action: string;
  path: RunPath;
  steps: { kind: string | null; to: string | null; selector: string | null }[];
  display: { sharesBefore: number | null; sharesAfter: number | null };
}

/** Most recent finished borrow, repay or deposit run, else any finished run. */
export function latestShowcasePlan(db: Database.Database = getDb()): ShowcasePlan | null {
  const pick = (where: string) =>
    db
      .prepare(`SELECT path, action, plan_json FROM runs WHERE status = 'done' AND plan_json IS NOT NULL ${where} ORDER BY updated_at DESC, rowid DESC LIMIT 1`)
      .get() as { path: RunPath; action: string | null; plan_json: string } | undefined;
  const row = pick("AND action IN ('borrow', 'repay', 'deposit')") ?? pick("");
  if (!row) return null;
  const plan = parsePlan(row.plan_json);
  if (!plan?.steps || !row.action) return null;
  return {
    action: row.action,
    path: row.path,
    steps: plan.steps.map((st) => ({ kind: st.kind ?? null, to: st.to ?? null, selector: st.selector ?? null })),
    display: { sharesBefore: plan.display?.sharesBefore ?? null, sharesAfter: plan.display?.sharesAfter ?? null },
  };
}
