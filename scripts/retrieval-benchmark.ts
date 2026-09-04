// scripts/retrieval-benchmark.ts
//
//   npm run retrieval:benchmark
//   npm run retrieval:benchmark -- --category single_document --verbose
//   npm run retrieval:benchmark -- --compare scripts/retrieval-benchmark/results/baseline.json
//   npm run retrieval:benchmark -- --legacy      # the pre-2.0 vector-only path
//   npm run retrieval:benchmark -- --diagnose    # WHY each miss missed
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
//   Scope isolation  for a SCOPED question, every passage came from the
//                    record the question named. For "Ask this book", citing a
//                    different book is not a weaker answer, it is a wrong one,
//                    and this is the §26 guarantee. Reported over scoped
//                    questions only — see "off-label" below for why.
//   Off-label        for an UNSCOPED question, the share of answers that cited
//                    a record outside the labelled set. INFORMATIONAL, not a
//                    defect: the label set for "what does the literature say
//                    about sampling" is a recall list built by scanning page
//                    text, not an exhaustive list of every book that discusses
//                    it. Measured: a sampling question returned Qualitative
//                    Research and Evaluation Methods p.627 — plainly right,
//                    simply unlabelled. Folding this into one "record
//                    accuracy" number reported 19 label gaps as 19 leaks and
//                    buried the 10 real misses under them.
//   Source spread    distinct records per unscoped question. A research
//                    question answered from one book is a worse answer than
//                    the same question answered from three.
//   No-evidence      questions whose honest answer is "nothing": returning an
//                    adjacent page instead is a hallucination waiting to be
//                    written.
//   Citation         the reference is real and carries the record's own
//                    author and year.
//
// WHY A MISS MISSED (--diagnose)
// ──────────────────────────────
// A recall percentage names a number and no defect: sixteen misses can be one
// bug or six, and the difference decides whether the next change is a weight,
// a chunker, or a backfill nobody has finished running. With `--diagnose`
// every miss is put through `classifyFailure` (lib/ai/failure-class.ts) using
// facts this script can observe — is the expected page in `book_pages` at
// all, does its record have any `book_chunks`, which leg's candidate pool
// held it, did it survive fusion — and the run ends with a breakdown by cause
// and the remedy each one implies. It costs extra queries per miss, so it is
// opt-in.
//
// Requires database credentials (.env.local). Read-only.

import { config } from "dotenv";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

import {
  FAILURE_REMEDY,
  classifyFailure,
  refineChunkingMiss,
  tallyFailures,
  type FailureFacts,
  type RetrievalFailure,
} from "../lib/ai/failure-class";

/** The shape `retrieveEvidence({ debug: true })` reports each stage in. */
type PoolRef = { recordType: string; recordId: string; page: number };

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
  /** The question named one record to stay inside. */
  scoped: boolean;
  /** Any evidence at all was found. */
  answered: boolean;
  /** For expectNone questions: nothing was returned. */
  correctlyEmpty: boolean | null;
  /** For citation questions: a reference carrying the record's author + year. */
  citationOk: boolean | null;
  semanticAvailable: boolean;
  top: string[];
  /** Present only under --diagnose, and only for a question that missed. */
  failure?: RetrievalFailure;
  /** The observations the cause was decided from — so a claim can be checked. */
  failureFacts?: FailureFacts;
};

type Metrics = {
  n: number;
  /** Questions where a page was labelled to find — the recall denominator. */
  scoredN: number;
  recallAt5: number;
  recallAt10: number;
  top1: number;
  /**
   * Raw "no passage came from an unexpected record", over every question.
   * Kept unchanged so results committed before the split stay comparable;
   * `scopeIsolation` is the number to read.
   */
  recordAccuracy: number;
  /** Scoped questions that stayed inside their record. null when none. */
  scopeIsolation: number | null;
  /** Unscoped questions that cited only labelled records. Informational. */
  onLabel: number | null;
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
  /** Corpus facts the numbers above depend on — see `corpusState()`. */
  corpus?: CorpusState;
  /** Misses by cause. Present only under --diagnose. */
  failures?: { cause: RetrievalFailure; count: number }[];
  questions: Outcome[];
};

