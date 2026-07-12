#!/usr/bin/env node
// Configuration fingerprint: records WHICH env vars exist and a SHA-256 of
// each value — never the values themselves — plus git/deploy coordinates.
// After a disaster you restore secrets from the password-manager copy
// (docs/BACKUP-DR.md §config) and use this fingerprint to verify nothing is
// missing or silently different from what production last ran with.
//
// Usage: node scripts/backup/backup-config.mjs [--out DIR]

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, recordOpsEvent, sha256, timestampSlug } from "./lib.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const outRoot = args.includes("--out")
    ? args[args.indexOf("--out") + 1]
    : path.join(process.env.HOME ?? ".", "ptec-backups");
  const env = loadEnv(REPO_ROOT);

  // Only variables the app actually documents (.env.example) + everything
  // set in local env files — names and value-hashes only.
  const example = readFileSync(path.join(REPO_ROOT, ".env.example"), "utf8");
  const documented = [...example.matchAll(/^([A-Z][A-Z0-9_]*)\s*=/gm)].map((m) => m[1]);
  const localKeys = Object.keys(loadEnv(REPO_ROOT)).filter((k) => /^[A-Z][A-Z0-9_]*$/.test(k));
  const keys = [...new Set([...documented, ...localKeys])].sort();

  const vars = {};
  for (const key of keys) {
    const value = env[key];
    vars[key] = value
      ? { present: true, valueSha256: sha256(Buffer.from(value)).slice(0, 16), length: value.length }
      : { present: false };
  }

  const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
  const fingerprint = {
    kind: "ptec-config-fingerprint",
    version: 1,
    generatedAt: new Date().toISOString(),
    git: {
      commit: git("rev-parse HEAD"),
      branch: git("rev-parse --abbrev-ref HEAD"),
      dirty: git("status --porcelain") ? true : false,
    },
    app: { name: pkg.name, next: pkg.dependencies?.next ?? null, node: process.version },
    migrations: (() => {
      try {
        return execSync("ls supabase/migrations", { cwd: REPO_ROOT, encoding: "utf8" })
          .trim().split("\n").filter((f) => f.endsWith(".sql"));
      } catch { return []; }
    })(),
    envVars: vars,
    missingDocumented: documented.filter((k) => !env[k]),
  };

  const dir = path.join(outRoot, "config");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `config-fingerprint-${timestampSlug()}.json`);
  writeFileSync(file, JSON.stringify(fingerprint, null, 2));
  console.log(`Config fingerprint → ${file}`);
  console.log(`  ${keys.length} vars inventoried; missing documented vars: ${fingerprint.missingDocumented.join(", ") || "none"}`);

  if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    await recordOpsEvent(env, "backup_config", "ok", {
      vars: keys.length,
      missing: fingerprint.missingDocumented.length,
      commit: fingerprint.git.commit?.slice(0, 8) ?? null,
    });
  }
}

main().catch((e) => {
  console.error("Config fingerprint failed:", e.message);
  process.exit(1);
});
