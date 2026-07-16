#!/usr/bin/env node
// One-time bootstrap of the Supabase CLI migration-history table.
//
// Context: every migration up to 0098 was applied by hand in the dashboard
// SQL editor, so the hosted DB has the full schema but NO record of it in
// supabase_migrations.schema_migrations — and `supabase db push` would try
// to re-apply everything from the baseline. This script creates the history
// table and marks exactly the versions listed in
// supabase/applied-baseline-2026-07-16.txt as applied. That list was
// verified against the live DB via object probes on 2026-07-16.
//
// Safety: it never runs migration SQL, only bookkeeping. It exits without
// changes if the history table already has rows. New migrations added after
// the manifest are NOT marked — `supabase db push` applies them for real.
//
// Usage: SUPABASE_DB_URL=postgres://... node scripts/migrations/bootstrap-history.mjs
// Requires: npm i --no-save pg
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifestPath = path.join(root, "supabase/applied-baseline-2026-07-16.txt");
const versions = readFileSync(manifestPath, "utf8").split("\n").map((v) => v.trim()).filter(Boolean);

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("SUPABASE_DB_URL is not set (use the SESSION pooler URL, port 5432 — GitHub runners have no IPv6 for the direct host)");
  process.exit(1);
}

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  const existing = await client.query(
    `select to_regclass('supabase_migrations.schema_migrations') as t`,
  );
  if (existing.rows[0].t) {
    const { rows } = await client.query(`select count(*)::int as n from supabase_migrations.schema_migrations`);
    if (rows[0].n > 0) {
      console.log(`History table already has ${rows[0].n} rows — nothing to bootstrap.`);
      process.exit(0);
    }
  }

  await client.query("begin");
  await client.query(`create schema if not exists supabase_migrations`);
  await client.query(
    `create table if not exists supabase_migrations.schema_migrations (
       version text primary key,
       statements text[],
       name text
     )`,
  );
  for (const v of versions) {
    await client.query(
      `insert into supabase_migrations.schema_migrations (version, name)
       values ($1, $2) on conflict (version) do nothing`,
      [v, v === "00000000000000" ? "initial_schema (squashed baseline)" : "bootstrapped 2026-07-16"],
    );
  }
  await client.query("commit");
  console.log(`Bootstrapped migration history: ${versions.length} versions marked applied.`);
} catch (err) {
  await client.query("rollback").catch(() => {});
  throw err;
} finally {
  await client.end();
}
