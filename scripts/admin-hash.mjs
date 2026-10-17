#!/usr/bin/env node
// Hash for the admin password (ADMIN_PASSWORD_HASH), plus a fresh SESSION_SECRET.
// Run it in the project folder:
//   npm run admin:hash                       asks for the password twice, without showing it
//   npm run admin:hash -- 'your password'    (ends up in the shell history)
import { randomBytes, scryptSync } from "node:crypto";
import { createInterface } from "node:readline";

const N = 32768, r = 8, p = 1;

/** One line from the terminal, not echoed. */
function askHidden(prompt) {
  return new Promise((resolve) => {
    const { stdin, stderr } = process;
    stderr.write(prompt);
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.resume();
    let typed = "";
    const onData = (chunk) => {
      for (const c of chunk) {
        if (c === "\r" || c === "\n") {
          stdin.off("data", onData);
          stdin.setRawMode(false);
          stdin.pause();
          stderr.write("\n");
          return resolve(typed);
        }
        if (c === "\u0003") {
          stdin.setRawMode(false);
          stderr.write("\n");
          process.exit(130); // Ctrl+C
        }
        if (c === "\u007f" || c === "\b") typed = typed.slice(0, -1);
        else if (c >= " ") typed += c;
      }
    };
    stdin.on("data", onData);
  });
}

async function readPassword() {
  if (process.argv[2]) return process.argv[2];
  if (!process.stdin.isTTY) {
    // piped in: the first line
    const rl = createInterface({ input: process.stdin });
    for await (const line of rl) return line;
    return "";
  }
  const first = await askHidden("Password (not shown while typing): ");
  const again = await askHidden("Repeat the password: ");
  if (first !== again) {
    console.error("The two entries differ. Nothing was created; run it again.");
    process.exit(1);
  }
  return first;
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
