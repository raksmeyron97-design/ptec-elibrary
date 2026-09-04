// scripts/retrieval-benchmark.ts
//
//   npm run retrieval:benchmark
//   npm run retrieval:benchmark -- --category single_document --verbose
//   npm run retrieval:benchmark -- --compare scripts/retrieval-benchmark/results/baseline.json
//   npm run retrieval:benchmark -- --legacy      # the pre-2.0 vector-only path
//
// WHAT THIS MEASURES
// ──────────────────
// Whether retrieval finds the EVIDENCE an answer would need — not whether the
// prose that follows reads well. Every question in
// scripts/retrieval-benchmark/questions.json is labelled against real
// `book_pages` rows: the phrase asked about was verified to appear on the
// pages listed as correct.
//
// It calls `retrieveEvidence` directly rather than going through /api/ai,
// because the AI route requires a signed-in user and a model call, and the
// question here is only about retrieval. `server-only` is mapped to a stub by
// scripts/tsconfig.benchmark.json, exactly as vitest maps it — so this runs
// the real functions, not a copy that could drift.
//
// METRICS, and why each one exists
//   Recall@5 / @10   an expected (record, page) appears in the top 5 / 10.
//   Top-1 accuracy   the FIRST passage is one of them — what a short answer
//                    will actually quote.
//   Record accuracy  every passage came from an expected record. This is the
//                    scope check: for "Ask this book", citing a different
//                    book is not a weaker answer, it is a wrong one.
//   Source spread    distinct records per unscoped question. A research
//                    question answered from one book is a worse answer than
//                    the same question answered from three.
//   No-evidence      questions whose honest answer is "nothing": returning an
//                    adjacent page instead is a hallucination waiting to be
//                    written.
//   Citation         the reference is real and carries the record's own
//                    author and year.
//
// Requires database credentials (.env.local). Read-only.

import { config } from "dotenv";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

config({ path: ".env.local" });
config({ path: ".env" });

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const has = (name: string) => args.includes(`--${name}`);

type Expectation = { slug: string; pages?: number[] };
type Question = {
  id: string;
  category: string;
  question: string;
  scope?: { recordType: "book" | "research" | "publication"; slug: string };
  expect: Expectation[];
  expectNone?: boolean;
  note?: string;
};
type QuestionSet = { version: number; collection: string; questions: Question[] };

type Outcome = {
  id: string;
  category: string;
  question: string;
  latencyMs: number;
  mode: string;
  candidates: number;
  evidenceCount: number;
  sourceSpread: number;
  /** 1-based rank of the first expected (record, page), or null. */
  rank: number | null;
  /** No passage came from a record the question did not name. */
  recordAccurate: boolean;
  /** Any evidence at all was found. */
  answered: boolean;
  /** For expectNone questions: nothing was returned. */
  correctlyEmpty: boolean | null;
  /** For citation questions: a reference carrying the record's author + year. */
  citationOk: boolean | null;
  semanticAvailable: boolean;
  top: string[];
};

type Metrics = {
  n: number;
  /** Questions where a page was labelled to find — the recall denominator. */
  scoredN: number;
  recallAt5: number;
  recallAt10: number;
  top1: number;
  recordAccuracy: number;
  answeredRate: number;
  avgSourceSpread: number;
  avgEvidence: number;
  p50Ms: number;
  p95Ms: number;
};

type Report = {
  generatedAt: string;
  variant: "evidence" | "legacy";
  collection: string;
  overall: Metrics;
  byCategory: Record<string, Metrics>;
  noEvidenceCorrect: number;
  citationAccuracy: number;
  questions: Outcome[];
};

