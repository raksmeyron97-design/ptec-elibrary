// scripts/seo/gsc-report.ts — READ-ONLY (SEO audit 2026-10, WI-9 / C11).
//
//   npx tsx scripts/seo/gsc-report.ts --month 2026-10
//   npx tsx scripts/seo/gsc-report.ts --month 2026-10 --check-live [--delay 1500]
//
// Reads the Search Console Performance export for that month from
// reports/gsc/<yyyy-mm>/ (a .zip, or the CSVs unzipped there) and writes
// reports/seo/kpi-<yyyy-mm>.{json,md}, beside the previous month's values when
// that report exists.
//
// KPIs and the noise / brand / cluster rules are DATA, in
// scripts/seo/gsc-rules.json, copied from the audit (Gate 4 §5.1–5.2, Gate 2
// §4). A KPI whose definition is not there yet, or whose input the export
// lacks, prints [UNKNOWN] — never 0.
//
// --check-live is the monthly dead-URL monitor (P0-1c): it reads the live
// sitemap index and its children, takes the export's page URLs that are NOT
// in any sitemap, and GETs each one — one request at a time, --delay apart,
// redirects not followed — listing those that answer 404 (K-T3) or 5xx. A
// transport failure is `unknown` (lib/verify/http.ts), never a pass.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readZipEntries } from "../../lib/seo/gsc/zip";
import { readExport } from "../../lib/seo/gsc/export";
import { computeKpi, formatKpi, type KpiConfig, type RuleSet } from "../../lib/seo/gsc/kpi";
import { fetchMergedSitemap, urlBlocks } from "../../lib/verify/sitemap";
import { errorOutcome, fetchText, fetchWithRetry, summaryLine, tally, type Outcome } from "../../lib/verify/http";

const argv = process.argv.slice(2);
const flag = (name: string, fallback?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const MONTH = flag("month") ?? "";
const BASE = (flag("base", "https://library.ptec.edu.kh") as string).replace(/\/$/, "");
const DELAY_MS = Number(flag("delay", "1500"));
const CHECK_LIVE = argv.includes("--check-live");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadFiles(dir: string): Map<string, string> {
  const files = new Map<string, string>();
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (name.toLowerCase().endsWith(".zip")) {
      for (const [entry, buf] of readZipEntries(readFileSync(full))) files.set(entry, buf.toString("utf8"));
    } else if (name.toLowerCase().endsWith(".csv")) {
      files.set(name, readFileSync(full, "utf8"));
    }
  }
  return files;
}

function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

type Kpi = { id: string; label: string; value: number | null; shown: string; previous: string | null };

async function checkLive(pageUrls: string[]) {
  console.log(`\n--check-live  site=${BASE}  delay=${DELAY_MS}ms`);
  const xml = await fetchMergedSitemap(BASE, (u) => fetchText(u));
  const inSitemap = new Set(
    urlBlocks(xml)
      .map((b) => /<loc>([^<]+)<\/loc>/.exec(b)?.[1])
      .filter((u): u is string => Boolean(u))
      .map((u) => decodeURIComponent(new URL(u.replace(/&amp;/g, "&")).pathname)),
  );
  const candidates = [...new Set(pageUrls)].filter((u) => {
    try {
      return !inSitemap.has(decodeURIComponent(new URL(u).pathname));
    } catch {
      return false;
    }
  });
  console.log(`  ${inSitemap.size} sitemap URLs; ${candidates.length} export page(s) outside them`);

  const results: { url: string; status: number | null; outcome: Outcome; detail: string | null }[] = [];
  for (const url of candidates) {
    try {
      const res = await fetchWithRetry(url.replace(/^https?:\/\/[^/]+/, BASE), {
        redirect: "manual",
        allowStatuses: [301, 302, 307, 308, 404, 410],
      });
      const status = res.status;
      const outcome: Outcome = status === 404 ? "fail" : "ok";
      results.push({ url, status, outcome, detail: status >= 300 && status < 400 ? res.headers.get("location") : null });
    } catch (err) {
      const [outcome, detail] = errorOutcome(err);
      // A 5xx that persisted is an answer and a defect; transport is unknown.
      results.push({ url, status: null, outcome: outcome === "warn" ? "fail" : outcome, detail });
    }
    await sleep(DELAY_MS);
  }
  const dead = results.filter((r) => r.status === 404);
  const broken = results.filter((r) => r.status === null && r.outcome === "fail");
  const t = tally(results.map((r) => r.outcome));
  console.log(`  ${summaryLine(t)}  (404s are K-T3)`);
  return { checked: results.length, dead, broken, unknown: results.filter((r) => r.outcome === "unknown"), results };
}

