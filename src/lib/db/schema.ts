// The tour events table (and the login-attempt counters for the admin), defined once per SQL
// dialect with identical columns, so the same repository code runs on SQLite, libSQL or Postgres.

import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { bigint, boolean, doublePrecision, pgTable, text as pgText, integer as pgInteger } from "drizzle-orm/pg-core";

export const EVENT_STATUSES = ["on_sale", "sold_out", "cancelled"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const sqliteEvents = sqliteTable("events", {
  id: text("id").primaryKey(),
  show: text("show").notNull(), // show slug from src/data/shows.json
  date: text("date").notNull(), // local date at the venue, YYYY-MM-DD
  time: text("time").notNull(), // local time at the venue, HH:MM
  city: text("city").notNull(),
  country: text("country").notNull(), // ISO 3166-1 alpha-2
  venue: text("venue").notNull(),
  tickets: text("tickets"), // https URL, or null while tickets are not on sale yet
  status: text("status").$type<EventStatus>().notNull().default("on_sale"),
  published: integer("published", { mode: "boolean" }).notNull().default(false),
  lat: real("lat"), // map position (optional)
  lon: real("lon"),
  createdAt: integer("created_at").notNull(), // epoch ms
  updatedAt: integer("updated_at").notNull(),
});

export const sqliteAttempts = sqliteTable("login_attempts", {
  key: text("key").primaryKey(), // "ip:<address>" or "user:<name>"
  fails: integer("fails").notNull(),
  firstAt: integer("first_at").notNull(),
  lockedUntil: integer("locked_until").notNull(),
});

export const pgEvents = pgTable("events", {
  id: pgText("id").primaryKey(),
  show: pgText("show").notNull(),
  date: pgText("date").notNull(),
  time: pgText("time").notNull(),
  city: pgText("city").notNull(),
  country: pgText("country").notNull(),
  venue: pgText("venue").notNull(),
  tickets: pgText("tickets"),
  status: pgText("status").$type<EventStatus>().notNull().default("on_sale"),
  published: boolean("published").notNull().default(false),
  lat: doublePrecision("lat"),
  lon: doublePrecision("lon"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const pgAttempts = pgTable("login_attempts", {
  key: pgText("key").primaryKey(),
  fails: pgInteger("fails").notNull(),
  firstAt: bigint("first_at", { mode: "number" }).notNull(),
  lockedUntil: bigint("locked_until", { mode: "number" }).notNull(),
});

export type EventRow = typeof sqliteEvents.$inferSelect;

/** Tables, created on first use (no migration tool to run). */
export const CREATE_SQL = {
  sqlite: [
    `CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY, show TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL,
      city TEXT NOT NULL, country TEXT NOT NULL, venue TEXT NOT NULL, tickets TEXT,
      status TEXT NOT NULL DEFAULT 'on_sale', published INTEGER NOT NULL DEFAULT 0,
      lat REAL, lon REAL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS events_date ON events (date, time)`,
    `CREATE TABLE IF NOT EXISTS login_attempts (
      key TEXT PRIMARY KEY, fails INTEGER NOT NULL, first_at INTEGER NOT NULL, locked_until INTEGER NOT NULL)`,
  ],
  postgres: [
    `CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY, show TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL,
      city TEXT NOT NULL, country TEXT NOT NULL, venue TEXT NOT NULL, tickets TEXT,
      status TEXT NOT NULL DEFAULT 'on_sale', published BOOLEAN NOT NULL DEFAULT FALSE,
      lat DOUBLE PRECISION, lon DOUBLE PRECISION, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS events_date ON events (date, time)`,
    `CREATE TABLE IF NOT EXISTS login_attempts (
      key TEXT PRIMARY KEY, fails INTEGER NOT NULL, first_at BIGINT NOT NULL, locked_until BIGINT NOT NULL)`,
  ],
};
