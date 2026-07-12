// Shared helpers for the backup/restore toolchain (docs/BACKUP-DR.md).
// Node builtins only — no app imports, so these scripts run anywhere the
// repo + .env exist (dev machine, ZimaOS box, CI runner).

import { createHash, createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

// ── Env (.env.local overrides .env, mirroring next/dotenv order) ─────────

export function loadEnv(repoRoot) {
  const out = { ...process.env };
  for (const file of [".env", ".env.local"]) {
    const p = path.join(repoRoot, file);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let value = m[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      out[m[1]] = value;
    }
  }
  return out;
}

export function requireEnv(env, keys) {
  const missing = keys.filter((k) => !env[k]);
  if (missing.length) {
    console.error(`Missing required env: ${missing.join(", ")} (set in .env / .env.local)`);
    process.exit(1);
  }
}

// ── PostgREST access (service key — bypasses RLS; scripts only) ──────────

export function restHeaders(env) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

export async function restGet(env, pathname, params = {}) {
  const url = new URL(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${pathname}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: restHeaders(env) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GET ${pathname} → ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

/**
 * Table catalog from the PostgREST OpenAPI root: names + primary-key columns
 * (PostgREST marks PKs in the column description). Views have no PK marker,
 * which is one of the signals used to exclude them from dumps.
 */
export async function discoverTables(env) {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, { headers: restHeaders(env) });
  if (!res.ok) throw new Error(`OpenAPI discovery failed: ${res.status}`);
  const spec = await res.json();
  const tables = {};
  for (const [name, def] of Object.entries(spec.definitions ?? {})) {
    const pk = [];
    for (const [col, colDef] of Object.entries(def.properties ?? {})) {
      if ((colDef.description ?? "").includes("<pk/>")) pk.push(col);
    }
    tables[name] = { pk, columns: Object.keys(def.properties ?? {}) };
  }
  return tables;
}

/** Full-table dump via ordered keyset-free pagination (ordered by pk). */
export async function dumpTable(env, table, pkColumns, pageSize = 1000) {
  const rows = [];
  const order = pkColumns.length ? pkColumns.map((c) => `${c}.asc`).join(",") : null;
  for (let offset = 0; ; offset += pageSize) {
    const params = { select: "*", limit: String(pageSize), offset: String(offset) };
    if (order) params.order = order;
    const page = await restGet(env, table, params);
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

/** Best-effort heartbeat into ops_events (migration 0088); warns if absent. */
export async function recordOpsEvent(env, kind, status, detail) {
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/ops_events`, {
      method: "POST",
      headers: { ...restHeaders(env), "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ kind, status, detail }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[ops_events] not recorded (${res.status}) — apply migration 0088 for backup monitoring. ${text.slice(0, 120)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[ops_events] not recorded: ${e.message}`);
    return false;
  }
}

// ── Integrity + encryption ───────────────────────────────────────────────

export function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function toJsonl(rows) {
  return rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
}

export function gzip(buf) {
  return gzipSync(Buffer.isBuffer(buf) ? buf : Buffer.from(buf));
}

export function gunzip(buf) {
  return gunzipSync(buf);
}

const ENC_MAGIC = Buffer.from("PTECENC1");

/** AES-256-GCM with scrypt key derivation. Layout: magic|salt16|iv12|tag16|data. */
export function encrypt(buf, passphrase) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(buf), cipher.final()]);
  return Buffer.concat([ENC_MAGIC, salt, iv, cipher.getAuthTag(), data]);
}

export function decrypt(buf, passphrase) {
  if (!buf.subarray(0, 8).equals(ENC_MAGIC)) throw new Error("Not a PTEC-encrypted file");
  const salt = buf.subarray(8, 24);
  const iv = buf.subarray(24, 36);
  const tag = buf.subarray(36, 52);
  const key = scryptSync(passphrase, salt, 32);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(buf.subarray(52)), decipher.final()]);
}

export function timestampSlug(d = new Date()) {
  return d.toISOString().replace(/[:.]/g, "-").slice(0, 19) + "Z";
}
