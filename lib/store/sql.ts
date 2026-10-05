import type Database from "better-sqlite3";
import { neon } from "@neondatabase/serverless";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * The run store's only view of a database. Queries use `?` placeholders and portable SQL, so the
 * same statements run on SQLite (local dev and tests) and on Postgres (production, via DATABASE_URL).
 */
export interface Sql {
  readonly dialect: "sqlite" | "postgres";
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  run(sql: string, params?: unknown[]): Promise<void>;
  /** Several statements separated by semicolons, without parameters. */
  exec(sql: string): Promise<void>;
  /** SQLite only: closes the file, for tests. */
  close?(): void;
}

/** Loads the native SQLite driver only when SQLite is used, so production never touches it. */
export async function sqliteSql(path: string): Promise<Sql & { raw: Database.Database }> {
  const { default: SQLite } = await import("better-sqlite3");
  if (path !== ":memory:") mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new SQLite(path);
  db.pragma("journal_mode = WAL");
  return {
    dialect: "sqlite",
    raw: db,
    all: async <T,>(q: string, p: unknown[] = []) => db.prepare(q).all(...p) as T[],
    get: async <T,>(q: string, p: unknown[] = []) => db.prepare(q).get(...p) as T | undefined,
    run: async (q: string, p: unknown[] = []) => {
      db.prepare(q).run(...p);
    },
    exec: async (q: string) => {
      db.exec(q);
    },
    close: () => db.close(),
  };
}

/** `?` to `$1, $2, …`. The store's SQL never contains a literal question mark. */
const numbered = (q: string) => {
  let n = 0;
  return q.replace(/\?/g, () => `$${++n}`);
};

export function postgresSql(url: string): Sql {
  const query = neon(url);
  const call = <T,>(q: string, p: unknown[] = []) => query.query(numbered(q), p) as Promise<T[]>;
  return {
    dialect: "postgres",
    all: call,
    get: async <T,>(q: string, p: unknown[] = []) => (await call<T>(q, p))[0],
    run: async (q: string, p: unknown[] = []) => {
      await call(q, p);
    },
    exec: async (q: string) => {
      for (const statement of q.split(";").map((s) => s.trim()).filter(Boolean)) await call(statement);
    },
  };
}
