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
// Tables are created on first use and seeded from src/data/tour.json (as unpublished drafts).

export type Driver = "sqlite" | "libsql" | "postgres";

export function dbConfig() {
  const driver = (process.env.DB_DRIVER ?? "sqlite").trim().toLowerCase() as Driver;
  const url = process.env.DATABASE_URL?.trim() || (driver === "sqlite" ? "file:./data/musical-on-ice.db" : "");
  return { driver, url, token: process.env.DATABASE_AUTH_TOKEN?.trim() || undefined };
}

/** Whether this host can keep the data. A SQLite file needs a persistent disk, which serverless
 *  hosts such as Vercel do not have; there the public site keeps reading src/data/tour.json. */
export function dbStatus(): { ok: true } | { ok: false; reason: string } {
  const { driver, url } = dbConfig();
  if (!["sqlite", "libsql", "postgres"].includes(driver)) return { ok: false, reason: `Unknown DB_DRIVER "${driver}".` };
  if (driver === "sqlite" && process.env.VERCEL)
    return { ok: false, reason: "This host has no persistent disk for a SQLite file. Set DB_DRIVER to libsql or postgres." };
  if (!url) return { ok: false, reason: "DATABASE_URL is not set." };
  return { ok: true };
}

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
    const db = drizzle(postgres(url, { max: 3, prepare: false }));
    for (const q of CREATE_SQL.postgres) await db.execute(sql.raw(q));
    h = { db: db as unknown as Db, events: pgEvents as unknown as typeof sqliteEvents, attempts: pgAttempts as unknown as typeof sqliteAttempts, driver };
  } else {
    if (driver === "sqlite" && url.startsWith("file:")) mkdirSync(dirname(url.slice(5)), { recursive: true });
    const db = drizzleLibsql(createClient({ url, authToken: token }));
    for (const q of CREATE_SQL.sqlite) await db.run(sql.raw(q));
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
