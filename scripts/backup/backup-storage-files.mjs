#!/usr/bin/env node
// Zima Storage file backup — the byte-copy leg of docs/BACKUP-DR.md §files.
//
// The bytes (every PDF + cover) exist only on the ZimaOS box; this job
// mirrors them to a second disk / mounted off-site target so a dead disk is
// no longer a total-loss event. backup-storage-inventory.mjs records what the
// DB *expects* to exist; this script copies what actually exists. A restore
// reconciles one against the other.
//
// Incremental: a file is re-copied only when its size or mtime changed since
// the last run (state in <target>/.sync-index.json). Nothing is ever deleted
// from the target — ransomware or an fat-fingered rm on the source must not
// propagate; prune the target manually per the retention policy.
//
// On success writes <target>/.last-ok (ISO timestamp + run stats) — the
// freshness marker the file-snapshot-stale alert watches. On failure records
// ops_events kind "backup_files" status "fail" and pushes a Sev 2 Telegram
// alert (scripts/ops/alert-telegram.mjs), so a silently dead backup is loud.
//
// Usage:
//   node scripts/backup/backup-storage-files.mjs \
//     [--source DIR] [--target DIR] [--encrypt] [--dry-run]
// Source/target default to STORAGE_BACKUP_SOURCE / STORAGE_BACKUP_TARGET
// (.env on the box). --encrypt writes AES-256-GCM copies (<name>.enc, key
// from BACKUP_PASSPHRASE) for targets that leave the building; the default
// plain mirror keeps single-file restores a plain `cp`.
//
// Scheduled by deploy/ptec-storage-backup.timer (daily 02:00 box-local).

import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encrypt, loadEnv, recordOpsEvent } from "./lib.mjs";
import { sendTelegramAlert } from "../ops/alert-telegram.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const INDEX_FILE = ".sync-index.json";
const MARKER_FILE = ".last-ok";

function arg(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

/** Recursive listing of regular files as target-relative POSIX paths. */
function walk(root, rel = "") {
  const out = [];
  for (const entry of readdirSync(path.join(root, rel), { withFileTypes: true })) {
    if (entry.name === INDEX_FILE || entry.name === MARKER_FILE) continue;
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(root, relPath));
    else if (entry.isFile()) out.push(relPath);
  }
  return out;
}

async function copyPlain(src, dest) {
  mkdirSync(path.dirname(dest), { recursive: true });
  await pipeline(createReadStream(src), createWriteStream(dest));
}

function copyEncrypted(src, dest, passphrase) {
  // Whole-file encrypt (lib.mjs layout). Fine for this collection's file
  // sizes; revisit with streaming if single files ever exceed memory.
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, encrypt(readFileSync(src), passphrase));
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const doEncrypt = args.includes("--encrypt");

  const env = loadEnv(REPO_ROOT);
  const source = arg(args, "--source") ?? env.STORAGE_BACKUP_SOURCE;
  const target = arg(args, "--target") ?? env.STORAGE_BACKUP_TARGET;

  if (!source || !target) {
    console.error(
      "Source and target required: --source/--target flags or STORAGE_BACKUP_SOURCE/STORAGE_BACKUP_TARGET in .env.\n" +
        "On the box: source = the Zima Storage data directory, target = the second-disk/off-site mount.",
    );
    process.exit(2);
  }
  if (!existsSync(source)) {
    console.error(`Source does not exist: ${source}`);
    process.exit(2);
  }
  if (path.resolve(target).startsWith(path.resolve(source) + path.sep)) {
    console.error("Target must not live inside the source (the mirror would mirror itself).");
    process.exit(2);
  }
  const passphrase = env.BACKUP_PASSPHRASE || null;
  if (doEncrypt && !passphrase) {
    console.error("--encrypt requires BACKUP_PASSPHRASE in .env.");
    process.exit(2);
  }

  const t0 = Date.now();
  mkdirSync(target, { recursive: true });

  const indexPath = path.join(target, INDEX_FILE);
  // Read directly rather than existsSync() + readFileSync(): the two-call
  // form has a check-then-use gap (the file can vanish, or be swapped for a
  // symlink, between the check and the read) that a single try/catch on
  // ENOENT closes outright, with no window at all.
  let index = {};
  try {
    index = JSON.parse(readFileSync(indexPath, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") console.warn("Sync index unreadable — treating every file as changed.");
  }

  const files = walk(source);
  let copied = 0;
  let copiedBytes = 0;
  let skipped = 0;
  const errors = [];

  for (const rel of files) {
    const srcPath = path.join(source, rel);
    const destPath = path.join(target, doEncrypt ? `${rel}.enc` : rel);
    let st;
    try {
      st = statSync(srcPath);
    } catch (e) {
      errors.push(`${rel}: ${e.message}`);
      continue;
    }
    const prev = index[rel];
    const unchanged = prev && prev.size === st.size && prev.mtimeMs === st.mtimeMs;
    if (unchanged && existsSync(destPath)) {
      skipped += 1;
      continue;
    }
    if (dryRun) {
      console.log(`  would copy ${rel} (${st.size} bytes)`);
      copied += 1;
      copiedBytes += st.size;
      continue;
    }
    try {
      if (doEncrypt) copyEncrypted(srcPath, destPath, passphrase);
      else await copyPlain(srcPath, destPath);
      index[rel] = { size: st.size, mtimeMs: st.mtimeMs };
      copied += 1;
      copiedBytes += st.size;
    } catch (e) {
      errors.push(`${rel}: ${e.message}`);
    }
  }

  const durationMs = Date.now() - t0;
  const stats = {
    source,
    files: files.length,
    copied,
    copiedBytes,
    skipped,
    errors: errors.length,
    encrypted: doEncrypt,
    dryRun,
    durationMs,
  };

  if (!dryRun) {
    writeFileSync(indexPath, JSON.stringify(index));
    if (errors.length === 0) {
      writeFileSync(
        path.join(target, MARKER_FILE),
        JSON.stringify({ finishedAt: new Date().toISOString(), ...stats }, null, 2),
      );
    }
  }

  console.log(
    `${dryRun ? "[dry-run] " : ""}${files.length} files scanned — ${copied} copied (${(copiedBytes / 1e6).toFixed(1)} MB), ${skipped} unchanged, ${errors.length} errors, ${(durationMs / 1000).toFixed(1)}s`,
  );
  for (const e of errors.slice(0, 20)) console.error(`  ✗ ${e}`);
  if (errors.length > 20) console.error(`  … and ${errors.length - 20} more`);

  const ok = errors.length === 0;
  if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && !dryRun) {
    await recordOpsEvent(env, "backup_files", ok ? "ok" : "fail", stats);
  }
  if (!ok && !dryRun) {
    await sendTelegramAlert(env, {
      severity: 2,
      title: "Storage file backup failed",
      service: "backup-storage-files",
      message: `${errors.length}/${files.length} files failed to copy to ${target}. First: ${errors[0]}`,
      runbook: "docs/BACKUP-DR.md §files · docs/RUNBOOKS.md §I4",
    });
    process.exit(1);
  }
}

main().catch(async (e) => {
  console.error("Storage backup crashed:", e.stack ?? e.message);
  try {
    const env = loadEnv(REPO_ROOT);
    await sendTelegramAlert(env, {
      severity: 2,
      title: "Storage file backup crashed",
      service: "backup-storage-files",
      message: e.message,
      runbook: "docs/BACKUP-DR.md §files",
    });
  } catch {
    /* the alert path must never mask the original failure */
  }
  process.exit(1);
});
