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
//
// A LABEL HAS A SCOPE, AND THE SCOPE DECIDES WHICH METRICS IT MAY ANSWER
// ─────────────────────────────────────────────────────────────────────
// The work, identifier and person labels here were written against 270
// published books. Production held 1,916 on 2026-09-19, and the difference is
// not evenly distributed: it lands almost entirely on the TOPICAL queries,
// whose labels list a handful of correct records out of hundreds.
//
//   `គណិតវិទ្យា` scored MISS with 484 results. The top four books were
//   "គណិតវិទ្យា ថ្នាក់ទី៧ មេរៀនទី៨", "គណិតវិទ្យា ថ្នាក់ទី៩",
//   "គណិតវិទ្យាថ្នាក់ទី_១១" and "គណិតវិទ្យា_ថ្នាក់ទី៨" — four maths textbooks
//   answering a query for maths, none of them on a list written when the
//   library was a seventh of its present size.
//
// Reported as "subject R@5 = 42%", that sends somebody to fix a ranker that is
// working. So a label now carries a SCOPE, derived from the fixture rather
// than chosen per query — fewer than five expected records is an enumeration
// a cataloguer could complete (`exhaustive`); five or more is a sample of a
// set the collection has outgrown (`partial`) — and:
//
//   * a metric a label cannot bear is NULL and leaves the denominator, never
//     a zero. Recall and MRR are reported over the exhaustive labels only,
//     and the census is printed so the split can never be quietly moved.
//   * a partial-label query is judged instead by a LABEL-FREE property of the
//     results themselves — do the records returned actually carry the query's
//     terms? — which needs no fixture and cannot go stale.
//
// The `negative` category reads the same measure the other way: those queries
// name subjects the collection provably does not hold, so every returned row
// that carries no query term is a row presented with nothing to justify it.
// It is the only category here that measures PRECISION, and it exists because
// a suite where every query has an answer cannot see a system that answers
// everything.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

type Expect = { type: string; slug: string };
/** What a label can be held to. Derived — never written in the fixture. */
type LabelScope = "exhaustive" | "partial" | "negative";
type Query = {
  id: string;
  category: string;
  q: string;
  expect: Expect[];
  note?: string;
};
type QuerySet = { version: number; collection: string; queries: Query[] };

type ResultRow = {
  type: string;
  ref: string;
  url: string;
  title: string;
  author?: string | null;
  subject?: string | null;
  category?: string | null;
  keywords?: string[];
  excerpt?: string | null;
};
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
  /** What this query's label may be held to. */
  scope: LabelScope;
  /**
   * Share of the returned rows that carry at least one query term in their
   * own text. LABEL-FREE — computed from the response, so it cannot go stale
   * as the collection grows. `null` when nothing was returned.
   */
  topicalPrecision: number | null;
  top: string[];
};

type Metrics = {
  n: number;
  /** Queries in `n` whose label is exhaustive — the recall denominator. */
  labelled: number;
  /** `null` when no query here carries a label recall can be measured against. */
  recallAt1: number | null;
  recallAt5: number | null;
  recallAt10: number | null;
  mrr: number | null;
  /** Label-free; `null` when every query returned nothing. */
  topicalPrecision: number | null;
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
/** Ask for the type-scoped page (10 rows) so ranks 5..10 are measurable. */
const DEPTH = process.argv.includes("--depth");
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

/**
 * How many labelled records make a label a SAMPLE rather than an enumeration.
 *
 * Derived from the fixture and applied uniformly, so a scope can never be
 * picked per query to flatter a number — the same rule, and the same reason,
 * as the evidence scopes in lib/ai/evaluation.ts. Four or fewer records is a
 * list a cataloguer could have completed; five or more, against a collection
 * that has grown sevenfold since the labels were written, is a handful of the
 * correct answers rather than all of them.
 */
const EXHAUSTIVE_LABEL_MAX = 4;

function scopeOf(query: Query): LabelScope {
  if (query.category === "negative") return "negative";
  return query.expect.length > EXHAUSTIVE_LABEL_MAX ? "partial" : "exhaustive";
}

/**
 * Comparison form and word-boundary test, implemented HERE rather than
 * imported from lib/search/normalize.
 *
 * This file is a black-box client on purpose. The rule it is measuring —
 * "a Latin term must begin a word, a Khmer term may match anywhere" — is the
 * change under test, so importing the implementation would make a bug in it
 * invisible to the instrument watching for one.
 */
function foldText(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}\p{M}]+/gu, " ").trim();
}

function carriesTerm(haystack: string, term: string): boolean {
  if (!term || !haystack) return false;
  const at = haystack.indexOf(term);
  if (at === -1) return false;
  if (/[ក-៿]/.test(term)) return true;
  return at === 0 || haystack.includes(` ${term}`);
}

