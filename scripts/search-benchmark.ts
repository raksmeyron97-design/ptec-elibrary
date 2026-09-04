// scripts/search-benchmark.ts
//
//   npx tsx scripts/search-benchmark.ts                       # table + JSON file
//   npx tsx scripts/search-benchmark.ts --base http://host    # another server
//   npx tsx scripts/search-benchmark.ts --category typo       # one category
//   npx tsx scripts/search-benchmark.ts --verbose             # per-query rows
//   npx tsx scripts/search-benchmark.ts --compare baseline.json
//
// WHAT THIS MEASURES
// ──────────────────
// Retrieval quality of the public search route, `GET /api/search/native`,
// against a FIXED, hand-labelled query set (scripts/search-benchmark/queries.json)
// whose expected results are real published records. For every query it
// records the top-10 the route actually returned and computes, per category
// and overall: Recall@1 / @5 / @10, MRR, zero-result rate, fuzzy-fallback rate
// and client-measured p50 / p95 latency.
//
// It is a black-box HTTP client on purpose: no database access, no service
// key, no import of the route's internals — so the numbers describe what a
// visitor gets, and a refactor of the ranking code cannot make the benchmark
// drift with it. The User-Agent names a bot, so the route's analytics filter
// (`isLikelyBot`) keeps benchmark traffic out of `search_queries`.
//
// WHAT IT DOES NOT MEASURE
// ────────────────────────
// Answer quality of the AI assistant (see scripts/ai-benchmark.ts) and server
// time split (the route sets no timing header — latency here is wall-clock at
// the client, including the network).
//
// A `pdf_text` query counts as found when its record appears either in
// `results` or in `pageHits`: the route lists a page-text hit whose parent
// matched no metadata under "found inside", not among the ranked results.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

type Expect = { type: string; slug: string };
type Query = {
  id: string;
  category: string;
  q: string;
  expect: Expect[];
  note?: string;
};
type QuerySet = { version: number; collection: string; queries: Query[] };

type ResultRow = { type: string; ref: string; url: string; title: string };
type ApiResponse = {
  results?: ResultRow[];
  pageHits?: { recordType: string; url: string; title: string }[];
  counts?: { total?: number };
  fuzzy?: boolean;
  didYouMean?: string | null;
  error?: string;
};

type QueryOutcome = {
  id: string;
  category: string;
  q: string;
  status: number;
  latencyMs: number;
  total: number;
  fuzzy: boolean;
  /** 1-based rank of the first expected record among `results`, or null. */
  rank: number | null;
  /** 1-based rank among `pageHits`, or null. */
  pageHitRank: number | null;
  top: string[];
};

type Metrics = {
  n: number;
  recallAt1: number;
  recallAt5: number;
  recallAt10: number;
  mrr: number;
  zeroResultRate: number;
  fuzzyRate: number;
  p50Ms: number;
  p95Ms: number;
};

type Report = {
  generatedAt: string;
  base: string;
  collection: string;
  querySetVersion: number;
  overall: Metrics;
  byCategory: Record<string, Metrics>;
  queries: QueryOutcome[];
};

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const has = (name: string) => args.includes(`--${name}`);

const BASE = (flag("base") ?? process.env.SEARCH_BENCHMARK_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const ONLY = flag("category");
// The route allows 30 requests per minute per IP (RL_SEARCH_NATIVE_PER_MIN).
const DELAY_MS = Number(flag("delay") ?? 2_100);
const USER_AGENT = "ptec-search-benchmark/1.0 (bot; retrieval-quality run)";

function slugOfUrl(url: string): string {
  const clean = url.split("#")[0].split("?")[0];
  return decodeURIComponent(clean.split("/").filter(Boolean).pop() ?? "");
}

function typeOfUrl(url: string): string {
  const seg = url.split("/").filter(Boolean)[0] ?? "";
  return { books: "book", theses: "research", publications: "publication", catalogs: "catalog", paths: "learning_path", posts: "post" }[seg] ?? seg;
}

function matches(expect: Expect[], type: string, slug: string): boolean {
  return expect.some((e) => e.type === type && e.slug === slug);
}

async function runQuery(query: Query): Promise<QueryOutcome> {
  const url = `${BASE}/api/search/native?q=${encodeURIComponent(query.q)}`;
  const started = performance.now();
  let status = 0;
  let body: ApiResponse = {};
  try {
    const res = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "application/json" } });
    status = res.status;
    body = (await res.json()) as ApiResponse;
  } catch (err) {
    body = { error: err instanceof Error ? err.message : String(err) };
  }
  const latencyMs = performance.now() - started;

  const results = body.results ?? [];
  let rank: number | null = null;
  results.forEach((r, i) => {
    if (rank === null && matches(query.expect, r.type, r.ref ?? slugOfUrl(r.url))) rank = i + 1;
  });
  let pageHitRank: number | null = null;
  (body.pageHits ?? []).forEach((h, i) => {
    if (pageHitRank === null && matches(query.expect, typeOfUrl(h.url), slugOfUrl(h.url))) pageHitRank = i + 1;
  });

  return {
    id: query.id,
    category: query.category,
    q: query.q,
    status,
    latencyMs: Math.round(latencyMs),
    total: body.counts?.total ?? results.length,
    fuzzy: Boolean(body.fuzzy),
    rank,
    pageHitRank,
    top: results.slice(0, 10).map((r) => `${r.type}:${r.ref ?? slugOfUrl(r.url)}`),
  };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

