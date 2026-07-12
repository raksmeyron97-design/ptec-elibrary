#!/usr/bin/env node
// Database backup: dumps every base table via PostgREST (service key) into
// per-table gzipped JSONL + a sha256 manifest. Independent of Supabase's own
// managed backups — this is the copy WE can verify and restore-drill
// (docs/BACKUP-DR.md; risk R2/R5 in docs/OPERATIONS-AUDIT.md).
//
// Usage:
//   node scripts/backup/backup-db.mjs [--out DIR] [--full]
//
//   --out DIR   destination root (default ~/ptec-backups). A timestamped
//               subdirectory is created per run: DIR/db/<UTC-timestamp>/
//   --full      include derived/re-buildable heavy tables (book_pages,
//               book_chunks). Default skips them: they are rebuilt from the
//               PDFs (scripts/extract-pdf-text.ts, scripts/embed-library.ts)
//               and would dominate the archive size.
//
// Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (.env/.env.local)
//      BACKUP_PASSPHRASE (optional) — AES-256-GCM encrypts every artifact.
//
// Writes a heartbeat row into ops_events (0088) so /api/health's deep probe
// and the failed-backup alert can see when the last good backup happened.
// Exit code is non-zero on any failure — cron wrappers must alert on that.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  discoverTables, dumpTable, encrypt, gzip, loadEnv, recordOpsEvent,
  requireEnv, sha256, timestampSlug, toJsonl,
} from "./lib.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Never dumped: PostgREST views (frozen column lists, derivable) and
// ephemeral operational state.
const VIEWS = new Set(["books_with_stats", "publications_with_stats", "team_members_with_email"]);
const EPHEMERAL = new Set(["rate_limit", "contact_rate_limit"]);
// Derived from stored PDFs; excluded unless --full (documented RPO carve-out).
const DERIVED = new Set(["book_pages", "book_chunks"]);

async function main() {
  const args = process.argv.slice(2);
  const outRoot = args.includes("--out")
    ? args[args.indexOf("--out") + 1]
    : path.join(process.env.HOME ?? ".", "ptec-backups");
  const full = args.includes("--full");

  const env = loadEnv(REPO_ROOT);
  requireEnv(env, ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  const passphrase = env.BACKUP_PASSPHRASE || null;

  const startedAt = new Date();
  const dir = path.join(outRoot, "db", timestampSlug(startedAt));
  mkdirSync(dir, { recursive: true });

  console.log(`PTEC DB backup → ${dir}${passphrase ? " (encrypted)" : " (NOT encrypted — set BACKUP_PASSPHRASE)"}`);

  const catalog = await discoverTables(env);
  const skipped = [];
  const manifestTables = {};
  let totalRows = 0;
  let failed = false;

  for (const [table, meta] of Object.entries(catalog).sort(([a], [b]) => a.localeCompare(b))) {
    if (VIEWS.has(table) || EPHEMERAL.has(table)) { skipped.push(table); continue; }
    if (!full && DERIVED.has(table)) { skipped.push(`${table} (derived — use --full)`); continue; }
    if (meta.pk.length === 0) { skipped.push(`${table} (no pk — likely a view)`); continue; }

    try {
      const t0 = Date.now();
      const rows = await dumpTable(env, table, meta.pk);
      const jsonl = Buffer.from(toJsonl(rows), "utf8");
      let artifact = gzip(jsonl);
      let filename = `${table}.jsonl.gz`;
      if (passphrase) {
        artifact = encrypt(artifact, passphrase);
        filename += ".enc";
      }
      writeFileSync(path.join(dir, filename), artifact);
      manifestTables[table] = {
        file: filename,
        rows: rows.length,
        pk: meta.pk,
        columns: meta.columns, // lets the restore drill recreate 0-row tables

        sha256: sha256(jsonl),        // integrity of the logical content
        artifactSha256: sha256(artifact), // integrity of the file on disk
        bytes: artifact.length,
        ms: Date.now() - t0,
      };
      totalRows += rows.length;
      console.log(`  ✓ ${table.padEnd(28)} ${String(rows.length).padStart(6)} rows  ${(artifact.length / 1024).toFixed(1)} KB`);
    } catch (e) {
      failed = true;
      console.error(`  ✗ ${table}: ${e.message}`);
      manifestTables[table] = { error: e.message };
    }
  }

  const finishedAt = new Date();
  const manifest = {
    kind: "ptec-db-backup",
    version: 1,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt - startedAt,
    source: new URL(env.NEXT_PUBLIC_SUPABASE_URL).host,
    encrypted: Boolean(passphrase),
    full,
    totalRows,
    tables: manifestTables,
    skipped,
    notes: [
      "auth.users is not reachable via PostgREST; Supabase manages auth backups.",
      "profiles carries roles/emails and IS included — sufficient to re-map accounts after an auth restore.",
      full ? "Includes derived tables." : "Derived tables (book_pages, book_chunks) excluded — rebuild via scripts/extract-pdf-text.ts + scripts/embed-library.ts.",
    ],
  };
  writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));

  const tableCount = Object.keys(manifestTables).length;
  console.log(`\n${failed ? "COMPLETED WITH ERRORS" : "OK"}: ${tableCount} tables, ${totalRows} rows, ${((finishedAt - startedAt) / 1000).toFixed(1)}s`);

  await recordOpsEvent(env, "backup_db", failed ? "fail" : "ok", {
    dir: path.basename(dir),
    tables: tableCount,
    rows: totalRows,
    durationMs: manifest.durationMs,
    encrypted: manifest.encrypted,
    full,
  });

  if (failed) process.exit(1);
}

main().catch(async (e) => {
  console.error("Backup failed:", e.message);
  try {
    const env = loadEnv(REPO_ROOT);
    await recordOpsEvent(env, "backup_db", "fail", { error: String(e.message).slice(0, 300) });
  } catch { /* heartbeat is best-effort */ }
  process.exit(1);
});
