import { fromJson } from "@/lib/json";
import { randomUUID } from "node:crypto";
import { postgresSql, sqliteSql, type Sql } from "./sql";

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
  created_at BIGINT, updated_at BIGINT
);
CREATE TABLE IF NOT EXISTS run_steps (
  run_id TEXT, idx INTEGER, kind TEXT,
  status TEXT CHECK(status IN ('pending','simulated','sent','confirmed','skipped','failed')),
  sim_json TEXT, tx_hash TEXT, order_id TEXT, error TEXT, updated_at BIGINT,
  PRIMARY KEY(run_id, idx)
);
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  json TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS built_txs (
  plan_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  to_address TEXT NOT NULL,
  selector TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY(plan_id, idx)
);
`;

/** Opens a SQLite store (a file path, or ":memory:" in tests) with the schema in place. */
export async function openDb(path: string): Promise<Sql> {
  const db = await sqliteSql(path);
  migrateRunsPathCheck(db.raw);
  await db.exec(SCHEMA);
  return db;
}

/** SQLite cannot alter a CHECK constraint, so databases created before the 'skill' path get their runs table rebuilt. */
function migrateRunsPathCheck(db: Awaited<ReturnType<typeof sqliteSql>>["raw"]): void {
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

let shared: Promise<Sql> | undefined;

/** Postgres when DATABASE_URL is set (production), otherwise the local SQLite file. */
export function getDb(): Promise<Sql> {
  shared ??= (async () => {
    const url = process.env.DATABASE_URL?.trim();
    if (!url) return openDb(process.env.DATABASE_PATH?.trim() || "./data/lendhold.db");
    const db = postgresSql(url);
    await db.exec(SCHEMA);
    return db;
  })();
  shared.catch(() => {
    shared = undefined;
  });
  return shared;
}

let lastTick = 0;
/** Milliseconds that never repeat in this process, so rows created together still sort in creation order. */
const tick = () => (lastTick = Math.max(Date.now(), lastTick + 1));

const resolveDb = (db?: Sql) => (db ? Promise.resolve(db) : getDb());

interface RunRow {
  id: string;
  path: RunPath;
  address: string | null;
  action: string | null;
  token: string | null;
  market_id: string | null;
  plan_json: string | null;
  status: RunStatus;
  created_at: number | string;
  updated_at: number | string;
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
  updated_at: number | string;
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
  createdAt: Number(r.created_at),
  updatedAt: Number(r.updated_at),
});

const toStep = (r: StepRow): RunStep => ({
  runId: r.run_id,
  idx: Number(r.idx),
  kind: r.kind,
  status: r.status,
  simJson: r.sim_json,
  txHash: r.tx_hash,
  orderId: r.order_id,
  error: r.error,
  updatedAt: Number(r.updated_at),
});

export async function createRun(input: CreateRunInput, sql?: Sql): Promise<RunWithSteps> {
  const db = await resolveDb(sql);
  const now = tick();
  const id = input.id ?? randomUUID();
  await db.run(
    `INSERT INTO runs (id, path, address, action, token, market_id, plan_json, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
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
    ],
  );
  return (await getRun(id, db)) as RunWithSteps;
}

export async function getRun(id: string, sql?: Sql): Promise<RunWithSteps | undefined> {
  const db = await resolveDb(sql);
  const row = await db.get<RunRow>("SELECT * FROM runs WHERE id = ?", [id]);
  if (!row) return undefined;
  const steps = await db.all<StepRow>("SELECT * FROM run_steps WHERE run_id = ? ORDER BY idx ASC", [id]);
  return { ...toRun(row), steps: steps.map(toStep) };
}

export async function listRuns(limit = 50, sql?: Sql): Promise<Run[]> {
  const db = await resolveDb(sql);
  const rows = await db.all<RunRow>("SELECT * FROM runs ORDER BY created_at DESC, id DESC LIMIT ?", [limit]);
  return rows.map(toRun);
}

