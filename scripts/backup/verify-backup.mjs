#!/usr/bin/env node
// Backup integrity check: recomputes both hashes for every artifact in a
// backup directory (file-on-disk hash, and logical-content hash after
// decrypt+gunzip) against manifest.json, and re-counts rows. Run it after
// every backup (the cron wrapper chains it) and before trusting any archive
// for a restore.
//
// Usage: node scripts/backup/verify-backup.mjs <backup-dir>
//        (BACKUP_PASSPHRASE required when the archive is encrypted)

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decrypt, gunzip, loadEnv, recordOpsEvent, sha256 } from "./lib.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function verifyBackupDir(dir, passphrase) {
  const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8"));
  if (manifest.encrypted && !passphrase) {
    throw new Error("Archive is encrypted — set BACKUP_PASSPHRASE");
  }

  const failures = [];
  let tables = 0;
  let rows = 0;

  for (const [table, meta] of Object.entries(manifest.tables)) {
    if (meta.error) {
      failures.push(`${table}: backup itself recorded an error (${meta.error})`);
      continue;
    }
    tables += 1;
    const artifact = readFileSync(path.join(dir, meta.file));
    if (sha256(artifact) !== meta.artifactSha256) {
      failures.push(`${table}: artifact hash mismatch (file corrupted on disk)`);
      continue;
    }
    let jsonl;
    try {
      const gz = manifest.encrypted ? decrypt(artifact, passphrase) : artifact;
      jsonl = gunzip(gz);
    } catch (e) {
      failures.push(`${table}: cannot decrypt/decompress (${e.message})`);
      continue;
    }
    if (sha256(jsonl) !== meta.sha256) {
      failures.push(`${table}: content hash mismatch`);
      continue;
    }
    const lineCount = jsonl.length === 0 ? 0 : jsonl.toString("utf8").split("\n").filter(Boolean).length;
    if (lineCount !== meta.rows) {
      failures.push(`${table}: row count ${lineCount} ≠ manifest ${meta.rows}`);
      continue;
    }
    rows += lineCount;
  }

  return { manifest, tables, rows, failures };
}

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error("Usage: node scripts/backup/verify-backup.mjs <backup-dir>");
    process.exit(1);
  }
  const env = loadEnv(REPO_ROOT);
  const { tables, rows, failures } = verifyBackupDir(path.resolve(dir), env.BACKUP_PASSPHRASE);

  if (failures.length) {
    console.error(`INTEGRITY FAILURES (${failures.length}):`);
    for (const f of failures) console.error(`  ✗ ${f}`);
  }
  console.log(`${failures.length ? "FAIL" : "OK"}: ${tables} tables, ${rows} rows verified`);

  if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    await recordOpsEvent(env, "backup_verify", failures.length ? "fail" : "ok", {
      dir: path.basename(path.resolve(dir)),
      tables,
      rows,
      failures: failures.length,
    });
  }
  if (failures.length) process.exit(1);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((e) => {
    console.error("Verify failed:", e.message);
    process.exit(1);
  });
}
