#!/usr/bin/env node
// Hash for the admin password (ADMIN_PASSWORD_HASH), plus a fresh SESSION_SECRET.
//   npm run admin:hash -- 'your password'
// Without an argument, the password is read from standard input (it does not end up in the
// shell history): npm run admin:hash
import { randomBytes, scryptSync } from "node:crypto";
import { createInterface } from "node:readline";

const N = 32768, r = 8, p = 1;

async function readPassword() {
  if (process.argv[2]) return process.argv[2];
  const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  return new Promise((resolve) => rl.question("Password: ", (a) => (rl.close(), resolve(a))));
}

const password = await readPassword();
if (!password || password.length < 10) {
  console.error("Use a password of at least 10 characters.");
  process.exit(1);
}
const salt = randomBytes(16);
const key = scryptSync(password, salt, 32, { N, r, p, maxmem: 256 * 1024 * 1024 });
console.log(`ADMIN_PASSWORD_HASH=scrypt:${N}:${r}:${p}:${salt.toString("base64")}:${key.toString("base64")}`);
console.log(`SESSION_SECRET=${randomBytes(32).toString("base64url")}`);