export async function updateRunStatus(id: string, status: RunStatus, sql?: Sql): Promise<Run | undefined> {
  const db = await resolveDb(sql);
  await db.run("UPDATE runs SET status = ?, updated_at = ? WHERE id = ?", [status, tick(), id]);
  const row = await db.get<RunRow>("SELECT * FROM runs WHERE id = ?", [id]);
  return row ? toRun(row) : undefined;
}

export async function upsertStep(input: UpsertStepInput, sql?: Sql): Promise<RunStep> {
  const db = await resolveDb(sql);
  await db.run(
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
    [
      input.runId,
      input.idx,
      input.kind ?? null,
      input.status,
      input.simJson ?? null,
      input.txHash ?? null,
      input.orderId ?? null,
      input.error ?? null,
      tick(),
    ],
  );
  const row = await db.get<StepRow>("SELECT * FROM run_steps WHERE run_id = ? AND idx = ?", [input.runId, input.idx]);
  return toStep(row!);
}

export interface PlanRow {
  id: string;
  address: string;
  json: string;
  createdAt: number;
}

export async function savePlan(plan: { id: string; address: string; json: string }, sql?: Sql): Promise<PlanRow> {
  const db = await resolveDb(sql);
  const now = tick();
  await db.run(
    `INSERT INTO plans (id, address, json, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET address = excluded.address, json = excluded.json, created_at = excluded.created_at`,
    [plan.id, plan.address, plan.json, now],
  );
  return { ...plan, createdAt: now };
}

export async function getPlanRow(id: string, sql?: Sql): Promise<PlanRow | undefined> {
  const db = await resolveDb(sql);
  const row = await db.get<{ id: string; address: string; json: string; created_at: number | string }>(
    "SELECT * FROM plans WHERE id = ?",
    [id],
  );
  return row ? { id: row.id, address: row.address, json: row.json, createdAt: Number(row.created_at) } : undefined;
}

export interface BuiltTx {
  planId: string;
  idx: number;
  to: string;
  selector: string;
}

export async function saveBuiltTx(tx: BuiltTx, sql?: Sql): Promise<void> {
  const db = await resolveDb(sql);
  await db.run(
    `INSERT INTO built_txs (plan_id, idx, to_address, selector, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(plan_id, idx) DO UPDATE SET
       to_address = excluded.to_address, selector = excluded.selector, created_at = excluded.created_at`,
    [tx.planId, tx.idx, tx.to.toLowerCase(), tx.selector.toLowerCase(), tick()],
  );
}

export async function getBuiltTx(planId: string, idx: number, sql?: Sql): Promise<BuiltTx | undefined> {
  const db = await resolveDb(sql);
  const row = await db.get<{ plan_id: string; idx: number; to_address: string; selector: string }>(
    "SELECT * FROM built_txs WHERE plan_id = ? AND idx = ?",
    [planId, idx],
  );
  return row ? { planId: row.plan_id, idx: Number(row.idx), to: row.to_address, selector: row.selector } : undefined;
}

