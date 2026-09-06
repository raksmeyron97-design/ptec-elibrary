#!/usr/bin/env node
// Latency benchmark for the migration (docs/SELF_HOSTED_SUPABASE_CUTOVER.md §Performance).
// Node ≥ 20, no dependencies. Records p50/p95/min over N samples, separated by layer:
//
//   supabase.rest      GET /rest/v1/categories?select=id&limit=1   (gateway + PostgREST + DB)
//   supabase.auth      GET /auth/v1/health                          (gateway + GoTrue)
//   app.health.db      /api/health deep probe latencyMs.db          (app → Supabase, from inside the container; needs CRON_SECRET)
//   app.ttfb.*         time-to-first-byte of /, /books, /theses, /search?q=…, /km
//   app.api.search     GET /api/search/native?q=mathematics          (app + several DB queries)
//   app.api.search_km  GET /api/search/native?q=គណិតវិទ្យា
//
//   node scripts/migration/benchmark.mjs --label cloud-baseline
//   node scripts/migration/benchmark.mjs --label selfhosted --app https://library.ptec.edu.kh \
//        --supabase https://supabase.storage-ptec.online --anon <key> [--cron-secret …] [--n 20]
//
// Writes reports/migration/benchmark/<label>-<ts>.json and .md. Compare two runs:
//   node scripts/migration/benchmark.mjs --compare a.json b.json
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const env = {};
for (const f of [".env", ".env.local"]) {
  const p = path.join(ROOT, f); if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) { const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g, ""); }
}
const OUT = path.join(process.env.MIGRATION_OUT_DIR ?? path.join(ROOT, "reports/migration"), "benchmark");
mkdirSync(OUT, { recursive: true });

if (args.includes("--compare")) {
  const [a, b] = [readFileSync(args[args.indexOf("--compare") + 1], "utf8"), readFileSync(args[args.indexOf("--compare") + 2], "utf8")].map(JSON.parse);
  const rows = Object.keys(a.results).map((k) => { const x = a.results[k], y = b.results[k]; return `| ${k} | ${fmt(x)} | ${fmt(y)} | ${y && x ? pct(x.p50, y.p50) : "-"} |`; });
  console.log(`| probe | ${a.label} p50/p95 | ${b.label} p50/p95 | Δ p50 |\n|---|---|---|---|\n${rows.join("\n")}`);
  process.exit(0);
}

const label = opt("--label", "run");
const APP = (opt("--app", env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000")).replace(/\/$/, "");
const SB = (opt("--supabase", env.NEXT_PUBLIC_SUPABASE_URL ?? "")).replace(/\/$/, "");
const ANON = opt("--anon", env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "");
const CRON = opt("--cron-secret", process.env.CRON_SECRET ?? env.CRON_SECRET ?? "");
const N = Number(opt("--n", 20));
const UA = "ptec-migration-benchmark"; // bot UA: search analytics ignore it

function fmt(r) { return r ? `${r.p50} / ${r.p95} ms` : "n/a"; }
function pct(a, b) { return a ? `${b < a ? "−" : "+"}${Math.abs(Math.round(((b - a) / a) * 100))}%` : "-"; }
function stats(ms) { const s = [...ms].sort((x, y) => x - y); const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]; return { n: s.length, min: s[0], p50: q(0.5), p95: q(0.95), max: s[s.length - 1] }; }

async function timed(fn) { const t = performance.now(); const r = await fn(); return { ms: Math.round(performance.now() - t), r }; }
async function sample(name, fn, n = N) {
  const ms = []; let last = null; let errors = 0;
  await fn().catch(() => {}); // warm-up (not counted)
  for (let i = 0; i < n; i++) { try { const { ms: m, r } = await timed(fn); ms.push(m); last = r; } catch { errors++; } }
  const st = ms.length ? stats(ms) : null;
  results[name] = st ? { ...st, errors, note: last ?? undefined } : { errors, note: "all failed" };
  console.log(`  ${name.padEnd(22)} ${st ? `p50 ${String(st.p50).padStart(5)}  p95 ${String(st.p95).padStart(5)}  min ${String(st.min).padStart(5)}` : "FAILED"}${errors ? `  (${errors} errors)` : ""}`);
}
const results = {};
const get = (url, headers = {}) => fetch(url, { headers: { "user-agent": UA, ...headers }, cache: "no-store" });
const ttfb = async (url) => { const res = await get(url); if (!res.ok) throw new Error(res.status); const reader = res.body.getReader(); await reader.read(); reader.cancel().catch(() => {}); return res.status; };

console.log(`benchmark "${label}"  app=${APP}  supabase=${SB || "(none)"}  n=${N}`);
if (SB && ANON) {
  await sample("supabase.rest", async () => { const r = await get(`${SB}/rest/v1/categories?select=id&limit=1`, { apikey: ANON, authorization: `Bearer ${ANON}` }); if (!r.ok) throw new Error(r.status); await r.text(); return r.status; });
  await sample("supabase.auth", async () => { const r = await get(`${SB}/auth/v1/health`, { apikey: ANON }); if (!r.ok) throw new Error(r.status); await r.text(); return r.status; });
}
for (const p of ["/", "/books", "/theses", "/search?q=mathematics", "/km"]) await sample(`app.ttfb.${p === "/" ? "home" : p.replace(/[/?=]+/g, "_").replace(/^_/, "")}`, () => ttfb(`${APP}${p}`));
await sample("app.api.health", async () => { const r = await get(`${APP}/api/health`); await r.text(); return r.status; });
await sample("app.api.search", async () => { const r = await get(`${APP}/api/search/native?q=mathematics`); if (!r.ok) throw new Error(r.status); await r.text(); return r.status; }, Math.min(N, 10));
await sample("app.api.search_km", async () => { const r = await get(`${APP}/api/search/native?q=${encodeURIComponent("គណិតវិទ្យា")}`); if (!r.ok) throw new Error(r.status); await r.text(); return r.status; }, Math.min(N, 10));
if (CRON) {
  const dbms = [];
  for (let i = 0; i < Math.min(N, 10); i++) { try { const r = await get(`${APP}/api/health`, { authorization: `Bearer ${CRON}` }); const j = await r.json(); if (j.latencyMs?.db != null) dbms.push(j.latencyMs.db); } catch {} }
  if (dbms.length) { results["app.health.db"] = { ...stats(dbms), note: "app→Supabase round trip measured inside the app container" }; console.log(`  ${"app.health.db".padEnd(22)} p50 ${results["app.health.db"].p50}  p95 ${results["app.health.db"].p95}  (inside container)`); }
}

const ts = new Date().toISOString().replace(/[:.]/g, "-");
const out = { label, at: new Date().toISOString(), app: APP, supabase: SB, n: N, results };
writeFileSync(path.join(OUT, `${label}-${ts}.json`), JSON.stringify(out, null, 2));
const md = [`# Benchmark: ${label} (${out.at})`, "", `app: ${APP}  ·  supabase: ${SB || "n/a"}  ·  samples: ${N}`, "", "| probe | p50 ms | p95 ms | min | errors |", "|---|---|---|---|---|",
  ...Object.entries(results).map(([k, v]) => `| ${k} | ${v.p50 ?? "-"} | ${v.p95 ?? "-"} | ${v.min ?? "-"} | ${v.errors ?? 0} |`)].join("\n");
writeFileSync(path.join(OUT, `${label}-${ts}.md`), md + "\n");
console.log(`\nwrote ${path.join(OUT, `${label}-${ts}.{json,md}`)}`);
