#!/usr/bin/env node
// Storage inventory: enumerates every file reference the database holds
// (book files, covers, thesis PDFs, publication PDFs, post images) and
// writes it next to the DB backup. The bytes themselves are backed up by
// the rsync/restic job on the Zima box (docs/BACKUP-DR.md §files) — this
// inventory is what a restore is reconciled AGAINST: it says which files
// must exist and where the DB expects them.
//
// Also reachability-samples N files per source so a silently-dead storage
// origin shows up in the nightly run, not during a disaster.
//
// Usage: node scripts/backup/backup-storage-inventory.mjs [--out DIR] [--sample N]

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dumpTable, loadEnv, recordOpsEvent, requireEnv, timestampSlug } from "./lib.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// table → columns holding file URLs/keys (kept in sync with lib/zima.ts
// destinations and /api/*/download routes).
const SOURCES = [
  { table: "book_files", pk: ["id"], columns: ["file_url"], label: "book PDFs" },
  { table: "books", pk: ["id"], columns: ["cover_url"], label: "book covers" },
  { table: "research_reports", pk: ["id"], columns: ["file_url", "cover_url"], label: "theses" },
  { table: "publications", pk: ["id"], columns: ["pdf_url", "cover_url"], label: "publications" },
  { table: "team_members", pk: ["id"], columns: ["photo_url"], label: "team photos" },
];

function classify(ref) {
  if (!ref) return null;
  if (ref.startsWith("http")) {
    try {
      const host = new URL(ref).host;
      return { kind: host.includes("storage-ptec") ? "zima" : "external-url", host };
    } catch {
      return { kind: "malformed", host: null };
    }
  }
  return { kind: "r2-key", host: null }; // bare key → legacy private R2 bucket
}

async function headOk(url) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    const res = await fetch(url, { method: "HEAD", signal: ctl.signal });
    clearTimeout(t);
    // Auth challenges still prove the origin is alive (mirrors /api/health).
    return res.status < 500;
  } catch {
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const outRoot = args.includes("--out")
    ? args[args.indexOf("--out") + 1]
    : path.join(process.env.HOME ?? ".", "ptec-backups");
  const sampleN = args.includes("--sample") ? Number(args[args.indexOf("--sample") + 1]) : 5;

  const env = loadEnv(REPO_ROOT);
  requireEnv(env, ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);

  const entries = [];
  const byKind = { zima: 0, "r2-key": 0, "external-url": 0, malformed: 0 };

  for (const source of SOURCES) {
    let rows = [];
    try {
      rows = await dumpTable(env, source.table, source.pk);
    } catch (e) {
      console.warn(`  ! ${source.table}: ${e.message}`);
      continue;
    }
    for (const row of rows) {
      for (const col of source.columns) {
        const ref = row[col];
        const cls = classify(ref);
        if (!cls) continue;
        byKind[cls.kind] += 1;
        entries.push({ table: source.table, id: row.id, column: col, ref, kind: cls.kind });
      }
    }
    console.log(`  ✓ ${source.label}: ${rows.length} rows scanned`);
  }

  // Reachability sample: spread across zima + external URLs.
  const urls = entries.filter((e) => e.kind !== "r2-key" && e.kind !== "malformed");
  const sample = [];
  for (let i = 0; i < Math.min(sampleN, urls.length); i++) {
    const pick = urls[Math.floor((i * urls.length) / Math.min(sampleN, urls.length))];
    sample.push({ ref: pick.ref, ok: await headOk(pick.ref) });
  }
  const dead = sample.filter((s) => !s.ok);

  const dir = path.join(outRoot, "storage-inventory");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `inventory-${timestampSlug()}.json`);
  writeFileSync(
    file,
    JSON.stringify(
      {
        kind: "ptec-storage-inventory",
        generatedAt: new Date().toISOString(),
        totals: byKind,
        fileCount: entries.length,
        reachabilitySample: sample,
        entries,
      },
      null,
      2,
    ),
  );

  console.log(`\nInventory → ${file}`);
  console.log(`  ${entries.length} file refs (zima ${byKind.zima}, legacy R2 keys ${byKind["r2-key"]}, external ${byKind["external-url"]})`);
  if (dead.length) console.error(`  ✗ ${dead.length}/${sample.length} sampled files unreachable!`);
  else console.log(`  ✓ ${sample.length}/${sample.length} sampled files reachable`);

  await recordOpsEvent(env, "backup_files", dead.length ? "warn" : "ok", {
    fileRefs: entries.length,
    ...byKind,
    sampled: sample.length,
    unreachable: dead.length,
  });
  if (dead.length) process.exit(1);
}

main().catch((e) => {
  console.error("Inventory failed:", e.message);
  process.exit(1);
});
