import "server-only";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { count, sql } from "drizzle-orm";
import { drizzle as drizzleLibsql, type LibSQLDatabase } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import tourJson from "@/data/tour.json";
import { CREATE_SQL, pgAttempts, pgEvents, sqliteAttempts, sqliteEvents } from "./schema";

// Storage for the tour events, chosen by environment variables (no code change to switch):
//   DB_DRIVER=sqlite   (default) DATABASE_URL=file:./data/musical-on-ice.db   a file on this server's disk
//   DB_DRIVER=libsql   DATABASE_URL=libsql://…  DATABASE_AUTH_TOKEN=…           hosted libSQL (e.g. Turso)
//   DB_DRIVER=postgres DATABASE_URL=postgres://…                                 any Postgres
// Without DATABASE_URL, the variables that Vercel's database integrations add are used:
// POSTGRES_URL (Neon), then POSTGRES_URL_NON_POOLING; TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.
// Tables are created on first use and seeded from src/data/tour.json (as unpublished drafts).

export type Driver = "sqlite" | "libsql" | "postgres";

const env = (...names: string[]) => names.map((n) => process.env[n]?.trim()).find(Boolean) ?? "";

export function dbConfig() {
  const driver = (process.env.DB_DRIVER ?? "sqlite").trim().toLowerCase() as Driver;
  const url =
    driver === "postgres"
      ? env("DATABASE_URL", "POSTGRES_URL", "POSTGRES_URL_NON_POOLING")
      : driver === "libsql"
        ? env("DATABASE_URL", "TURSO_DATABASE_URL")
        : env("DATABASE_URL") || "file:./data/musical-on-ice.db";
  return { driver, url, token: env("DATABASE_AUTH_TOKEN", "TURSO_AUTH_TOKEN") || undefined };
}

/** postgres.js sends every query parameter it does not know to the server as a setting, and the
 *  server refuses unknown ones. Hosted URLs carry client-side options (Neon: channel_binding,
 *  Prisma: pgbouncer, schema); keep only what postgres.js or the server understands. */
const PG_PARAMS = new Set(["sslmode", "sslrootcert", "connect_timeout", "options", "application_name"]);
export function pgUrl(raw: string) {
  const u = new URL(raw);
  for (const key of [...u.searchParams.keys()]) if (!PG_PARAMS.has(key)) u.searchParams.delete(key);
  return u.toString();
}

/** Whether this host can keep the data. A SQLite file needs a persistent disk, which serverless
 *  hosts such as Vercel do not have; there the public site keeps reading src/data/tour.json. */
export function dbStatus(): { ok: true } | { ok: false; reason: string } {
  const { driver, url } = dbConfig();
  if (!["sqlite", "libsql", "postgres"].includes(driver)) return { ok: false, reason: `Unknown DB_DRIVER "${driver}".` };
  if (driver === "sqlite" && process.env.VERCEL)
    return { ok: false, reason: "This host has no persistent disk for a SQLite file. Set DB_DRIVER to libsql or postgres." };
  if (!url) return { ok: false, reason: "DATABASE_URL is not set (nor POSTGRES_URL / TURSO_DATABASE_URL from a Vercel integration)." };
  return { ok: true };
}

// SQL injection: every query in the app is built with Drizzle (select / insert / update / delete
// with eq, inArray, …), which sends values as bound parameters, separately from the SQL text.
// The only raw SQL is the fixed table definitions below; the type of ddl() accepts nothing else,
// and the lint rules in eslint.config.mjs reject sql.raw or string-built queries anywhere else.
type Ddl = (typeof CREATE_SQL)[keyof typeof CREATE_SQL][number];
const ddl = (statement: Ddl) => sql.raw(statement);

// The repository is written against the SQLite flavour of Drizzle; the Postgres database and
// tables have the same runtime API (select / insert / update / delete), so they are cast to it.
type Db = LibSQLDatabase;
export interface DbHandle {
  db: Db;
  events: typeof sqliteEvents;
  attempts: typeof sqliteAttempts;
  driver: Driver;
}

let handle: Promise<DbHandle> | null = null;

export function getDb(): Promise<DbHandle> {
  if (!handle)
    handle = open().catch((e) => {
      handle = null;
      throw e;
    });
  return handle;
}

async function open(): Promise<DbHandle> {
  const status = dbStatus();
  if (!status.ok) throw new Error(status.reason);
  const { driver, url, token } = dbConfig();
  let h: DbHandle;
  if (driver === "postgres") {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const db = drizzle(postgres(pgUrl(url), { max: 3, prepare: false })); // prepare off: works through poolers (PgBouncer)
    for (const q of CREATE_SQL.postgres) await db.execute(ddl(q));
    h = { db: db as unknown as Db, events: pgEvents as unknown as typeof sqliteEvents, attempts: pgAttempts as unknown as typeof sqliteAttempts, driver };
  } else {
    if (driver === "sqlite" && url.startsWith("file:")) mkdirSync(dirname(url.slice(5)), { recursive: true });
    const db = drizzleLibsql(createClient({ url, authToken: token }));
    for (const q of CREATE_SQL.sqlite) await db.run(ddl(q));
    h = { db, events: sqliteEvents, attempts: sqliteAttempts, driver };
  }
  await seed(h);
  return h;
}

/** First run only: the dates from src/data/tour.json, as unpublished drafts to review and publish. */
async function seed({ db, events }: DbHandle) {
  const [{ n }] = await db.select({ n: count() }).from(events);
  if (Number(n) > 0) return;
  const now = Date.now();
  const rows = tourJson.dates.map((d) => ({
    id: d.id,
    show: d.show,
    date: d.date,
    time: d.time,
    city: d.city,
    country: d.country,
    venue: d.venue,
    tickets: d.tickets,
    status: "on_sale" as const,
    published: false,
    lat: d.lat,
    lon: d.lon,
    createdAt: now,
    updatedAt: now,
  }));
  if (rows.length) await db.insert(events).values(rows);
}
