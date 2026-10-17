import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// SQL injection guard. Queries are built with Drizzle, which sends values as bound parameters;
// these rules reject the ways around it: sql.raw, SQL text assembled from strings, postgres.js
// unsafe(), and database clients used directly instead of through src/lib/db. `next build` runs
// lint, so a violation also stops a deploy.
const QUERY_METHOD = "/^(execute|run|all|unsafe)$/";
const RAW_SQL = [
  {
    selector: "CallExpression[callee.object.name='sql'][callee.property.name='raw']",
    message: "No sql.raw: build the query with Drizzle (values become bound parameters). Fixed table definitions live in src/lib/db.",
  },
  {
    selector: `CallExpression[callee.property.name=${QUERY_METHOD}] > TemplateLiteral[expressions.length>0]`,
    message: "No SQL assembled from a template string: use Drizzle, or { sql: '… ? …', args: [value] }.",
  },
  {
    selector: `CallExpression[callee.property.name=${QUERY_METHOD}] > BinaryExpression[operator='+']`,
    message: "No SQL assembled by string concatenation: use Drizzle, or { sql: '… ? …', args: [value] }.",
  },
  {
    selector: "CallExpression[callee.property.name='unsafe']",
    message: "No unsafe(): it runs SQL text as given. Use Drizzle or a tagged template with bound values.",
  },
];
const DB_CLIENTS = {
  paths: ["@libsql/client", "postgres", "drizzle-orm/libsql", "drizzle-orm/postgres-js"].map((name) => ({
    name,
    message: "Use getDb() from @/lib/db: database access goes through Drizzle there.",
  })),
};

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["src/**/*.{ts,tsx,js,mjs}", "scripts/**/*.{js,mjs}"],
    rules: { "no-restricted-syntax": ["error", ...RAW_SQL] },
  },
  {
    files: ["src/**/*.{ts,tsx,js,mjs}"],
    ignores: ["src/lib/db/**"],
    rules: { "no-restricted-imports": ["error", DB_CLIENTS] },
  },
  {
    // the one place raw SQL is allowed: the fixed DDL, through the typed ddl() helper
    files: ["src/lib/db/index.ts"],
    rules: { "no-restricted-syntax": ["error", ...RAW_SQL.slice(1)] },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".next-build/**", // production build beside the dev server (NEXT_DIST_DIR)
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
