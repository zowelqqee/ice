import "server-only";
import { createHash, createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";

// Admin sign-in with no outside service:
//   ADMIN_USER           the login
//   ADMIN_PASSWORD_HASH  scrypt hash of the password (npm run admin:hash -- 'the password')
//   SESSION_SECRET       random string, 32+ characters, signs the session cookie
// The session is a signed, httpOnly, same-site cookie scoped to /admin (8 hours). Failed sign-ins
// are counted per address and per login in the database: 5 within 15 minutes lock both for 15.

export const COOKIE = "moi_admin";
const MAX_AGE = 8 * 3600;
const WINDOW = 15 * 60 * 1000;
const MAX_FAILS = 5;
const LOCK = 15 * 60 * 1000;

export function authConfig():
  | { ok: true; user: string; hash: string; secret: string }
  | { ok: false; missing: string[] } {
  const user = process.env.ADMIN_USER?.trim() ?? "";
  const hash = process.env.ADMIN_PASSWORD_HASH?.trim() ?? "";
  const secret = process.env.SESSION_SECRET?.trim() ?? "";
  const missing = [
    !user && "ADMIN_USER",
    !hash.startsWith("scrypt:") && "ADMIN_PASSWORD_HASH",
    secret.length < 32 && "SESSION_SECRET (32+ characters)",
  ].filter(Boolean) as string[];
  return missing.length ? { ok: false, missing } : { ok: true, user, hash, secret };
}

/** Stored format: scrypt:N:r:p:<salt base64>:<key base64> (scripts/admin-hash.mjs writes it; no "$",
 *  which .env files would try to expand). */
export function verifyPassword(password: string, stored: string) {
  const [kind, N, r, p, salt, key] = stored.split(":");
  if (kind !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "base64");
  const got = scryptSync(password, Buffer.from(salt, "base64"), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: 256 * 1024 * 1024,
  });
  return got.length === expected.length && timingSafeEqual(got, expected);
}

function sameText(a: string, b: string) {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function checkLogin(user: string, password: string) {
  const cfg = authConfig();
  if (!cfg.ok) return false;
  const passOk = verifyPassword(password, cfg.hash); // always computed: same time for any login
  return sameText(user, cfg.user) && passOk;
}

// ---------------------------------------------------------------- session cookie
function sign(body: string, secret: string) {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export async function createSession(user: string) {
  const cfg = authConfig();
  if (!cfg.ok) throw new Error("Admin sign-in is not configured.");
  const body = Buffer.from(JSON.stringify({ u: user, exp: Date.now() + MAX_AGE * 1000 })).toString("base64url");
  (await cookies()).set(COOKIE, `${body}.${sign(body, cfg.secret)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  (await cookies()).set(COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/admin", maxAge: 0 });
}

export async function currentAdmin(): Promise<string | null> {
  const cfg = authConfig();
  if (!cfg.ok) return null;
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [body, mac] = raw.split(".");
  if (!body || !mac) return null;
  const want = Buffer.from(sign(body, cfg.secret));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const { u, exp } = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { u: string; exp: number };
    return exp > Date.now() && sameText(u, cfg.user) ? u : null;
  } catch {
    return null;
  }
}

/** For admin pages and actions: the signed-in user, or a redirect to the sign-in page. */
export async function requireAdmin() {
  const user = await currentAdmin();
  if (!user) redirect("/admin/login");
  return user;
}

/** For the admin's API routes (server actions check this themselves): the request must come
 *  from a page of this site. Together with the same-site cookie this stops cross-site posts. */
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- brute-force protection
export async function clientAddress() {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
}

const keys = (ip: string, user: string) => [`ip:${ip}`, `user:${user.toLowerCase().slice(0, 80)}`];

/** Milliseconds until another attempt is allowed (0 = allowed now). */
export async function lockedFor(ip: string, user: string) {
  const { db, attempts } = await getDb();
  const rows = await db.select().from(attempts).where(inArray(attempts.key, keys(ip, user)));
  const now = Date.now();
  return Math.max(0, ...rows.map((r) => r.lockedUntil - now));
}

export async function recordFailure(ip: string, user: string) {
  const { db, attempts } = await getDb();
  const now = Date.now();
  for (const key of keys(ip, user)) {
    const [row] = await db.select().from(attempts).where(eq(attempts.key, key));
    if (!row) {
      await db.insert(attempts).values({ key, fails: 1, firstAt: now, lockedUntil: 0 });
      continue;
    }
    const fresh = now - row.firstAt > WINDOW;
    const fails = fresh ? 1 : row.fails + 1;
    await db
      .update(attempts)
      .set({ fails, firstAt: fresh ? now : row.firstAt, lockedUntil: fails >= MAX_FAILS ? now + LOCK : row.lockedUntil })
      .where(eq(attempts.key, key));
  }
}

export async function clearFailures(ip: string, user: string) {
  const { db, attempts } = await getDb();
  await db.delete(attempts).where(inArray(attempts.key, keys(ip, user)));
}
