#!/usr/bin/env node
// Diff hosted columns (via PostgREST's OpenAPI spec, service key) against
// what the migration chain produces statically: baseline CREATE TABLE +
// later ADD/DROP/RENAME COLUMN. Reports per-table drift in both directions.
//
// This is how the 2026-07-16 dashboard drift was found (download_logs
// book_file_id, posts featured/pinned/publish_at, catalog_copies barcode…,
// profiles.created_at, authors.photo_url). Run it after any period of
// dashboard-made schema changes, and before squashing migrations.
//
// Caveats: static SQL parsing — custom enum types, quoted identifiers, and
// generated columns can produce false positives. Verify each finding.
//
// Usage: node scripts/migrations/check-schema-drift.mjs   (reads .env)
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MIG = path.join(ROOT, "supabase/migrations");

const env = Object.fromEntries(
  readFileSync(path.join(ROOT, ".env"), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "").trim()];
    }),
);
const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
  headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
});
if (!res.ok) throw new Error(`OpenAPI fetch failed: ${res.status}`);
const spec = await res.json();
const hosted = {};
for (const [name, def] of Object.entries(spec.definitions || {})) {
  hosted[name] = Object.keys(def.properties || {}).sort();
}

const files = readdirSync(MIG).filter((f) => f.endsWith(".sql")).sort();
const tables = {}; // name -> Set(columns)

const stripComments = (s) => s.replace(/--[^\n]*/g, "");

for (const f of files) {
  const sql = stripComments(readFileSync(path.join(MIG, f), "utf8"));
  // CREATE TABLE
  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_]+)\s*\(([\s\S]*?)\n\)/gi)) {
    const [, name, body] = m;
    const cols = new Set();
    // column lines: start-of-line identifier not a constraint keyword
    for (const line of body.split(",\n").join("\n,").split("\n")) {
      const cm = line.match(/^\s*,?\s*([a-z_]+)\s+(uuid|text|int|bigint|serial|numeric|boolean|bool|timestamptz|timestamp|date|jsonb|json|vector|tsvector|double|real|smallint|char|varchar|citext|inet|bytea)/i);
      if (cm && !/^(primary|foreign|unique|check|constraint|references)$/i.test(cm[1])) cols.add(cm[1]);
    }
    tables[name] = cols;
  }
  // ADD COLUMN
  for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?([a-z_]+)([\s\S]*?);/gi)) {
    const [, name, rest] = m;
    if (!tables[name]) continue;
    for (const c of rest.matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_]+)/gi)) tables[name].add(c[1]);
    for (const c of rest.matchAll(/drop\s+column\s+(?:if\s+exists\s+)?([a-z_]+)/gi)) tables[name].delete(c[1]);
    for (const c of rest.matchAll(/rename\s+column\s+([a-z_]+)\s+to\s+([a-z_]+)/gi)) { tables[name].delete(c[1]); tables[name].add(c[2]); }
  }
}

let clean = 0, drifted = 0;
for (const [name, migCols] of Object.entries(tables).sort()) {
  const host = hosted[name];
  if (!host) { console.log(`~ ${name}: in migrations, NOT on hosted (view? dropped?)`); continue; }
  const hostSet = new Set(host);
  const onlyHosted = host.filter((c) => !migCols.has(c));
  const onlyMig = [...migCols].filter((c) => !hostSet.has(c));
  if (onlyHosted.length || onlyMig.length) {
    drifted++;
    console.log(`! ${name}`);
    if (onlyHosted.length) console.log(`    hosted-only: ${onlyHosted.join(", ")}`);
    if (onlyMig.length) console.log(`    migration-only: ${onlyMig.join(", ")}`);
  } else clean++;
}
console.log(`\n${clean} tables clean, ${drifted} with column drift. (Static parse — verify each before acting.)`);
