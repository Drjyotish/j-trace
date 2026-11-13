import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";
import fs from "node:fs";
import { SCHEMA_SQL } from "./schema";
import { isDemo } from "./config";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Row = Record<string, any>;

interface Runner {
  query(sql: string, params?: unknown[]): Promise<{ rows: Row[] }>;
}

interface Backend {
  kind: "pglite-memory" | "pglite-file" | "postgres";
  runner: Runner;
  tx<T>(fn: (runner: Runner) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const als = new AsyncLocalStorage<Runner>();
const g = globalThis as unknown as { __jtDb?: Promise<Backend> };

async function createBackend(): Promise<Backend> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: url,
      max: 5,
      ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: true },
    });
    return {
      kind: "postgres",
      runner: pool,
      async tx(fn) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const out = await fn(client);
          await client.query("COMMIT");
          return out;
        } catch (e) {
          await client.query("ROLLBACK").catch(() => {});
          throw e;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  // Serverless file systems are read-only/ephemeral -> keep the demo database in memory there.
  const inMemory = process.env.TRACE_DB === "memory" || !!process.env.VERCEL;
  let db: InstanceType<typeof PGlite>;
  if (inMemory) {
    db = new PGlite();
  } else {
    const dir = path.resolve(process.cwd(), ".data", "pglite");
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    db = new PGlite(dir);
  }
  await db.waitReady;
  return {
    kind: inMemory ? "pglite-memory" : "pglite-file",
    runner: { query: (sql, params) => db.query(sql, params as any[]) as Promise<{ rows: Row[] }> },
    tx: (fn) => db.transaction((tx) => fn({ query: (sql, params) => tx.query(sql, params as any[]) as any })),
    close: () => db.close(),
  };
}

async function init(): Promise<Backend> {
  const backend = await createBackend();
  // Run bootstrap with the runner bound, so query() inside does not wait on this very promise.
  await als.run(backend.runner, async () => {
    for (const stmt of splitStatements(SCHEMA_SQL)) await backend.runner.query(stmt);
    if (isDemo() && process.env.TRACE_SEED !== "off") {
      const { seedDemoData } = await import("./seed");
      await seedDemoData();
    }
  });
  return backend;
}

function splitStatements(sql: string): string[] {
  return sql
    .split(/;\s*$/m)
    .map((s) => s.trim())
    .filter((s) => s.replace(/--.*$/gm, "").trim().length > 0);
}

function backend(): Promise<Backend> {
  if (!g.__jtDb) {
    g.__jtDb = init().catch((e) => {
      g.__jtDb = undefined;
      throw e;
    });
  }
  return g.__jtDb;
}

/** Run a parameterised query. Joins the surrounding transaction if there is one. */
export async function query<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const runner = als.getStore() ?? (await backend()).runner;
  const res = await runner.query(sql, params);
  return res.rows as T[];
}

export async function queryOne<T = Row>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** Run `fn` atomically. Re-entrant: nested calls join the outer transaction. */
export async function withTx<T>(fn: () => Promise<T>): Promise<T> {
  if (als.getStore()) return fn();
  const b = await backend();
  return b.tx((runner) => als.run(runner, fn));
}

export async function dbKind(): Promise<Backend["kind"]> {
  return (await backend()).kind;
}

/** Test helper: drop the current database handle so the next query builds a fresh one. */
export async function resetDb(): Promise<void> {
  const current = g.__jtDb;
  g.__jtDb = undefined;
  if (current) await (await current).close().catch(() => {});
}
