#!/usr/bin/env node
// Backup of the tour events database.
//   npm run db:backup                 → backups/events-YYYY-MM-DD-HHMM.db (SQLite)
// Uses VACUUM INTO: a consistent copy even while the site is running. To restore, stop the site
// and put the copy in place of the file named by DATABASE_URL.
// For hosted libSQL or Postgres, use the provider's backups (or `turso db shell <name> .dump`,
// `pg_dump`); this script says so and exits.
import { existsSync, mkdirSync } from "node:fs";
import { createClient } from "@libsql/client";

for (const f of [".env.local", ".env"]) if (existsSync(f)) process.loadEnvFile(f);

const driver = (process.env.DB_DRIVER ?? "sqlite").toLowerCase();
const url = process.env.DATABASE_URL || "file:./data/musical-on-ice.db";
if (driver !== "sqlite") {
  console.error(`DB_DRIVER=${driver}: use the provider's backup tools (see README, "Backups").`);
  process.exit(1);
}
const file = url.replace(/^file:/, "");
if (!existsSync(file)) {
  console.error(`No database file at ${file} yet.`);
  process.exit(1);
}
mkdirSync("backups", { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace("T", "-").replace(":", "");
const out = `backups/events-${stamp}.db`;
const db = createClient({ url: `file:${file}` });
await db.execute(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
const { rows } = await createClient({ url: `file:${out}` }).execute("SELECT count(*) AS n FROM events");
console.log(`→ ${out} (${rows[0].n} events)`);