/**
 * What the collection actually holds, recorded beside every result.
 *
 * A retrieval score is a statement about a corpus, and this one moves: a run
 * taken while the embedding backfill is mid-flight measures a different
 * library than the run before it. Without these three numbers in the file,
 * two results are not comparable and nobody can tell that they are not.
 */
type CorpusState = {
  publishedBooks: number;
  recordsWithPages: number;
  recordsWithChunks: number;
};

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Slug → record id, for every slug the question set expects.
 *
 * Resolved in one pass rather than per question: the diagnosis needs record
 * ids to ask whether a page was extracted, and the same books are expected by
 * dozens of questions.
 */
async function resolveSlugs(db: any, slugs: readonly string[]) {
  const map = new Map<string, { recordType: string; recordId: string }>();
  for (const [table, type] of [
    ["books", "book"],
    ["research_reports", "research"],
    ["publications", "publication"],
  ] as const) {
    for (let i = 0; i < slugs.length; i += 200) {
      const { data } = await db.from(table).select("id, slug").in("slug", slugs.slice(i, i + 200));
      for (const row of (data ?? []) as { id: string; slug: string }[]) {
        if (!map.has(row.slug)) map.set(row.slug, { recordType: type, recordId: row.id });
      }
    }
  }
  return map;
}

async function corpusState(db: any): Promise<CorpusState> {
  const books = await db.from("books").select("*", { count: "exact", head: true }).eq("is_published", true);
  const distinct = async (table: string) => {
    const seen = new Set<string>();
    for (let from = 0; ; from += 1000) {
      const { data } = await db.from(table).select("record_type, record_id").range(from, from + 999);
      if (!data?.length) break;
      for (const r of data as { record_type: string; record_id: string }[]) {
        seen.add(`${r.record_type}:${r.record_id}`);
      }
      if (data.length < 1000) break;
    }
    return seen.size;
  };
  return {
    publishedBooks: books.count ?? 0,
    recordsWithPages: await distinct("book_pages"),
    recordsWithChunks: await distinct("book_chunks"),
  };
}

/**
 * Everything `classifyFailure` needs for one missed question.
 *
 * Each field is a query or a set lookup, never an inference — the inference
 * is the classifier's, and keeping the two apart is what lets the classifier
 * be unit-tested and this function be checked against the database by hand.
 */