async function main() {
  const setPath = join(here, "retrieval-benchmark", "questions.json");
  const set = JSON.parse(readFileSync(setPath, "utf8")) as QuestionSet;
  const only = flag("category");
  const legacy = has("legacy");
  const questions = only ? set.questions.filter((q) => q.category === only) : set.questions;
  if (questions.length === 0) throw new Error(`No questions${only ? ` in ${only}` : ""}.`);

  // Imported here, after dotenv: the retrieval module reads env at module load.
  const { retrieveEvidence, resolveRecord } = await import("../lib/ai/retrieval");
  const { getCitationSource } = await import("../lib/ai/citation-source");
  const { retrievalModeFor } = await import("../lib/ai/plan");
  const { classifyIntent } = await import("../lib/ai/intent");

  const outcomes: Outcome[] = [];
  for (const q of questions) {
    const started = performance.now();
    const intent = classifyIntent(q.question, q.scope ? { slug: q.scope.slug, slugType: q.scope.recordType } : {});
    const mode = retrievalModeFor(intent);

    const record = q.scope ? await resolveRecord(q.scope.recordType, q.scope.slug) : null;
    let evidence: {
      recordId: string;
      page: number;
      url: string;
      matchType: string;
    }[] = [];
    let candidates = 0;
    let semanticAvailable = false;

    if (q.category === "citation") {
      // Nothing to retrieve — the reference is assembled from metadata.
    } else if (legacy) {
      // The path as it was before this phase: corpus-wide (a scoped question
      // could not express its scope) and vector-only. Reproduced by dropping
      // the scope and keeping only semantic passages, so the comparison shows
      // what the lexical leg and scoping actually buy. When embeddings are
      // unavailable — a daily quota, an unembedded collection — this path has
      // nothing at all, which is the point.
      const out = await retrieveEvidence({ query: intent.query || q.question, mode: "hybrid" });
      evidence = out.evidence
        .filter((e) => e.matchType === "semantic")
        .map((e) => ({ recordId: e.recordId, page: e.page, url: e.url, matchType: e.matchType }));
      candidates = out.candidateCount;
      semanticAvailable = out.semanticAvailable;
    } else {
      const out = await retrieveEvidence({
        query: intent.query || q.question,
        mode: mode === "lookup" ? (record ? "scoped" : "hybrid") : mode,
        scope: record ? { recordType: record.recordType, recordId: record.recordId } : undefined,
      });
      evidence = out.evidence.map((e) => ({
        recordId: e.recordId,
        page: e.page,
        url: e.url,
        matchType: e.matchType,
      }));
      candidates = out.candidateCount;
      semanticAvailable = out.semanticAvailable;
    }
    const latencyMs = performance.now() - started;

    // Expectations are labelled by slug; evidence carries record ids, so the
    // slug is read back out of the URL the evidence links to.
    const slugOf = (url: string) => decodeURIComponent(url.split("?")[0].split("/").filter(Boolean).pop() ?? "");
    const expected = new Map(q.expect.map((e) => [e.slug, e.pages]));
    let rank: number | null = null;
    evidence.forEach((e, i) => {
      if (rank !== null) return;
      const slug = slugOf(e.url);
      if (!expected.has(slug)) return;
      const pages = expected.get(slug);
      if (!pages || pages.length === 0 || pages.includes(e.page)) rank = i + 1;
    });

    // Leakage, not coverage: citing a record the question did not name is a
    // wrong answer, while citing nothing is an absent one. They are different
    // failures and are counted separately (`answered` below), because a
    // scoped question that declines is safe and one that wanders is not.
    const recordAccurate =
      q.category === "citation" ? true : evidence.every((e) => expected.has(slugOf(e.url)));

    let citationOk: boolean | null = null;
    if (q.category === "citation" && record) {
      const source = await getCitationSource(record.recordType, record.recordId);
      const [author, year] = (q.note ?? "|").split("|");
      const surname = author.split(/\s+/).pop() ?? "";
      citationOk = Boolean(
        source?.reference &&
          (!surname || source.reference.includes(surname)) &&
          (!year || source.reference.includes(year)),
      );
    }

    outcomes.push({
      id: q.id,
      category: q.category,
      question: q.question,
      latencyMs: Math.round(latencyMs),
      mode,
      candidates,
      evidenceCount: evidence.length,
      sourceSpread: new Set(evidence.map((e) => e.recordId || slugOf(e.url))).size,
      rank,
      recordAccurate,
      answered: evidence.length > 0,
      correctlyEmpty: q.expectNone ? evidence.length === 0 : null,
      citationOk,
      semanticAvailable,
      top: evidence.slice(0, 5).map((e) => `${slugOf(e.url)}#${e.page}`),
    });

    if (has("verbose")) {
      const o = outcomes[outcomes.length - 1];
      const mark = q.expectNone ? (o.correctlyEmpty ? "empty✓" : "leak ✗") : o.rank ? `#${o.rank}` : "miss";
      console.log(`${mark.padStart(6)} ${String(o.latencyMs).padStart(5)}ms ev=${o.evidenceCount} src=${o.sourceSpread} [${o.category}] ${o.question.slice(0, 62)}`);
    }
  }

  const percentile = (values: number[], p: number) => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
  };

  const metricsOf = (rows: Outcome[]): Metrics => {
    const n = rows.length;
    if (!n) return { n, scoredN: 0, recallAt5: 0, recallAt10: 0, top1: 0, recordAccuracy: 0, answeredRate: 0, avgSourceSpread: 0, avgEvidence: 0, p50Ms: 0, p95Ms: 0 };
    // Recall is only meaningful where a page was labelled to find.
    const scored = rows.filter((r) => r.category !== "citation" && r.category !== "no_evidence");
    const within = (k: number) =>
      scored.length ? scored.filter((r) => r.rank !== null && r.rank <= k).length / scored.length : 0;
    const latencies = rows.map((r) => r.latencyMs);
    return {
      n,
      scoredN: scored.length,
      recallAt5: within(5),
      recallAt10: within(10),
      top1: scored.length ? scored.filter((r) => r.rank === 1).length / scored.length : 0,
      recordAccuracy: rows.filter((r) => r.recordAccurate).length / n,
      answeredRate: rows.filter((r) => r.answered).length / n,
      avgSourceSpread: rows.reduce((s, r) => s + r.sourceSpread, 0) / n,
      avgEvidence: rows.reduce((s, r) => s + r.evidenceCount, 0) / n,
      p50Ms: percentile(latencies, 50),
      p95Ms: percentile(latencies, 95),
    };
  };

  const byCategory: Record<string, Metrics> = {};
  for (const cat of [...new Set(outcomes.map((o) => o.category))]) {
    byCategory[cat] = metricsOf(outcomes.filter((o) => o.category === cat));
  }
  const noEvidenceRows = outcomes.filter((o) => o.correctlyEmpty !== null);
  const citationRows = outcomes.filter((o) => o.citationOk !== null);

  const report: Report = {
    generatedAt: new Date().toISOString(),
    variant: legacy ? "legacy" : "evidence",
    collection: set.collection,
    overall: metricsOf(outcomes),
    byCategory,
    noEvidenceCorrect: noEvidenceRows.length ? noEvidenceRows.filter((o) => o.correctlyEmpty).length / noEvidenceRows.length : 0,
    citationAccuracy: citationRows.length ? citationRows.filter((o) => o.citationOk).length / citationRows.length : 0,
    questions: outcomes,
  };

  const baseline = flag("compare") ? (JSON.parse(readFileSync(flag("compare")!, "utf8")) as Report) : undefined;
  const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
  const delta = (a: number, b: number | undefined) => {
    if (b === undefined) return "";
    const d = (a - b) * 100;
    return Math.abs(d) < 0.5 ? " (=)" : ` (${d > 0 ? "+" : ""}${d.toFixed(0)}pp)`;
  };

  const header = ["category", "n", "R@5", "R@10", "top1", "no-leak", "answered", "spread", "ev", "p50", "p95"];
  const rows = [
    ...Object.entries(report.byCategory).map(([k, m]) => [k, m, baseline?.byCategory[k]] as const),
    ["ALL", report.overall, baseline?.overall] as const,
  ].map(([k, m, b]) => [
    k,
    String(m.n),
    m.scoredN ? pct(m.recallAt5) + delta(m.recallAt5, b?.recallAt5) : "—",
    m.scoredN ? pct(m.recallAt10) + delta(m.recallAt10, b?.recallAt10) : "—",
    m.scoredN ? pct(m.top1) + delta(m.top1, b?.top1) : "—",
    pct(m.recordAccuracy) + delta(m.recordAccuracy, b?.recordAccuracy),
    pct(m.answeredRate) + delta(m.answeredRate, b?.answeredRate),
    m.avgSourceSpread.toFixed(1),
    m.avgEvidence.toFixed(1),
    `${m.p50Ms}ms`,
    `${m.p95Ms}ms`,
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const fmt = (cells: readonly string[]) => cells.map((c, i) => c.padEnd(widths[i])).join("  ");
  console.log(`\nRetrieval benchmark — ${report.variant} — ${report.collection}`);
  console.log(fmt(header));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const r of rows) console.log(fmt(r));
  console.log(`\nno-evidence handled correctly: ${pct(report.noEvidenceCorrect)}${delta(report.noEvidenceCorrect, baseline?.noEvidenceCorrect)}`);
  console.log(`citation accuracy:             ${pct(report.citationAccuracy)}${delta(report.citationAccuracy, baseline?.citationAccuracy)}`);

  const outDir = join(here, "retrieval-benchmark", "results");
  mkdirSync(outDir, { recursive: true });
  const outPath = flag("out") ?? join(outDir, `${report.generatedAt.replace(/[:.]/g, "-")}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