export async function listRunsByAddress(address: string, limit = 50, sql?: Sql): Promise<Run[]> {
  const db = await resolveDb(sql);
  const rows = await db.all<RunRow>(
    "SELECT * FROM runs WHERE lower(address) = lower(?) ORDER BY created_at DESC, id DESC LIMIT ?",
    [address, limit],
  );
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
export async function listConfirmedSteps(limit: number, sql?: Sql, paths?: readonly RunPath[]): Promise<ConfirmedStep[]> {
  const db = await resolveDb(sql);
  const pathFilter = paths && paths.length > 0 ? `AND r.path IN (${paths.map(() => "?").join(", ")})` : "";
  const rows = await db.all<{
    run_id: string;
    idx: number;
    kind: string | null;
    tx_hash: string;
    updated_at: number | string;
    path: RunPath;
    action: string | null;
    address: string | null;
    plan_json: string | null;
  }>(
    `SELECT s.run_id, s.idx, s.kind, s.tx_hash, s.updated_at, r.path, r.action, r.address, r.plan_json
     FROM run_steps s JOIN runs r ON r.id = s.run_id
     WHERE s.status = 'confirmed' AND s.tx_hash IS NOT NULL AND s.tx_hash != '' ${pathFilter}
     ORDER BY s.updated_at DESC, s.idx DESC
     LIMIT ?`,
    [...(paths ?? []), limit],
  );
  return rows.map((r) => ({
    runId: r.run_id,
    path: r.path,
    action: r.action,
    address: r.address,
    kind: r.kind,
    label: parsePlan(r.plan_json)?.steps?.[Number(r.idx)]?.label ?? null,
    txHash: r.tx_hash,
    confirmedAt: Number(r.updated_at),
  }));
}

export interface ShowcasePlan {
  action: string;
  path: RunPath;
  steps: { kind: string | null; to: string | null; selector: string | null }[];
  display: { sharesBefore: number | null; sharesAfter: number | null };
}

/** Most recent finished borrow, repay or deposit run, else any finished run. */
export async function latestShowcasePlan(sql?: Sql): Promise<ShowcasePlan | null> {
  const db = await resolveDb(sql);
  const pick = (where: string) =>
    db.get<{ path: RunPath; action: string | null; plan_json: string }>(
      `SELECT path, action, plan_json FROM runs WHERE status = 'done' AND plan_json IS NOT NULL ${where} ORDER BY updated_at DESC, id DESC LIMIT 1`,
    );
  const row = (await pick("AND action IN ('borrow', 'repay', 'deposit')")) ?? (await pick(""));
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

export interface ProofRun {
  runId: string;
  path: RunPath;
  action: string;
  token: string | null;
  confirmedCount: number;
  lastTxHash: string;
  finishedAt: number;
}

/** Finished runs with at least one confirmed transaction, newest first. */
export async function listProofRuns(limit: number, sql?: Sql): Promise<ProofRun[]> {
  const db = await resolveDb(sql);
  const rows = await db.all<{
    id: string;
    path: RunPath;
    action: string;
    token: string | null;
    updated_at: number | string;
    confirmed: number | string;
    last_tx: string;
  }>(
    `SELECT r.id, r.path, r.action, r.token, r.updated_at,
            COUNT(s.idx) AS confirmed,
            (SELECT s2.tx_hash FROM run_steps s2
               WHERE s2.run_id = r.id AND s2.status = 'confirmed' AND s2.tx_hash IS NOT NULL AND s2.tx_hash != ''
               ORDER BY s2.idx DESC LIMIT 1) AS last_tx
     FROM runs r JOIN run_steps s ON s.run_id = r.id
     WHERE r.status = 'done' AND r.action IS NOT NULL
       AND s.status = 'confirmed' AND s.tx_hash IS NOT NULL AND s.tx_hash != ''
     GROUP BY r.id
     ORDER BY r.updated_at DESC, r.id DESC
     LIMIT ?`,
    [limit],
  );
  return rows.map((r) => ({
    runId: r.id,
    path: r.path,
    action: r.action,
    token: r.token,
    confirmedCount: Number(r.confirmed),
    lastTxHash: r.last_tx,
    finishedAt: Number(r.updated_at),
  }));
}

export interface RunFilter {
  address?: string;
  path?: RunPath;
}

/** Runs newest first with their steps (and tx hashes), optionally by wallet and path. */
export async function listRunsWithSteps(filter: RunFilter, limit = 20, sql?: Sql): Promise<RunWithSteps[]> {
  const db = await resolveDb(sql);
  const where: string[] = [];
  const args: unknown[] = [];
  if (filter.address) {
    where.push("lower(address) = lower(?)");
    args.push(filter.address);
  }
  if (filter.path) {
    where.push("path = ?");
    args.push(filter.path);
  }
  const rows = await db.all<RunRow>(
    `SELECT * FROM runs ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC, id DESC LIMIT ?`,
    [...args, limit],
  );
  return Promise.all(
    rows.map(async (r) => ({
      ...toRun(r),
      steps: (await db.all<StepRow>("SELECT * FROM run_steps WHERE run_id = ? ORDER BY idx ASC", [r.id])).map(toStep),
    })),
  );
}
