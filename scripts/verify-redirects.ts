// Production verifier for URL permanence (migration 0170, SEO audit 2026-10
// WI-1). Read-only: GET requests, one at a time, with a delay between them.
//
//   npx tsx scripts/verify-redirects.ts [--base https://library.ptec.edu.kh]
//       [--delay 1500] [--json reports/verify-redirects.json] [--strict]
//
// Which paths: every url_redirects row (read through the same anon column
// grant the edge uses — the decision only, never `reason`), plus the ten
// legacy subject slugs that next.config 301s. Each is asked in English and
// under /km, and must answer exactly one of:
//   * 301 whose Location answers 200 — ONE hop, with the locale kept;
//   * 410 carrying `x-robots-tag: noindex`.
// Anything else FAILS. A transport failure is `unknown` — never a pass and
// never a defect — and the summary says how many could not be checked rather
// than computing a pass count by subtraction (lib/verify/http.ts).
//
// The database is read with the PUBLIC anon key (NEXT_PUBLIC_SUPABASE_URL /
// NEXT_PUBLIC_SUPABASE_ANON_KEY, or --supabase-url / --anon-key): exactly the
// read every visitor's edge request makes. No service-role key is used.

import { SUBJECT_SLUG_REDIRECTS } from "../lib/seo/subject-slug-redirects";
import {
  errorOutcome,
  exitCodeFor,
  fetchWithRetry,
  HttpStatusError,
  incompleteBanner,
  summaryLine,
  tally,
  TransportError,
  type Outcome,
} from "../lib/verify/http";
import { writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const flag = (name: string, fallback?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};

const BASE = (flag("base", "https://library.ptec.edu.kh") as string).replace(/\/$/, "");
const DELAY_MS = Number(flag("delay", "1500"));
const JSON_OUT = flag("json");
const STRICT = argv.includes("--strict");
const SUPABASE_URL = (flag("supabase-url", process.env.NEXT_PUBLIC_SUPABASE_URL) ?? "").replace(/\/$/, "");
const ANON_KEY = flag("anon-key", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ?? "";

type Row = { old_path: string; target_path: string | null; status: number };
type Result = { check: string; outcome: Outcome; detail: string | null };

const results: Result[] = [];
const record = (check: string, outcome: Outcome, detail: string | null = null) => {
  results.push({ check, outcome, detail });
  const label = outcome === "ok" ? "ok  " : outcome === "warn" ? "WARN" : outcome === "unknown" ? "????" : "FAIL";
  console.log(`  ${label}  ${check}`);
  if (detail) console.log(`        ${detail}`);
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const encodePath = (path: string) =>
  path
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");

/**
 * Every decision row, paged — PostgREST clips each response at db-max-rows.
 * A dropped connection is a TransportError (nothing was checked, `unknown`);
 * a refusal is an HTTP answer and fails the run.
 */
async function loadRows(): Promise<Row[]> {
  const rows: Row[] = [];
  const headers = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` };
  for (let from = 0; ; from += 1000) {
    const url = `${SUPABASE_URL}/rest/v1/url_redirects?select=old_path,target_path,status&order=old_path&offset=${from}&limit=1000`;
    let page: Response;
    try {
      page = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
    } catch (err) {
      throw new TransportError((err as Error).message || String(err), 1);
    }
    if (!page.ok) throw new HttpStatusError(page.status, "url_redirects");
    const batch = (await page.json()) as Row[];
    rows.push(...batch);
    if (batch.length < 1000) return rows;
  }
}

async function check(path: string, expect: "redirect" | "gone", localePrefix: "" | "/km") {
  const label = `${localePrefix}${path}`;
  try {
    const res = await fetchWithRetry(`${BASE}${localePrefix}${encodePath(path)}`, {
      redirect: "manual",
      allowStatuses: [301, 302, 303, 307, 308, 404, 410],
    });
    await sleep(DELAY_MS);

    if (expect === "gone") {
      const robots = res.headers.get("x-robots-tag") ?? "";
      if (res.status === 410 && /noindex/i.test(robots)) return record(label, "ok", "410, noindex");
      return record(label, "fail", `expected 410 + noindex, got ${res.status} (x-robots-tag: ${robots || "none"})`);
    }

    if (res.status !== 301) return record(label, "fail", `expected 301, got ${res.status}`);
    const location = res.headers.get("location");
    if (!location) return record(label, "fail", "301 with no Location");
    const target = new URL(location, BASE);
    if (localePrefix && !target.pathname.startsWith(`${localePrefix}/`)) {
      return record(label, "fail", `the locale was dropped: → ${decodeURIComponent(target.pathname)}`);
    }
    const hop = await fetchWithRetry(target.toString(), { redirect: "manual", allowStatuses: [301, 302, 307, 308, 404, 410] });
    await sleep(DELAY_MS);
    if (hop.status === 200) return record(label, "ok", `301 → ${decodeURIComponent(target.pathname)} → 200`);
    return record(label, "fail", `301 → ${decodeURIComponent(target.pathname)} → ${hop.status} (must be one hop to a 200)`);
  } catch (err) {
    const [outcome, detail] = errorOutcome(err);
    // A 4xx/5xx the check did not allow is a real answer; transport is unknown.
    record(label, outcome === "warn" ? "fail" : outcome, detail);
    await sleep(DELAY_MS);
  }
}

async function run() {
  if (!SUPABASE_URL || !ANON_KEY) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or --supabase-url / --anon-key).");
    process.exit(2);
  }
  console.log(`\nverify-redirects  site=${BASE}  database=${new URL(SUPABASE_URL).host}  delay=${DELAY_MS}ms\n`);

  const rows = await loadRows();
  const legacySubjects = SUBJECT_SLUG_REDIRECTS.map((r) => `/subjects/${r.from}`);
  console.log(`  ${rows.length} url_redirects row(s), ${legacySubjects.length} legacy subject slug(s)\n`);

  for (const row of rows) {
    const expect = row.status === 410 ? "gone" : "redirect";
    for (const prefix of ["", "/km"] as const) await check(row.old_path, expect, prefix);
  }
  for (const path of legacySubjects) {
    for (const prefix of ["", "/km"] as const) await check(path, "redirect", prefix);
  }

  const t = tally(results.map((r) => r.outcome));
  console.log(`\n${summaryLine(t)}`);
  const banner = incompleteBanner(t);
  if (banner) console.log(banner);
  if (JSON_OUT) {
    writeFileSync(
      JSON_OUT,
      `${JSON.stringify({ base: BASE, generatedAt: new Date().toISOString(), rows: rows.length, ...t, incomplete: t.unknown > 0, results }, null, 2)}\n`,
    );
    console.log(`Wrote ${JSON_OUT}`);
  }
  process.exit(exitCodeFor(t, STRICT));
}

run().catch((err) => {
  const [outcome, detail] = errorOutcome(err);
  console.error(`\nverification could not run — ${detail}\n`);
  process.exit(outcome === "unknown" && !STRICT ? 0 : 1);
});

export {};