/** A pdf_text query is found at the better of its two ranks. */
function effectiveRank(o: QueryOutcome): number | null {
  if (o.category !== "pdf_text") return o.rank;
  const ranks = [o.rank, o.pageHitRank].filter((r): r is number => r !== null);
  return ranks.length ? Math.min(...ranks) : null;
}

function metricsOf(rows: QueryOutcome[]): Metrics {
  const n = rows.length;
  if (n === 0) return { n, recallAt1: 0, recallAt5: 0, recallAt10: 0, mrr: 0, zeroResultRate: 0, fuzzyRate: 0, p50Ms: 0, p95Ms: 0 };
  const ranks = rows.map(effectiveRank);
  const within = (k: number) => ranks.filter((r) => r !== null && r <= k).length / n;
  const latencies = rows.map((r) => r.latencyMs);
  return {
    n,
    recallAt1: within(1),
    recallAt5: within(5),
    recallAt10: within(10),
    mrr: ranks.reduce((sum, r) => sum + (r ? 1 / r : 0), 0) / n,
    zeroResultRate: rows.filter((r) => r.total === 0 && r.pageHitRank === null).length / n,
    fuzzyRate: rows.filter((r) => r.fuzzy).length / n,
    p50Ms: percentile(latencies, 50),
    p95Ms: percentile(latencies, 95),
  };
}

const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
const delta = (a: number, b: number | undefined, asPct = true) => {
  if (b === undefined) return "";
  const d = a - b;
  if (Math.abs(d) < 1e-9) return " (=)";
  const s = asPct ? `${d > 0 ? "+" : ""}${(d * 100).toFixed(0)}pp` : `${d > 0 ? "+" : ""}${d.toFixed(0)}`;
  return ` (${s})`;
};

function printTable(report: Report, baseline?: Report) {
  const rows: [string, Metrics, Metrics | undefined][] = [
    ...Object.entries(report.byCategory).map(([k, m]) => [k, m, baseline?.byCategory[k]] as [string, Metrics, Metrics | undefined]),
    ["ALL", report.overall, baseline?.overall],
  ];
  const header = ["category", "n", "R@1", "R@5", "R@10", "MRR", "zero", "fuzzy", "p50", "p95"];
  const lines = rows.map(([k, m, b]) => [
    k,
    String(m.n),
    pct(m.recallAt1) + delta(m.recallAt1, b?.recallAt1),
    pct(m.recallAt5) + delta(m.recallAt5, b?.recallAt5),
    pct(m.recallAt10) + delta(m.recallAt10, b?.recallAt10),
    m.mrr.toFixed(2) + (b ? ` (${(m.mrr - b.mrr) >= 0 ? "+" : ""}${(m.mrr - b.mrr).toFixed(2)})` : ""),
    pct(m.zeroResultRate) + delta(m.zeroResultRate, b?.zeroResultRate),
    pct(m.fuzzyRate) + delta(m.fuzzyRate, b?.fuzzyRate),
    `${m.p50Ms}ms` + delta(m.p50Ms, b?.p50Ms, false),
    `${m.p95Ms}ms` + delta(m.p95Ms, b?.p95Ms, false),
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...lines.map((l) => l[i].length)));
  const fmt = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join("  ");
  console.log(`\nSearch benchmark — ${report.base} — ${report.collection} (query set v${report.querySetVersion})`);
  console.log(fmt(header));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const l of lines) console.log(fmt(l));
  if (baseline) console.log(`\nDeltas are against ${flag("compare")} (${baseline.generatedAt}).`);
}

async function main() {
  const setPath = join(here, "search-benchmark", "queries.json");
  const set = JSON.parse(readFileSync(setPath, "utf8")) as QuerySet;
  const queries = ONLY ? set.queries.filter((q) => q.category === ONLY) : set.queries;
  if (queries.length === 0) throw new Error(`No queries${ONLY ? ` in category ${ONLY}` : ""}.`);

  const outcomes: QueryOutcome[] = [];
  for (const query of queries) {
    const outcome = await runQuery(query);
    if (outcome.status === 429) {
      // The route is rate limited per IP; wait out the window and retry once.
      await new Promise((r) => setTimeout(r, 5_000));
      outcomes.push(await runQuery(query));
    } else {
      outcomes.push(outcome);
    }
    if (has("verbose")) {
      const o = outcomes[outcomes.length - 1];
      const r = effectiveRank(o);
      console.log(`${(r ? `#${r}` : "miss").padStart(5)}  ${o.latencyMs.toString().padStart(5)}ms  ${o.total.toString().padStart(3)}${o.fuzzy ? " fuzzy" : ""}  [${o.category}] ${o.q}`);
    }
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  const byCategory: Record<string, Metrics> = {};
  for (const cat of [...new Set(outcomes.map((o) => o.category))]) {
    byCategory[cat] = metricsOf(outcomes.filter((o) => o.category === cat));
  }
  const report: Report = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    collection: set.collection,
    querySetVersion: set.version,
    overall: metricsOf(outcomes),
    byCategory,
    queries: outcomes,
  };

  const failed = outcomes.filter((o) => o.status !== 200);
  if (failed.length) console.warn(`\n${failed.length} request(s) did not return 200:`, failed.map((f) => `${f.id}=${f.status}`).join(", "));

  const baseline = flag("compare") ? (JSON.parse(readFileSync(flag("compare")!, "utf8")) as Report) : undefined;
  printTable(report, baseline);

  const outDir = join(here, "search-benchmark", "results");
  mkdirSync(outDir, { recursive: true });
  const outPath = flag("out") ?? join(outDir, `${report.generatedAt.replace(/[:.]/g, "-")}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