/** Digits, an X check character and the separators people type. */
const ISBN_SHAPE = /^[\d០-៩xX\s.-]+$/;

/**
 * Share of the returned rows that carry at least one of the query's terms in
 * their own text.
 *
 * Measured over the WHOLE blended page, all types, not over books alone: the
 * landing view returns four rows per type, and a row from a type that matched
 * weakly is part of what the reader is shown. So a value below 100% on a
 * specific-title query is not a defect — it is how much of that page is about
 * the query.
 *
 * On a `partial` label this is the metric that replaces recall: it asks
 * whether the results are ABOUT the query, which needs no fixture. On a
 * `negative` query it is read the other way — every row that carries nothing
 * is a row the system presented with no reason.
 */
function topicalPrecisionOf(query: Query, rows: ResultRow[]): number | null {
  if (rows.length === 0) return null;
  // An ISBN query is answered by IDENTITY, not by text: the digits are not in
  // the title and a correct result carries none of them. Scoring it here
  // would report the one category that is 100% correct as 0% relevant.
  if (ISBN_SHAPE.test(query.q.trim())) return null;
  const terms = Array.from(
    new Set([foldText(query.q), ...foldText(query.q).split(" ")].filter((t) => t.length >= 2)),
  );
  const carrying = rows.filter((r) => {
    const text = foldText(
      [r.title, r.author, r.subject, r.category, (r.keywords ?? []).join(" "), r.excerpt]
        .filter(Boolean)
        .join(" "),
    );
    return terms.some((t) => carriesTerm(text, t));
  });
  return carrying.length / rows.length;
}

async function runQuery(query: Query): Promise<QueryOutcome> {
  // WHY --depth EXISTS
  // ──────────────────
  // The blended view (no `type=`) returns PAGE_SIZE_ALL = 4 results PER TYPE,
  // while `counts` reports the whole candidate pool. Measured against
  // production at 270 books: `ទស្សនវិជ្ជា` reports counts.book = 18 and
  // returns 4 rows. So in the default mode a rank of 5..10 is not merely
  // unlikely, it is unrepresentable — and "Recall@10 = 83%" was really
  // "Recall@4 = 83%" wearing a larger number's name.
  //
  // `--depth` asks for the type-scoped view (PAGE_SIZE_TYPE = 10) of the
  // expected record's own type, which is the page a visitor lands on the
  // moment they click that type's tab. Both modes are honest about a
  // different surface, so both are kept: default = the blended landing view,
  // --depth = ranking quality to position 10.
  //
  // `pdf_text` is not scoped, even under --depth. Its expected record
  // surfaces in `pageHits` ("found inside"), and the type-scoped branch of
  // the route USED to answer `pageHits: []` — scoping the category then
  // scored R@1 17% / R@5 50% against a collection where the blended view
  // scores 100%, an artefact of the request rather than of the ranking.
  //
  // The route now returns page hits on the page-bearing type tabs (page 1),
  // so scoping this category is no longer wrong — but the default `--base`
  // is production, and this exclusion is what keeps the suite honest against
  // a deployment that predates that change. Drop it once the change is live
  // everywhere this benchmark is pointed at.
  const scopedType =
    DEPTH && query.category !== "pdf_text" ? query.expect[0]?.type : undefined;
  const url =
    `${BASE}/api/search/native?q=${encodeURIComponent(query.q)}` +
    (scopedType ? `&type=${encodeURIComponent(scopedType)}` : "");
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
    scope: scopeOf(query),
    topicalPrecision: topicalPrecisionOf(query, results),
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

const EMPTY_METRICS: Metrics = {
  n: 0, labelled: 0, recallAt1: null, recallAt5: null, recallAt10: null, mrr: null,
  topicalPrecision: null, zeroResultRate: 0, fuzzyRate: 0, p50Ms: 0, p95Ms: 0,
};

function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
}

function metricsOf(rows: QueryOutcome[]): Metrics {
  const n = rows.length;
  if (n === 0) return { ...EMPTY_METRICS };

  // Recall is answered ONLY by the labels that can bear it. A partial label
  // lists a handful of the correct records out of hundreds, so a miss against
  // it says nothing about the ranker; scoring it as 0 would put a number the
  // fixture cannot support into the same column as one it can.
  const scored = rows.filter((r) => r.scope === "exhaustive");
  const ranks = scored.map(effectiveRank);
  const within = (k: number) =>
    scored.length === 0 ? null : ranks.filter((r) => r !== null && r <= k).length / scored.length;
  const latencies = rows.map((r) => r.latencyMs);
  return {
    n,
    labelled: scored.length,
    recallAt1: within(1),
    recallAt5: within(5),
    recallAt10: within(10),
    mrr:
      scored.length === 0
        ? null
        : ranks.reduce<number>((sum, r) => sum + (r ? 1 / r : 0), 0) / scored.length,
    topicalPrecision: mean(
      rows.map((r) => r.topicalPrecision).filter((p): p is number => p !== null),
    ),
    zeroResultRate: rows.filter((r) => r.total === 0 && r.pageHitRank === null).length / n,
    fuzzyRate: rows.filter((r) => r.fuzzy).length / n,
    p50Ms: percentile(latencies, 50),
    p95Ms: percentile(latencies, 95),
  };
}

