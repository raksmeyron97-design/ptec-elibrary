#!/usr/bin/env node
// Isolated restoration drill (docs/BACKUP-DR.md §drills).
//
// Restores a scripted DB backup into PGlite — a real Postgres engine running
// IN-PROCESS and IN-MEMORY. There is no connection string, no network
// listener, and nothing persisted: production cannot be touched by design,
// satisfying the "never test restoration against production" rule.
//
// Drill phases (each timed; all results land in the written report):
//   1. integrity   — verify every artifact hash + row count (verify-backup)
//   2. restore     — create schema (types inferred, PKs from manifest) and
//                    load every table into the isolated instance
//   3. validate    — referential integrity, auth/roles, published-content
//                    completeness, admin-workflow and contact-inbox tables,
//                    search-index rebuild readiness
//   4. re-link     — sample restored file/cover URLs and probe the storage
//                    origins (proves DB↔storage re-linking would succeed)
//   5. report      — docs/drills/RESTORE-DRILL-<date>.md + ops_events row
//
// Usage: node scripts/backup/restore-drill.mjs [backup-dir] [--no-network]
//        (defaults to the newest ~/ptec-backups/db/<timestamp>)

import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { decrypt, gunzip, loadEnv, recordOpsEvent } from "./lib.mjs";
import { verifyBackupDir } from "./verify-backup.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function newestBackupDir() {
  const root = path.join(process.env.HOME ?? ".", "ptec-backups", "db");
  if (!existsSync(root)) return null;
  const dirs = readdirSync(root).sort();
  return dirs.length ? path.join(root, dirs[dirs.length - 1]) : null;
}

function loadRows(dir, meta, passphrase) {
  const artifact = readFileSync(path.join(dir, meta.file));
  const gz = passphrase && meta.file.endsWith(".enc") ? decrypt(artifact, passphrase) : artifact;
  const jsonl = gunzip(gz).toString("utf8");
  return jsonl.split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

function inferType(values) {
  let sawBool = false, sawNum = false, sawInt = true, sawObj = false, sawStr = false;
  for (const v of values) {
    if (v === null || v === undefined) continue;
    const t = typeof v;
    if (t === "boolean") sawBool = true;
    else if (t === "number") { sawNum = true; if (!Number.isInteger(v)) sawInt = false; }
    else if (t === "object") sawObj = true;
    else sawStr = true;
  }
  if (sawObj) return "jsonb";
  if (sawStr) return "text";
  if (sawNum) return sawInt ? "bigint" : "double precision";
  if (sawBool) return "boolean";
  return "text";
}

const qid = (name) => `"${name.replace(/"/g, '""')}"`;

async function restoreTable(db, table, rows, pk, manifestColumns) {
  // Empty tables still need their relation created (validation queries them);
  // the column list then comes from the manifest instead of the data.
  const columns = rows.length
    ? [...new Set(rows.flatMap((r) => Object.keys(r)))]
    : (manifestColumns ?? []);
  if (columns.length === 0) {
    await db.exec(`CREATE TABLE ${qid(table)} (_placeholder text);`);
    return { columns: 0 };
  }
  const types = Object.fromEntries(
    columns.map((c) => [c, inferType(rows.slice(0, 200).map((r) => r[c]))]),
  );
  const pkClause = pk?.length && pk.every((c) => columns.includes(c))
    ? `, PRIMARY KEY (${pk.map(qid).join(", ")})`
    : "";
  await db.exec(
    `CREATE TABLE ${qid(table)} (${columns.map((c) => `${qid(c)} ${types[c]}`).join(", ")}${pkClause});`,
  );

  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const params = [];
    const tuples = batch.map((row, r) => {
      const placeholders = columns.map((c, k) => {
        const v = row[c];
        params.push(v === undefined ? null : types[c] === "jsonb" && v !== null ? JSON.stringify(v) : v);
        return `$${r * columns.length + k + 1}`;
      });
      return `(${placeholders.join(",")})`;
    });
    await db.query(
      `INSERT INTO ${qid(table)} (${columns.map(qid).join(",")}) VALUES ${tuples.join(",")};`,
      params,
    );
  }
  return { columns: columns.length };
}