async function run() {
  if (!/^\d{4}-\d{2}$/.test(MONTH)) {
    console.error("Usage: --month YYYY-MM (reads reports/gsc/<YYYY-MM>/)");
    process.exit(2);
  }
  const dir = path.join("reports", "gsc", MONTH);
  if (!existsSync(dir)) {
    console.error(`No export at ${dir}. Put the Performance export (.zip or CSVs) there.`);
    process.exit(2);
  }
  const config = JSON.parse(readFileSync("scripts/seo/gsc-rules.json", "utf8")) as { rules: RuleSet; kpis: KpiConfig[] };
  const data = readExport(loadFiles(dir));
  if (data.missing.length) console.log(`  missing from the export: ${data.missing.join(", ")}`);

  const prevPath = path.join("reports", "seo", `kpi-${previousMonth(MONTH)}.json`);
  const prev = existsSync(prevPath)
    ? (JSON.parse(readFileSync(prevPath, "utf8")) as { kpis: Kpi[] }).kpis
    : null;

  const kpis: Kpi[] = config.kpis.map((k) => {
    const value = computeKpi(k.definition, data, config.rules);
    return {
      id: k.id,
      label: k.label,
      value,
      shown: formatKpi(value, k.definition?.metric),
      previous: prev?.find((p) => p.id === k.id)?.shown ?? null,
    };
  });

  const live = CHECK_LIVE ? await checkLive((data.pages ?? []).map((r) => r.key)) : null;

  mkdirSync(path.join("reports", "seo"), { recursive: true });
  const base = path.join("reports", "seo", `kpi-${MONTH}`);
  writeFileSync(
    `${base}.json`,
    `${JSON.stringify({ month: MONTH, generatedAt: new Date().toISOString(), missing: data.missing, kpis, live }, null, 2)}\n`,
  );
  const md = [
    `# Search Console KPIs — ${MONTH}`,
    "",
    `Generated ${new Date().toISOString()} from \`${dir}\`. [UNKNOWN] means the KPI is not defined in \`scripts/seo/gsc-rules.json\` yet, or the export lacks its input — never zero.`,
    "",
    "| KPI | Label | This month | Previous month |",
    "|---|---|---:|---:|",
    ...kpis.map((k) => `| ${k.id} | ${k.label} | ${k.shown} | ${k.previous ?? "—"} |`),
    "",
    ...(live
      ? [
          "## Dead-URL monitor (--check-live)",
          "",
          `${live.checked} export page URL(s) outside the sitemaps checked; ${live.dead.length} answer 404 (K-T3), ${live.broken.length} failed with a 5xx, ${live.unknown.length} could not be checked.`,
          "",
          ...live.dead.map((r) => `- 404 ${decodeURIComponent(r.url)}`),
          ...live.broken.map((r) => `- 5xx ${decodeURIComponent(r.url)} — ${r.detail ?? ""}`),
          ...live.unknown.map((r) => `- unknown ${decodeURIComponent(r.url)} — ${r.detail ?? ""}`),
        ]
      : []),
  ].join("\n");
  writeFileSync(`${base}.md`, `${md}\n`);
  console.log(`\n  Wrote ${base}.json and ${base}.md\n`);
}

run().catch((err) => {
  console.error(`\n✖ ${(err as Error).message}\n`);
  process.exit(1);
});

export {};