async function gatherFacts(
  db: any,
  opts: {
    expected: { recordType: string; recordId: string; pages?: number[] }[];
    pools: { lexical: PoolRef[]; semantic: PoolRef[]; fused: PoolRef[] } | undefined;
    leaked: boolean;
    retrievalDisabled: boolean;
    semanticRan: boolean;
    lexicalRan: boolean;
    evidenceLimit: number;
    perResource: number;
    terms: string[];
  },
): Promise<{ facts: FailureFacts; cause: RetrievalFailure }> {
  const { expected, pools, terms } = opts;
  const wanted = (r: PoolRef) =>
    expected.some(
      (e) =>
        e.recordId === r.recordId &&
        (!e.pages || e.pages.length === 0 || e.pages.includes(r.page)),
    );

  const ids = expected.map((e) => e.recordId);
  const pagesWanted = expected.flatMap((e) => e.pages ?? []);

  // Is the labelled page extracted at all? With no page labelled, any page of
  // the record counts — the question only asked for the record.
  let pageIndexed = false;
  if (ids.length) {
    let q = db.from("book_pages").select("record_id, page_no").in("record_id", ids).limit(1);
    if (pagesWanted.length) q = q.in("page_no", pagesWanted.slice(0, 500));
    const { data } = await q;
    pageIndexed = Boolean(data?.length);
  }

  // Does any expected record carry vectors? Without one there is nothing for
  // the semantic leg to compare against, whatever the threshold says.
  let recordEmbedded = false;
  if (ids.length) {
    const { data } = await db.from("book_chunks").select("record_id").in("record_id", ids).limit(1);
    recordEmbedded = Boolean(data?.length);
  }

  const fusedIdx = pools ? pools.fused.findIndex(wanted) : -1;
  // Slots the per-record cap handed to OTHER records before this one's turn.
  let crowdedOut = false;
  if (pools && fusedIdx >= 0) {
    const used = new Map<string, number>();
    let admitted = 0;
    for (let i = 0; i < fusedIdx; i++) {
      const key = `${pools.fused[i].recordType}:${pools.fused[i].recordId}`;
      const n = used.get(key) ?? 0;
      if (n < opts.perResource) {
        used.set(key, n + 1);
        admitted++;
      }
    }
    crowdedOut = admitted >= opts.evidenceLimit;
  }

  const facts: FailureFacts = {
    leaked: opts.leaked,
    retrievalDisabled: opts.retrievalDisabled,
    pageIndexed,
    recordEmbedded,
    semanticRan: opts.semanticRan,
    lexicalRan: opts.lexicalRan,
    inLexicalPool: Boolean(pools?.lexical.some(wanted)),
    inSemanticPool: Boolean(pools?.semantic.some(wanted)),
    inFusedPool: fusedIdx >= 0,
    fusedRank: fusedIdx >= 0 ? fusedIdx + 1 : null,
    evidenceLimit: opts.evidenceLimit,
    crowdedOut,
  };

  let cause = classifyFailure(facts);

  // Chunking is only visible with both representations of the same page in
  // hand: the page carries the query's words and no chunk cut from it does.
  if ((cause === "RETRIEVAL_MISS" || cause === "SEMANTIC_MISS") && terms.length && pagesWanted.length) {
    const carries = (text: string) => {
      const t = text.toLowerCase();
      return terms.some((term) => t.includes(term));
    };
    const pageQ = await db
      .from("book_pages")
      .select("content")
      .in("record_id", ids)
      .in("page_no", pagesWanted.slice(0, 200))
      .limit(20);
    const chunkQ = await db
      .from("book_chunks")
      .select("content")
      .in("record_id", ids)
      .in("page_no", pagesWanted.slice(0, 200))
      .limit(60);
    const pageCarries = ((pageQ.data ?? []) as { content: string }[]).some((r) => carries(r.content ?? ""));
    const chunkCarries = ((chunkQ.data ?? []) as { content: string }[]).some((r) => carries(r.content ?? ""));
    cause = refineChunkingMiss(cause, pageCarries, chunkCarries);
  }

  return { facts, cause };
}

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
  const { EVIDENCE_LIMITS, queryTerms } = await import("../lib/ai/evidence");
  const { createServiceClient } = await import("../lib/supabase/server");

  const diagnose = has("diagnose");
  const db = createServiceClient();
  // Corpus facts go in every report: a retrieval score is a statement about a
  // collection, and this one changes as extraction and embedding land.
  const corpus = await corpusState(db);
  const slugIds = diagnose
    ? await resolveSlugs(db, [...new Set(questions.flatMap((q) => q.expect.map((e) => e.slug)))])
    : new Map<string, { recordType: string; recordId: string }>();

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
    let pools: { lexical: PoolRef[]; semantic: PoolRef[]; fused: PoolRef[] } | undefined;
    let effectiveMode: keyof typeof EVIDENCE_LIMITS = "hybrid";

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
      effectiveMode = mode === "lookup" ? (record ? "scoped" : "hybrid") : mode;
      const out = await retrieveEvidence({
        query: intent.query || q.question,
        mode: effectiveMode,
        scope: record ? { recordType: record.recordType, recordId: record.recordId } : undefined,
        debug: diagnose,
      });
      evidence = out.evidence.map((e) => ({
        recordId: e.recordId,
        page: e.page,
        url: e.url,
        matchType: e.matchType,
      }));
      candidates = out.candidateCount;
      semanticAvailable = out.semanticAvailable;
      pools = out.pools;
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

    // A question counts as failed when it had a page to find and did not find
    // it in the top 5, or when it wandered outside its scope. `no_evidence`
    // and `citation` questions are excluded: neither has a page to retrieve.
    const scorable = q.category !== "citation" && q.category !== "no_evidence";
    // Only a SCOPED question can leak: for an unscoped one, a record outside
    // the label set is an unlabelled hit, not a boundary crossing.
    const leaked = Boolean(q.scope) && !recordAccurate;
    const failed = scorable && (rank === null || rank > 5 || leaked);
    let failure: RetrievalFailure | undefined;
    let failureFacts: FailureFacts | undefined;
    if (diagnose && failed) {
      const limits = EVIDENCE_LIMITS[effectiveMode];
      const gathered = await gatherFacts(db, {
        expected: q.expect.flatMap((e) => {
          const id = slugIds.get(e.slug);
          return id ? [{ ...id, pages: e.pages }] : [];
        }),
        pools,
        leaked,
        retrievalDisabled: limits.evidence === 0,
        semanticRan: semanticAvailable,
        lexicalRan: (intent.query || q.question).trim().length >= 3,
        evidenceLimit: limits.evidence,
        perResource: limits.perResource,
        terms: queryTerms(intent.query || q.question),
      });
      failure = gathered.cause;
      failureFacts = gathered.facts;
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
      scoped: Boolean(q.scope),
      answered: evidence.length > 0,
      correctlyEmpty: q.expectNone ? evidence.length === 0 : null,
      citationOk,
      semanticAvailable,
      top: evidence.slice(0, 5).map((e) => `${slugOf(e.url)}#${e.page}`),
      failure,
      failureFacts,
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
    if (!n) return { n, scoredN: 0, recallAt5: 0, recallAt10: 0, top1: 0, recordAccuracy: 0, scopeIsolation: null, onLabel: null, answeredRate: 0, avgSourceSpread: 0, avgEvidence: 0, p50Ms: 0, p95Ms: 0 };
    // Recall is only meaningful where a page was labelled to find.
    const scored = rows.filter((r) => r.category !== "citation" && r.category !== "no_evidence");
    const scopedRows = rows.filter((r) => r.scoped);
    // Unscoped questions that retrieved something: an empty answer cites no
    // record and so is neither on-label nor off it.
    const openRows = rows.filter((r) => !r.scoped && r.answered);
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
      scopeIsolation: scopedRows.length
        ? scopedRows.filter((r) => r.recordAccurate).length / scopedRows.length
        : null,
      onLabel: openRows.length ? openRows.filter((r) => r.recordAccurate).length / openRows.length : null,
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
    corpus,
    failures: diagnose
      ? tallyFailures(outcomes.map((o) => o.failure).filter((f): f is RetrievalFailure => Boolean(f)))
      : undefined,
    questions: outcomes,
  };

  const baseline = flag("compare") ? (JSON.parse(readFileSync(flag("compare")!, "utf8")) as Report) : undefined;
  const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
  const delta = (a: number, b: number | undefined) => {
    if (b === undefined) return "";
    const d = (a - b) * 100;
    return Math.abs(d) < 0.5 ? " (=)" : ` (${d > 0 ? "+" : ""}${d.toFixed(0)}pp)`;
  };

  const header = ["category", "n", "R@5", "R@10", "top1", "isolation", "on-label", "answered", "spread", "ev", "p50", "p95"];
  const rows = [
    ...Object.entries(report.byCategory).map(([k, m]) => [k, m, baseline?.byCategory[k]] as const),
    ["ALL", report.overall, baseline?.overall] as const,
  ].map(([k, m, b]) => [
    k,
    String(m.n),
    m.scoredN ? pct(m.recallAt5) + delta(m.recallAt5, b?.recallAt5) : "—",
    m.scoredN ? pct(m.recallAt10) + delta(m.recallAt10, b?.recallAt10) : "—",
    m.scoredN ? pct(m.top1) + delta(m.top1, b?.top1) : "—",
    m.scopeIsolation === null ? "—" : pct(m.scopeIsolation) + delta(m.scopeIsolation, b?.scopeIsolation ?? undefined),
    m.onLabel === null ? "—" : pct(m.onLabel),
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

  // The corpus these numbers describe. Printed always, because a score read
  // without it is a score about an unknown collection — and this collection
  // changes while extraction and embedding run.
  console.log(
    `\ncorpus: ${corpus.publishedBooks} published books · ` +
      `${corpus.recordsWithPages} with extracted pages · ` +
      `${corpus.recordsWithChunks} with embedded chunks ` +
      `(${Math.round((corpus.recordsWithChunks / Math.max(1, corpus.recordsWithPages)) * 100)}% of extracted)`,
  );

  if (report.failures) {
    const total = report.failures.reduce((s, f) => s + f.count, 0);
    console.log(`\nfailure breakdown — ${total} miss${total === 1 ? "" : "es"}`);
    const w = Math.max(...report.failures.map((f) => f.cause.length));
    for (const f of report.failures) {
      console.log(`  ${f.cause.padEnd(w)}  ${String(f.count).padStart(3)}   ${FAILURE_REMEDY[f.cause]}`);
    }
    if (total === 0) console.log("  (none)");
  }

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