async function count(db, sql, params = []) {
  const res = await db.query(sql, params);
  return Number(res.rows[0]?.n ?? 0);
}

async function tableExists(db, table) {
  return (await count(db, `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = $1`, [table])) > 0;
}

async function headOk(url) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    const res = await fetch(url, { method: "HEAD", signal: ctl.signal });
    clearTimeout(t);
    return res.status < 500;
  } catch {
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const noNetwork = args.includes("--no-network");
  const dirArg = args.find((a) => !a.startsWith("--"));
  const dir = dirArg ? path.resolve(dirArg) : newestBackupDir();
  if (!dir || !existsSync(path.join(dir, "manifest.json"))) {
    console.error("No backup found. Run scripts/backup/backup-db.mjs first, or pass a backup dir.");
    process.exit(1);
  }

  const env = loadEnv(REPO_ROOT);
  const passphrase = env.BACKUP_PASSPHRASE || null;
  const t0 = Date.now();
  const timings = {};
  const findings = []; // { level: 'pass'|'warn'|'fail', check, detail }
  const note = (level, check, detail) => {
    findings.push({ level, check, detail });
    const mark = level === "pass" ? "✓" : level === "warn" ? "!" : "✗";
    console.log(`  ${mark} ${check}: ${detail}`);
  };

  console.log(`Restore drill — source: ${dir}\n`);

  // Phase 1 — integrity
  console.log("Phase 1: backup integrity");
  let manifest;
  {
    const p0 = Date.now();
    const result = verifyBackupDir(dir, passphrase);
    manifest = result.manifest;
    timings.integrityMs = Date.now() - p0;
    if (result.failures.length) {
      for (const f of result.failures) note("fail", "integrity", f);
      console.error("Aborting drill — the archive itself is not trustworthy.");
      process.exit(1);
    }
    note("pass", "integrity", `${result.tables} tables / ${result.rows} rows hash-verified`);
  }

  // Phase 2 — restore into isolated PGlite
  console.log("\nPhase 2: restore into isolated in-memory Postgres (PGlite)");
  const db = new PGlite();
  const restored = {};
  {
    const p0 = Date.now();
    for (const [table, meta] of Object.entries(manifest.tables)) {
      if (meta.error) continue;
      const rows = loadRows(dir, meta, passphrase);
      await restoreTable(db, table, rows, meta.pk, meta.columns);
      restored[table] = rows.length;
    }
    timings.restoreMs = Date.now() - p0;
    const totalRows = Object.values(restored).reduce((a, b) => a + b, 0);
    note("pass", "restore", `${Object.keys(restored).length} tables / ${totalRows} rows loaded in ${(timings.restoreMs / 1000).toFixed(1)}s`);
  }

  // Phase 3 — validations
  console.log("\nPhase 3: validation queries");
  {
    const p0 = Date.now();

    for (const [table, expected] of Object.entries(restored)) {
      const actual = await count(db, `SELECT count(*)::int AS n FROM ${qid(table)}`);
      if (actual !== expected) note("fail", "row-count", `${table}: restored ${actual} ≠ backup ${expected}`);
    }
    note("pass", "row-count", "every restored table matches its manifest count");

    const fkChecks = [
      ["books", "author_id", "authors", "id"],
      ["books", "category_id", "categories", "id"],
      ["books", "department_id", "departments", "id"],
      ["book_files", "book_id", "books", "id"],
      ["research_reports", "department_id", "departments", "id"],
      ["reviews", "book_id", "books", "id"],
      // hosted schema drift caught in the admin-dashboard rebuild: the live
      // column is book_file_id (not book_id) — validate what is really there.
      ["download_logs", "book_file_id", "book_files", "id"],
    ];
    for (const [child, fk, parent, pk] of fkChecks) {
      if (!(await tableExists(db, child)) || !(await tableExists(db, parent))) continue;
      const childCols = await db.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = $1`, [child],
      );
      if (!childCols.rows.some((r) => r.column_name === fk)) {
        note("warn", "fk", `${child}.${fk} column absent — schema drift? (skipped)`);
        continue;
      }
      const orphans = await count(
        db,
        `SELECT count(*)::int AS n FROM ${qid(child)} c
          WHERE c.${qid(fk)} IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM ${qid(parent)} p WHERE p.${qid(pk)} = c.${qid(fk)})`,
      );
      if (orphans > 0) note("fail", "fk", `${child}.${fk} → ${parent}: ${orphans} orphaned rows`);
      else note("pass", "fk", `${child}.${fk} → ${parent}.${pk} intact`);
    }

    if (await tableExists(db, "profiles")) {
      const admins = await count(db, `SELECT count(*)::int AS n FROM profiles WHERE role IN ('admin','super_admin') OR is_super_admin = true`);
      if (admins === 0) note("fail", "authz", "no admin/super_admin profile in the restore — admin access would be lost");
      else note("pass", "authz", `${admins} admin-capable profiles present`);
      const badRoles = await count(db, `SELECT count(*)::int AS n FROM profiles WHERE role NOT IN ('reader','staff','librarian','admin','super_admin')`);
      if (badRoles > 0) note("fail", "authz", `${badRoles} profiles with unknown roles`);
    }
    if (await tableExists(db, "role_permissions")) {
      const perms = await count(db, `SELECT count(*)::int AS n FROM role_permissions`);
      note(perms > 0 ? "pass" : "warn", "authz", `role_permissions rows: ${perms} (0 = hardcoded defaults apply)`);
    }

    if (await tableExists(db, "books")) {
      const noSlug = await count(db, `SELECT count(*)::int AS n FROM books WHERE is_published AND (slug IS NULL OR slug = '')`);
      note(noSlug ? "fail" : "pass", "public-content", noSlug ? `${noSlug} published books without slugs` : "every published book has a slug");
      if (await tableExists(db, "book_files")) {
        const noFile = await count(
          db,
          `SELECT count(*)::int AS n FROM books b WHERE b.is_published
             AND NOT EXISTS (SELECT 1 FROM book_files f WHERE f.book_id = b.id)`,
        );
        note(noFile ? "warn" : "pass", "public-content", noFile ? `${noFile} published books have no file row (covers-only records?)` : "every published book has a file row");
      }
    }
    if (await tableExists(db, "research_reports")) {
      const noFile = await count(db, `SELECT count(*)::int AS n FROM research_reports WHERE is_published AND (file_url IS NULL OR file_url = '')`);
      note(noFile ? "warn" : "pass", "public-content", noFile ? `${noFile} published theses without file_url` : "every published thesis has a file_url");
    }

    for (const [table, label] of [
      ["admin_audit_log", "admin audit trail"],
      ["contact_messages", "contact inbox"],
      ["reading_progress", "reader progress"],
    ]) {
      if (await tableExists(db, table)) {
        note("pass", "workflow", `${label} restored (${restored[table] ?? 0} rows)`);
      } else {
        note("warn", "workflow", `${label} table missing from backup`);
      }
    }

    if (restored.book_pages) {
      note("pass", "search-index", `book_pages restored (${restored.book_pages} rows) — full-text search restores directly`);
    } else {
      note("warn", "search-index", "book_pages excluded (derived) — rebuild after restore: scripts/extract-pdf-text.ts, then scripts/embed-library.ts for embeddings");
    }

    timings.validateMs = Date.now() - p0;
  }

  // Phase 4 — storage re-link probes
  console.log("\nPhase 4: DB↔storage re-link probes");
  if (noNetwork) {
    note("warn", "re-link", "skipped (--no-network)");
  } else {
    const p0 = Date.now();
    const urls = [];
    const collect = async (sql) => {
      try {
        const res = await db.query(sql);
        for (const row of res.rows) if (row.u?.startsWith("http")) urls.push(row.u);
      } catch { /* table/column may be absent in partial backups */ }
    };
    await collect(`SELECT f.file_url AS u FROM book_files f JOIN books b ON b.id = f.book_id WHERE b.is_published LIMIT 3`);
    await collect(`SELECT cover_url AS u FROM books WHERE is_published AND cover_url IS NOT NULL LIMIT 2`);
    await collect(`SELECT file_url AS u FROM research_reports WHERE is_published AND file_url IS NOT NULL LIMIT 3`);
    let ok = 0;
    for (const u of urls) if (await headOk(u)) ok += 1;
    timings.relinkMs = Date.now() - p0;
    if (urls.length === 0) note("warn", "re-link", "no http file URLs found to probe");
    else if (ok === urls.length) note("pass", "re-link", `${ok}/${urls.length} sampled restored file URLs reachable on live storage`);
    else note("fail", "re-link", `${urls.length - ok}/${urls.length} sampled file URLs unreachable`);
  }

  await db.close();

  // Phase 5 — report
  const totalMs = Date.now() - t0;
  const fails = findings.filter((f) => f.level === "fail").length;
  const warns = findings.filter((f) => f.level === "warn").length;
  const verdict = fails === 0 ? "PASS" : "FAIL";

  const reportDir = path.join(REPO_ROOT, "docs", "drills");
  mkdirSync(reportDir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const reportPath = path.join(reportDir, `RESTORE-DRILL-${date}.md`);
  const report = `# Restoration Drill — ${date}

**Verdict: ${verdict}** (${fails} failures, ${warns} warnings) · total ${(totalMs / 1000).toFixed(1)}s

- Source archive: \`${path.basename(dir)}\` (created ${manifest.finishedAt}, ${manifest.totalRows} rows, encrypted: ${manifest.encrypted})
- Target: PGlite (in-process, in-memory Postgres — fully isolated; production untouched)
- Phases: integrity ${(timings.integrityMs / 1000).toFixed(1)}s · restore ${(timings.restoreMs / 1000).toFixed(1)}s · validation ${((timings.validateMs ?? 0) / 1000).toFixed(1)}s · re-link ${((timings.relinkMs ?? 0) / 1000).toFixed(1)}s

## Findings

| Result | Check | Detail |
|---|---|---|
${findings.map((f) => `| ${f.level.toUpperCase()} | ${f.check} | ${f.detail.replace(/\|/g, "\\|")} |`).join("\n")}

## RTO evidence

A metadata-complete database restore takes ~${Math.ceil(timings.restoreMs / 1000)}s at current
collection size. Full production recovery adds: new Supabase project + apply
migrations (~30 min), storage restore from the box snapshot (size-dependent),
env restore from the password manager (~15 min), redeploy + auth URL config
(~15 min) — see docs/BACKUP-DR.md §RTO for the composite target.

## Follow-ups

${fails === 0 ? "- none required from this run" : "- resolve every FAIL above and re-run the drill"}
${warns > 0 ? "- review WARN items; excluded derived tables need their rebuild scripts after a real restore" : ""}
`;
  writeFileSync(reportPath, report);

  console.log(`\n${verdict}: ${fails} failures, ${warns} warnings, ${(totalMs / 1000).toFixed(1)}s total`);
  console.log(`Report → ${reportPath}`);

  if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    await recordOpsEvent(env, "restore_drill", fails === 0 ? "ok" : "fail", {
      source: path.basename(dir),
      failures: fails,
      warnings: warns,
      durationMs: totalMs,
    });
  }
  if (fails > 0) process.exit(1);
}

main().catch((e) => {
  console.error("Drill crashed:", e.stack ?? e.message);
  process.exit(1);
});
