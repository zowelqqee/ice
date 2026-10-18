// The site's content tables (tour events, shows, music, settings) and the admin's login-attempt
// counters, defined once per SQL dialect with identical columns, so the same repository code runs
// on SQLite, libSQL or Postgres. Lists (synopsis paragraphs, highlights, media) are stored as JSON
// text, which both dialects handle the same way.

import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { bigint, boolean, doublePrecision, pgTable, text as pgText, integer as pgInteger } from "drizzle-orm/pg-core";

export const EVENT_STATUSES = ["on_sale", "sold_out", "cancelled"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const sqliteEvents = sqliteTable("events", {
  id: text("id").primaryKey(),
  show: text("show").notNull(), // show slug
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

export const SHOW_STATUSES = ["touring", "coming", "tba"] as const;
export type ShowStatus = (typeof SHOW_STATUSES)[number];

export const sqliteShows = sqliteTable("shows", {
  slug: text("slug").primaryKey(), // URL /shows/<slug>; fixed once created
  position: integer("position").notNull(), // order on the site
  published: integer("published", { mode: "boolean" }).notNull().default(true),
  status: text("status").$type<ShowStatus>().notNull(),
  title: text("title").notNull(),
  subtitle: text("subtitle").notNull(),
  logline: text("logline").notNull(),
  synopsis: text("synopsis").notNull(), // JSON: string[] (paragraphs)
  highlights: text("highlights").notNull(), // JSON: string[]
  duration: text("duration").notNull(),
  age: text("age").notNull(),
  accent: text("accent").notNull(), // #rrggbb
  media: text("media").notNull(), // JSON: { card?, hero?, extra? } (MediaRef each)
  track: text("track"), // track id, or null
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const sqliteTracks = sqliteTable("tracks", {
  id: text("id").primaryKey(),
  position: integer("position").notNull(),
  published: integer("published", { mode: "boolean" }).notNull().default(true),
  show: text("show"), // show slug, or null
  title: text("title").notNull(),
  note: text("note").notNull(),
  src: text("src").notNull(), // path without extension: .webm (Opus) and .m4a (AAC)
  duration: real("duration").notNull(), // seconds
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const sqliteSettings = sqliteTable("settings", {
  key: text("key").primaryKey(), // "texts" | "site"
  value: text("value").notNull(), // JSON
  updatedAt: integer("updated_at").notNull(),
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

export const pgShows = pgTable("shows", {
  slug: pgText("slug").primaryKey(),
  position: pgInteger("position").notNull(),
  published: boolean("published").notNull().default(true),
  status: pgText("status").$type<ShowStatus>().notNull(),
  title: pgText("title").notNull(),
  subtitle: pgText("subtitle").notNull(),
  logline: pgText("logline").notNull(),
  synopsis: pgText("synopsis").notNull(),
  highlights: pgText("highlights").notNull(),
  duration: pgText("duration").notNull(),
  age: pgText("age").notNull(),
  accent: pgText("accent").notNull(),
  media: pgText("media").notNull(),
  track: pgText("track"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const pgTracks = pgTable("tracks", {
  id: pgText("id").primaryKey(),
  position: pgInteger("position").notNull(),
  published: boolean("published").notNull().default(true),
  show: pgText("show"),
  title: pgText("title").notNull(),
  note: pgText("note").notNull(),
  src: pgText("src").notNull(),
  duration: doublePrecision("duration").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const pgSettings = pgTable("settings", {
  key: pgText("key").primaryKey(),
  value: pgText("value").notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export type EventRow = typeof sqliteEvents.$inferSelect;
export type ShowRow = typeof sqliteShows.$inferSelect;
export type TrackRow = typeof sqliteTracks.$inferSelect;

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
    `CREATE TABLE IF NOT EXISTS shows (
      slug TEXT PRIMARY KEY, position INTEGER NOT NULL, published INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL,
      title TEXT NOT NULL, subtitle TEXT NOT NULL, logline TEXT NOT NULL, synopsis TEXT NOT NULL, highlights TEXT NOT NULL,
      duration TEXT NOT NULL, age TEXT NOT NULL, accent TEXT NOT NULL, media TEXT NOT NULL, track TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY, position INTEGER NOT NULL, published INTEGER NOT NULL DEFAULT 1, show TEXT,
      title TEXT NOT NULL, note TEXT NOT NULL, src TEXT NOT NULL, duration REAL NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)`,
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
    `CREATE TABLE IF NOT EXISTS shows (
      slug TEXT PRIMARY KEY, position INTEGER NOT NULL, published BOOLEAN NOT NULL DEFAULT TRUE, status TEXT NOT NULL,
      title TEXT NOT NULL, subtitle TEXT NOT NULL, logline TEXT NOT NULL, synopsis TEXT NOT NULL, highlights TEXT NOT NULL,
      duration TEXT NOT NULL, age TEXT NOT NULL, accent TEXT NOT NULL, media TEXT NOT NULL, track TEXT,
      created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY, position INTEGER NOT NULL, published BOOLEAN NOT NULL DEFAULT TRUE, show TEXT,
      title TEXT NOT NULL, note TEXT NOT NULL, src TEXT NOT NULL, duration DOUBLE PRECISION NOT NULL,
      created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at BIGINT NOT NULL)`,
  ],
} as const;