// A metric a label cannot bear prints as "—", never as 0%. The two mean
// opposite things and a table that renders them identically is how "42% of
// subject queries fail" got read three times as a ranking defect.
const NA = "—";
const pct = (v: number | null) => (v === null ? NA : `${(v * 100).toFixed(0)}%`);
const delta = (a: number | null, b: number | null | undefined, asPct = true) => {
  if (a === null || b === null || b === undefined) return "";
  const d = a - b;
  if (Math.abs(d) < 1e-9) return " (=)";
  const s = asPct ? `${d > 0 ? "+" : ""}${(d * 100).toFixed(0)}pp` : `${d > 0 ? "+" : ""}${d.toFixed(0)}`;
  return ` (${s})`;
};
const num = (v: number | null, b: number | null | undefined) => {
  if (v === null) return NA;
  const base = v.toFixed(2);
  if (b === null || b === undefined) return base;
  return `${base} (${v - b >= 0 ? "+" : ""}${(v - b).toFixed(2)})`;
};

function printTable(report: Report, baseline?: Report) {
  const rows: [string, Metrics, Metrics | undefined][] = [
    ...Object.entries(report.byCategory).map(([k, m]) => [k, m, baseline?.byCategory[k]] as [string, Metrics, Metrics | undefined]),
    ["ALL", report.overall, baseline?.overall],
  ];
  const header = ["category", "n", "lab", "R@1", "R@5", "R@10", "MRR", "topical", "zero", "fuzzy", "p50", "p95"];
  const lines = rows.map(([k, m, b]) => [
    k,
    String(m.n),
    String(m.labelled),
    pct(m.recallAt1) + delta(m.recallAt1, b?.recallAt1),
    pct(m.recallAt5) + delta(m.recallAt5, b?.recallAt5),
    pct(m.recallAt10) + delta(m.recallAt10, b?.recallAt10),
    num(m.mrr, b?.mrr),
    pct(m.topicalPrecision) + delta(m.topicalPrecision, b?.topicalPrecision),
    pct(m.zeroResultRate) + delta(m.zeroResultRate, b?.zeroResultRate),
    pct(m.fuzzyRate) + delta(m.fuzzyRate, b?.fuzzyRate),
    `${m.p50Ms}ms` + delta(m.p50Ms, b?.p50Ms, false),
    `${m.p95Ms}ms` + delta(m.p95Ms, b?.p95Ms, false),
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...lines.map((l) => l[i].length)));
  const fmt = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join("  ");
  console.log(`\nSearch benchmark — ${report.base} — ${report.collection} (query set v${report.querySetVersion})`);
  console.log(
    DEPTH
      ? "mode: --depth (type-scoped page, 10 rows) — R@5/R@10 are measurable"
      : "mode: blended landing view (4 rows per type) — ranks >4 are UNREPRESENTABLE; read R@5/R@10 as R@4",
  );
  console.log(fmt(header));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const l of lines) console.log(fmt(l));
  console.log(
    `\n"lab" is how many of the n queries carry a label recall can be measured against ` +
      `(fewer than ${EXHAUSTIVE_LABEL_MAX + 1} expected records). R@k and MRR are over those only; ` +
      `${NA} means the labels here cannot answer that metric and it is NOT a zero.`,
  );
  console.log(
    `"topical" is label-free: the share of returned rows carrying a query term in their own text. ` +
      `On the negative set — subjects the collection does not hold — a row carrying nothing is a row ` +
      `presented with no reason, so 1 - topical is the false-match rate.`,
  );
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
      const verdict = o.scope === "exhaustive" ? (r ? `#${r}` : "miss") : NA;
      const topical = o.topicalPrecision === null ? NA : `${Math.round(o.topicalPrecision * 100)}%`;
      console.log(
        `${verdict.padStart(5)}  top:${topical.padStart(4)}  ${o.latencyMs.toString().padStart(5)}ms  ` +
          `${o.total.toString().padStart(4)}${o.fuzzy ? " fuzzy" : ""}  [${o.category}] ${o.q}`,
      );
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
