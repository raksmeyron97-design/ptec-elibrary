// scripts/ai-answer-benchmark.ts
//
//   npm run ai:answer-benchmark             # offline: mock model, no billing
//   npm run ai:answer-benchmark -- --live   # real provider, for answer prose
//   npm run ai:answer-benchmark -- --verbose
//   npm run ai:answer-benchmark -- --category definition
//   npm run ai:answer-benchmark -- --compare scripts/ai-answer-benchmark/results/<file>.json
//   npm run ai:answer-benchmark -- --json
//
// WHAT THIS MEASURES, and why it is not one of the benchmarks that already exist
// ─────────────────────────────────────────────────────────────────────────────
// `scripts/ai-benchmark.ts` counts TOKENS for a routing decision, offline, from
// fixtures. `scripts/retrieval-benchmark.ts` measures whether RETRIEVAL finds
// the right pages. Neither one looks at the ANSWER: until this file there was
// no instrument that could say whether the assistant answers a reader's
// question well, which is exactly the complaint it exists to make measurable.
//
// It drives the real `runAssistant` — classify → retrieve → template-or-model →
// ground → cite — against the real corpus, and scores the seven properties an
// answer either has or does not:
//
//   routing        the question reached the intent that can answer it
//   retrieval      an expected source is among the evidence actually retrieved
//   context        the share of retrieved passages that came from an expected
//                  source (a prompt half-full of the wrong book is a bad prompt
//                  even when the right one is in it)
//   grounded       the answer carries at least one citation that survived
//                  `enforceGrounding` — i.e. a real (title, page) in the
//                  retrieval set
//   hallucination  citations the answer invented and grounding had to delete
//   no-answer      a question the collection provably cannot answer is refused
//                  rather than answered from an adjacent page
//   template rate  how often the reader gets a canned sentence instead of a
//                  synthesized answer. NOT a defect on its own — a byline and
//                  an APA reference SHOULD be templates — which is why it is
//                  reported per category and scored only where the label says
//                  a template is the wrong outcome (`unwanted template`).
//
// WHY THE MODEL IS MOCKED BY DEFAULT
// ──────────────────────────────────
// `lib/ai/mock-model.ts` answers strictly from the LIBRARY DATA block it was
// handed and cites in the exact form `enforceGrounding` verifies. Every metric
// above except answer prose is therefore measurable with no key, no billing and
// no run-to-run drift — so this can run on every change. `--live` swaps in the
// configured provider for the runs where the prose itself is the question.
//
// Retrieval reads the database, so this is not a hermetic unit test: point it
// at the environment whose answer quality you are asking about.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { config } from "dotenv";
import {
  diagnoseAnswer,
  modelReasoningAssessable,
  type AnswerDiagnosis,
} from "../lib/ai/answer-failure";
import {
  EVIDENCE_SCOPES,

  evaluateAnswer,
  scopeCensus,
  type AnswerEvaluation,
  type EvidenceScope,
  type ObservedPassage,
  type QuestionLabel,
} from "../lib/ai/evaluation";
import type { AITrace } from "../lib/ai/trace";

config({ path: ".env.local" });
config({ path: ".env" });

const ARGV = process.argv.slice(2);
const has = (f: string) => ARGV.includes(f);
const valueOf = (f: string) => {
  const i = ARGV.indexOf(f);
  return i >= 0 ? ARGV[i + 1] : undefined;
};

/**
 * A named LIVE suite (scripts/ai-answer-benchmark/live-suites.json): `smoke`
 * for the weekly run, `regression` after a change to the prompt, the output
 * budget, the citation parser or the provider.
 *
 * Naming the set rather than typing ids is what makes a live run reproducible
 * and its cost a number somebody chose. It implies `--live`.
 */
const LIVE_SUITE = valueOf("--live-suite");
/** Append one row of headline metrics to artifacts/ai-quality/<date>.json. */
const ARTIFACT = has("--artifact");
/** Fail the process on a HARD quality regression (see LIVE_GATES). */
const GATE = has("--gate");

const LIVE = has("--live") || Boolean(LIVE_SUITE);
const VERBOSE = has("--verbose");
const JSON_OUT = has("--json");
const ONLY = valueOf("--category");
/** Which fixture: `v1` (the original 123, the permanent baseline), `v2` (the edge-case suite), or `all`. */
const SUITE = valueOf("--suite") ?? "v1";
/** Comma-separated question ids — a small, deliberate set for a --live run. */
const EXPLICIT_IDS = valueOf("--ids")?.split(",").map((s) => s.trim()).filter(Boolean);
const SUITE_IDS = LIVE_SUITE
  ? ((): string[] => {
      const file = JSON.parse(
        readFileSync("scripts/ai-answer-benchmark/live-suites.json", "utf8"),
      ) as { suites: Record<string, { description: string; ids: string[] }> };
      const suite = file.suites[LIVE_SUITE];
      if (!suite) {
        throw new Error(
          `unknown live suite "${LIVE_SUITE}" — have ${Object.keys(file.suites).join(", ")}`,
        );
      }
      return suite.ids;
    })()
  : undefined;
const IDS = EXPLICIT_IDS ?? SUITE_IDS;
const COMPARE = valueOf("--compare");
const DIAGNOSE = has("--diagnose");
/** Write the human-readable failure matrix (every failing question, stage by stage) to this file. */
const MATRIX = valueOf("--matrix");

// The mock is opt-OUT: a benchmark that silently bills the provider on every
// local run is a benchmark nobody runs.
if (!LIVE) process.env.AI_MOCK_PROVIDER = "1";

interface Question {
  id: string;
  category: string;
  question: string;
  locale: "en" | "km";
  scope?: { recordType: "book"; slug: string };
  expectIntent: string[];
  sources?: string[];
  expectGrounded?: boolean;
  expectNoAnswer?: boolean;
  templateOk?: boolean;
  note?: string;
  // ── v2.1 label fields. v1 and v2 carry none of these; the evaluator derives
  // what it needs from the fields above, so both fixtures stay byte-identical.
  evidenceScope?: EvidenceScope;
  requiredDocuments?: string[];
  pages?: Record<string, number[]>;
  pageRange?: Record<string, [number, number]>;
  requiredClaims?: string[];
}

interface Row {
  id: string;
  category: string;
  question: string;
  intent: string;
  routingOk: boolean;
  deterministic: boolean;
  unwantedTemplate: boolean;
  evidenceCount: number;
  sourceCount: number;
  retrievalOk: boolean | null;
  contextPrecision: number | null;
  grounded: boolean | null;
  hallucinated: number;
  noAnswerOk: boolean | null;
  answerChars: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  answer: string;
  citedSlugs: string[];
  /** Every record the retrieved evidence came from, cited or not. */
  evidenceSlugs: string[];
  /** Slugs the question was labelled against, for the diagnostic trace. */
  expectedSlugs: string[];
  /** Which pipeline stage is responsible when this question failed. */
  diagnosis: AnswerDiagnosis | null;
  retrievalMode: string | null;
  /**
   * The full chain behind the answer (lib/ai/trace.ts): frame, topic,
   * entities, strategy, every selected passage with its ranking signals,
   * context size, citation judgement. This is the machine-readable failure
   * matrix — `--matrix <file.md>` renders the failing rows of it for people.
   */
  trace: AITrace | null;
  /** Where the answer came from: a template, or a generated reply. */
  answerClass: "template" | "generated" | "refusal" | "empty";
  /**
   * What the PROVIDER did, for a live run. Counts and enums only, exactly as
   * lib/ai/telemetry.ts's contract requires — no prompt, no key, no user.
   */
  live: {
    provider: string | null;
    model: string | null;
    /** "stop" is the only value that means the reader saw a whole answer. */
    finishReason: string | null;
    inputTokens: number;
    outputTokens: number;
    /** Reasoning tokens, when the provider reports them separately. */
    totalTokens: number;
    latencyMs: number;
    citations: { grounded: number; hallucinated: number; quoted: number; attached: number };
  } | null;
  /**
   * The 2.1 scorecard: every metric under the scope its LABEL can carry
   * (lib/ai/evaluation.ts). Reported beside the legacy columns rather than
   * instead of them, so v1's historical numbers stay reproducible from the
   * same run.
   */
  evaluation: AnswerEvaluation;
}

/** A refusal, in either language, from lib/ai/templates.ts or the model. */
const REFUSAL = [
  "could not find", "couldn't find", "couldn’t find", "did not find", "no evidence",
  "not enough indexed text", "i don't have", "i do not have", "no relevant passages",
  "រកមិនឃើញ", "មិនមានអត្ថបទ", "មិនគ្រប់គ្រាន់",
];
const isRefusal = (a: string) => {
  const t = a.toLowerCase();
  return REFUSAL.some((r) => t.includes(r));
};

function pct(n: number, d: number): string {
  return d === 0 ? "—" : `${Math.round((n / d) * 100)}%`;
}

function slugOfUrl(url: string | undefined): string {
  if (!url) return "";
  return url.split("?")[0].split("#")[0].split("/").filter(Boolean).pop() ?? "";
}

// ── Degraded-run detection ──────────────────────────────────────────────────
// A run during which the embedding provider was unreachable completes with
// exit 0 and a plausible table: measured 2026-09-11, ~25 consecutive `fetch
// failed` embeddings turned definition retrieval from 92% into 33% while the
// pipeline under test was unchanged. The retrieval layer logs each failure and
// carries on (by design — a request must degrade, not break), so the only way
// the benchmark can tell a degraded run from a regression is to count those
// log lines itself and refuse to present the numbers as comparable.
let embeddingFailures = 0;
const originalError = console.error;
console.error = (...args: unknown[]) => {
  const text = args.map(String).join(" ");
  if (/embedding failed|semantic chunks:|match_library:/.test(text)) embeddingFailures++;
  originalError(...args);
};

async function main(): Promise<number> {
  type Fixture = { generatedAt: string; corpusBooks: number; questions: Question[] };
  const load = (file: string) => JSON.parse(readFileSync(`scripts/ai-answer-benchmark/${file}`, "utf8")) as Fixture;
  const v1 = load("questions.json");
  // The original 123 are never edited; the v2 suite ADDS permanent edge cases
  // (typos, ISBNs, Khmer titles, named-source questions, concept comparisons,
  // ambiguity). `--suite all` runs both; the report names which ran.
  const fixture: Fixture =
    SUITE === "v2"
      ? load("questions-v2.json")
      : SUITE === "all"
        ? { ...v1, questions: [...v1.questions, ...load("questions-v2.json").questions] }
        : v1;

  const all = fixture.questions.filter(
    (q) => (!ONLY || q.category === ONLY) && (!IDS || IDS.includes(q.id)),
  );
  for (const q of all) fixtureIntents.set(q.id, q.expectIntent);

  // Imported late: these modules read process.env at load, and AI_MOCK_PROVIDER
  // has to be set before `lib/ai/models.ts` and the provider resolve.
  const { runAssistant } = await import("../lib/ai/router");
  const { resolveRecord } = await import("../lib/ai/retrieval");

  const rows: Row[] = [];

  for (const q of all) {
    // A scope in the fixture is a slug; the router takes it the way the UI
    // sends it, so the record only has to exist.
    let scopeOk = true;
    if (q.scope) scopeOk = Boolean(await resolveRecord(q.scope.recordType, q.scope.slug));

    const started = Date.now();
    let response: Awaited<ReturnType<typeof runAssistant>>["response"] | null = null;
    let telemetry: Awaited<ReturnType<typeof runAssistant>>["telemetry"] | null = null;
    let trace: AITrace | null = null;
    try {
      const result = await runAssistant({
        messages: [{ role: "user", text: q.question }],
        context: q.scope && scopeOk ? { slug: q.scope.slug, slugType: q.scope.recordType } : {},
        locale: q.locale,
      });
      response = result.response;
      telemetry = result.telemetry;
      trace = result.trace;
    } catch (err) {
      process.stderr.write(`  ! ${q.id} threw: ${err instanceof Error ? err.message : String(err)}\n`);
    }

    const answer = response?.answer ?? "";
    const sources = response?.sources ?? [];
    // A Source carries a url, not a slug; the slug is its last path segment.
    // (Reading a `slug` field that does not exist printed "(none cited)" for
    // every generated answer in the diagnostic trace.)
    const citedSlugs = [...new Set(sources.map((s) => slugOfUrl(s.url)).filter(Boolean))];
    const evidenceSlugs = [
      ...new Set(
        (response?.results ?? []).map((r) => (r as { slug?: string }).slug).filter(Boolean) as string[],
      ),
    ];
    const seen = new Set([...citedSlugs, ...evidenceSlugs]);

    const expected = q.sources ?? [];
    const retrievalOk = expected.length ? expected.some((s) => seen.has(s)) : null;
    const contextPrecision =
      expected.length && seen.size
        ? [...seen].filter((s) => expected.includes(s)).length / seen.size
        : null;

    const grounded = q.expectGrounded ? sources.length > 0 : null;
    const noAnswerOk = q.expectNoAnswer ? isRefusal(answer) && sources.length === 0 : null;
    const deterministic = telemetry?.deterministic ?? true;
    // A template is only wrong where the label says the reader needed a real
    // answer — a byline and an APA reference are templates on purpose.
    const unwantedTemplate = deterministic && !q.templateOk && !q.expectNoAnswer;

    const routingOk = q.expectIntent.includes(telemetry?.intent ?? "");
    const refusal = isRefusal(answer);
    const answerClass: Row["answerClass"] = !answer.trim()
      ? "empty"
      : refusal
        ? "refusal"
        : deterministic
          ? "template"
          : "generated";

    // ── The 2.1 scorecard ─────────────────────────────────────────────────
    // Built from the SAME observations the legacy columns use — nothing here
    // re-runs anything — but scored under the scope the label can carry.
    const label: QuestionLabel = {
      id: q.id,
      category: q.category,
      question: q.question,
      evidenceScope: q.evidenceScope,
      sources: q.sources,
      requiredDocuments: q.requiredDocuments,
      pages: q.pages,
      pageRange: q.pageRange,
      requiredClaims: q.requiredClaims,
      scoped: Boolean(q.scope),
      templateOk: q.templateOk,
      expectNoAnswer: q.expectNoAnswer,
      expectGrounded: q.expectGrounded,
      expectIntent: q.expectIntent,
    };
    const observedPassages: ObservedPassage[] = (trace?.evidence ?? []).map((e) => ({
      slug: slugOfUrl(e.url) || e.recordId,
      page: e.page,
      pageEnd: e.pageEnd,
      lexical: e.signals?.lexical,
      semantic: e.signals?.semantic,
    }));
    const evaluation = evaluateAnswer(label, {
      intent: telemetry?.intent ?? "error",
      deterministic,
      answeredAsRefusal: refusal,
      answerNonEmpty: answer.trim().length > 0,
      answerText: answer,
      passages: observedPassages,
      resultSlugs: evidenceSlugs,
      citedSlugs,
      groundedCitations: telemetry?.groundedCitations ?? sources.length,
      hallucinatedCitations: telemetry?.hallucinatedCitations ?? 0,
      resolvedEntitySlug: trace?.retrieval.entity?.slug ?? null,
      finishReason: telemetry?.finishReason ?? null,
    });

    // The classification is a function of what was MEASURED above — never of
    // the answer's prose, and never of which stage seems likeliest.
    const diagnosis = diagnoseAnswer({
      routingOk,
      retrievalDisabled: (telemetry?.retrievalMode ?? "lookup") === "lookup" && (telemetry?.evidenceCount ?? 0) === 0,
      deterministic,
      templateAcceptable: q.templateOk === true,
      expectNoAnswer: q.expectNoAnswer === true,
      answeredAsRefusal: refusal,
      evidenceCount: telemetry?.evidenceCount ?? 0,
      expectedSourceFound: retrievalOk !== false,
      entityResolved: evaluation.entityOk,
      answerCorrect: evaluation.answerCorrect,
      contextPrecision,
      // Only a question scoped to ONE record has an exhaustive label.
      expectedSourcesExhaustive: Boolean(q.scope),
      expectGrounded: q.expectGrounded === true,
      grounded: sources.length > 0,
      hallucinatedCitations: telemetry?.hallucinatedCitations ?? 0,
      answerNonEmpty: answer.trim().length > 0,
      modelAnswered: !deterministic && LIVE,
    });

    rows.push({
      id: q.id,
      category: q.category,
      question: q.question,
      intent: telemetry?.intent ?? "error",
      routingOk,
      deterministic,
      unwantedTemplate,
      evidenceCount: telemetry?.evidenceCount ?? 0,
      sourceCount: sources.length,
      retrievalOk,
      contextPrecision,
      grounded,
      hallucinated: telemetry?.hallucinatedCitations ?? 0,
      noAnswerOk,
      answerChars: answer.length,
      inputTokens: telemetry?.inputTokens ?? 0,
      outputTokens: telemetry?.outputTokens ?? 0,
      latencyMs: Date.now() - started,
      answer,
      citedSlugs,
      evidenceSlugs,
      expectedSlugs: expected,
      diagnosis,
      retrievalMode: telemetry?.retrievalMode ?? null,
      trace,
      answerClass,
      evaluation,
      live: LIVE
        ? {
            provider: telemetry?.provider ?? null,
            model: telemetry?.model ?? null,
            finishReason: telemetry?.finishReason ?? null,
            inputTokens: telemetry?.inputTokens ?? 0,
            outputTokens: telemetry?.outputTokens ?? 0,
            totalTokens: telemetry?.totalTokens ?? 0,
            latencyMs: telemetry?.latencyMs ?? 0,
            citations: {
              grounded: trace?.citations.grounded ?? 0,
              hallucinated: trace?.citations.hallucinated ?? 0,
              quoted: trace?.citations.quoted ?? 0,
              attached: trace?.citations.attached ?? 0,
            },
          }
        : null,
    });

    if (VERBOSE) {
      const r = rows[rows.length - 1];
      process.stdout.write(
        `\n${r.id} [${r.category}] ${r.routingOk ? "✓" : "✗"} intent=${r.intent}` +
          ` ev=${r.evidenceCount} src=${r.sourceCount} tmpl=${r.deterministic}\n  Q: ${q.question}\n  A: ${answer.slice(0, 200)}\n`,
      );
    } else if (rows.length % 10 === 0) {
      process.stderr.write(`  … ${rows.length}/${all.length}\n`);
    }
  }

  // ── Report ────────────────────────────────────────────────────────────────
  const cats = [...new Set(rows.map((r) => r.category))];
  const agg = (rs: Row[]) => {
    const rt = rs.filter((r) => r.retrievalOk !== null);
    const gr = rs.filter((r) => r.grounded !== null);
    const na = rs.filter((r) => r.noAnswerOk !== null);
    const cp = rs.filter((r) => r.contextPrecision !== null);
    return {
      n: rs.length,
      routing: pct(rs.filter((r) => r.routingOk).length, rs.length),
      retrieval: pct(rt.filter((r) => r.retrievalOk).length, rt.length),
      context: cp.length
        ? `${Math.round((cp.reduce((s, r) => s + (r.contextPrecision ?? 0), 0) / cp.length) * 100)}%`
        : "—",
      grounded: pct(gr.filter((r) => r.grounded).length, gr.length),
      noAnswer: pct(na.filter((r) => r.noAnswerOk).length, na.length),
      template: pct(rs.filter((r) => r.deterministic).length, rs.length),
      unwanted: rs.filter((r) => r.unwantedTemplate).length,
      halluc: rs.reduce((s, r) => s + r.hallucinated, 0),
      ev: (rs.reduce((s, r) => s + r.evidenceCount, 0) / rs.length).toFixed(1),
      tokIn: Math.round(rs.reduce((s, r) => s + r.inputTokens, 0) / rs.length),
      tokOut: Math.round(rs.reduce((s, r) => s + r.outputTokens, 0) / rs.length),
    };
  };

  const overall = agg(rows);
  const byCategory = Object.fromEntries(cats.map((c) => [c, agg(rows.filter((r) => r.category === c))]));

  // ── The 2.1 scorecard ─────────────────────────────────────────────────────
  // Every metric under the scope its label can carry, and every metric the
  // label cannot carry EXCLUDED rather than counted as a zero. That single
  // rule is what separates a ranking defect from a recall list.
  const evaluation21 = buildEvaluation(rows);
  const byScope = Object.fromEntries(
    EVIDENCE_SCOPES.filter((sc) => rows.some((r) => r.evaluation.scope === sc)).map((sc) => [
      sc,
      buildEvaluation(rows.filter((r) => r.evaluation.scope === sc)),
    ]),
  );
  const census = scopeCensus(all.map((q) => ({
    id: q.id,
    category: q.category,
    question: q.question,
    evidenceScope: q.evidenceScope,
    sources: q.sources,
    scoped: Boolean(q.scope),
    templateOk: q.templateOk,
    expectNoAnswer: q.expectNoAnswer,
  })));
  const latencies = rows.map((r) => r.latencyMs).sort((a, b) => a - b);
  const quantile = (q: number) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * q))] ?? 0;
  const report = {
    generatedAt: new Date().toISOString(),
    live: LIVE,
    suite: SUITE,
    corpus: `${fixture.corpusBooks} published books, labelled ${fixture.generatedAt.slice(0, 10)}`,
    /** Embedding/vector failures logged during the run. Non-zero = not comparable. */
    degraded: embeddingFailures,
    latency: { p50Ms: quantile(0.5), p95Ms: quantile(0.95) },
    overall,
    byCategory,
    /** AI Brain 2.1: the scope-aware scorecard. */
    evaluation21,
    byScope,
    scopeCensus: census,
    rows,
  };

  if (JSON_OUT) {
    console.log(JSON.stringify(report, null, 1));
  } else {
    if (embeddingFailures > 0) {
      console.log(
        `\n!! DEGRADED RUN: ${embeddingFailures} embedding/vector failure(s) were logged. The semantic leg was\n` +
          `!! missing for those questions, so these numbers describe the outage, not the pipeline.\n` +
          `!! Do not compare them against a baseline; re-run.`,
      );
    }
    console.log(
      `\nAI answer benchmark — ${LIVE ? "LIVE provider" : "mock model (offline)"} — suite ${SUITE} — ${rows.length} questions` +
        `\ncorpus fixture: ${fixture.corpusBooks} published books, labelled ${fixture.generatedAt.slice(0, 10)}\n`,
    );
    const head =
      "category         n   routing  retrieval  context  grounded  no-ans  template  unwanted  halluc  ev   tok-in";
    console.log(head);
    console.log("-".repeat(head.length));
    const line = (name: string, a: ReturnType<typeof agg>) =>
      console.log(
        `${name.padEnd(16)} ${String(a.n).padEnd(3)} ${a.routing.padEnd(8)} ${a.retrieval.padEnd(10)} ` +
          `${a.context.padEnd(8)} ${a.grounded.padEnd(9)} ${a.noAnswer.padEnd(7)} ${a.template.padEnd(9)} ` +
          `${String(a.unwanted).padEnd(9)} ${String(a.halluc).padEnd(7)} ${a.ev.padEnd(4)} ${a.tokIn}`,
      );
    for (const c of cats) line(c, byCategory[c]);
    console.log("-".repeat(head.length));
    line("ALL", overall);
    console.log(`\nlatency p50 ${report.latency.p50Ms} ms · p95 ${report.latency.p95Ms} ms · tok-out ${overall.tokOut}/question`);

    // ── AI Brain 2.1 ────────────────────────────────────────────────────────
    const show = (v: { n: number; value: number | null }) =>
      v.value === null ? "    n/a" : `${(v.value * 100).toFixed(0).padStart(4)}% (${v.n})`;
    const rate = (v: number) => `${(v * 100).toFixed(1).padStart(5)}%`;
    console.log(`\n${"─".repeat(78)}\nEVALUATION 2.1 — every metric under the scope its LABEL can carry\n${"─".repeat(78)}`);
    console.log(
      `scope census: ` +
        EVIDENCE_SCOPES.filter((sc) => census[sc] > 0).map((sc) => `${sc} ${census[sc]}`).join(" · "),
    );
    const e = evaluation21;
    console.log(
      `\n  routing              ${show(e.routing)}\n` +
        `  entity resolution    ${show(e.entityResolution)}\n` +
        `  retrieval            ${show(e.retrieval)}\n` +
        `  context sufficiency  ${show(e.contextSufficiency)}\n` +
        `  context relevance    ${show(e.contextRelevance)}   ← label-bound; unscoped topics excluded, not zeroed\n` +
        `  evidence coverage    ${show(e.evidenceCoverage)}   ← label-FREE: passages carrying a real signal\n` +
        `  irrelevant context   ${show(e.irrelevantContextRatio)}   ← label-free\n` +
        `  duplicate context    ${show(e.duplicateContextRatio)}   ← label-free\n` +
        `  multi-doc recall     ${show(e.multiDocumentRecall)}   ← share of REQUIRED works that contributed\n` +
        `  groundedness         ${show(e.groundedness)}\n` +
        `  citation correctness ${show(e.citationCorrectness)}\n` +
        `  answer correctness   ${show(e.answerCorrectness)}   ← requiredClaims only; null where unstated\n` +
        `  no-answer recall     ${show(e.noAnswerRecall)}\n` +
        `  false no-answer      ${rate(e.falseNoAnswerRate)}   ← answerable question refused\n` +
        `  unsupported answer   ${rate(e.unsupportedAnswerRate)}   ← unanswerable question answered\n` +
        `  wrong document       ${rate(e.wrongDocumentRate)}\n` +
        `  wrong page           ${rate(e.wrongPageRate)}\n` +
        `  finishReason ≠ stop  ${e.finishReasonFailures}`,
    );
    const head21 = "scope             n   routing  entity  retrieval  ctx-suff  ctx-rel  coverage  irrelev  grounded";
    console.log(`\n${head21}`);
    console.log("-".repeat(head21.length));
    for (const [sc, v] of Object.entries(byScope)) {
      console.log(
        `${sc.padEnd(17)} ${String(v.n).padEnd(3)} ${show(v.routing).padEnd(8)} ${show(v.entityResolution).padEnd(7)} ` +
          `${show(v.retrieval).padEnd(10)} ${show(v.contextSufficiency).padEnd(9)} ${show(v.contextRelevance).padEnd(8)} ` +
          `${show(v.evidenceCoverage).padEnd(9)} ${show(v.irrelevantContextRatio).padEnd(8)} ${show(v.groundedness)}`,
      );
    }
    const truncated = rows.filter((r) => r.trace?.outcome.finishReason === "length");
    if (truncated.length) {
      console.log(`\n!! ${truncated.length} answer(s) were CUT by the output cap (finishReason=length): ${truncated.map((r) => r.id).join(", ")}`);
    }

    const bad = rows.filter((r) => !r.routingOk);
    if (bad.length) {
      console.log(`\nrouting misses — ${bad.length}`);
      const grouped = new Map<string, number>();
      for (const r of bad) grouped.set(`${r.category}: → ${r.intent}`, (grouped.get(`${r.category}: → ${r.intent}`) ?? 0) + 1);
      for (const [k, v] of [...grouped].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
    }

    // ── Failure diagnosis (--diagnose) ──────────────────────────────────────
    const failures = rows.filter((r) => r.diagnosis !== null);
    if (failures.length) {
      const byStage = new Map<string, number>();
      for (const r of failures) {
        const k = `${r.diagnosis!.letter} — ${r.diagnosis!.stage}`;
        byStage.set(k, (byStage.get(k) ?? 0) + 1);
      }
      console.log(`\nfailure stages — ${failures.length} of ${rows.length} questions`);
      for (const [k, v] of [...byStage].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${String(v).padStart(3)}  ${k}`);
      }
      if (!modelReasoningAssessable(LIVE)) {
        // A zero that means "we did not look" must not read like a clean bill
        // of health. This is the §29 guard rail, printed rather than assumed.
        console.log(
          "  note: F — MODEL_REASONING is NOT ASSESSABLE in this run. No model reasoned about\n" +
            "        anything under the mock provider, so its absence here is not evidence that the\n" +
            "        model is fine. Re-run with --live to put that question to a model.",
        );
      }
    }

    if (DIAGNOSE) {
      console.log(`\n${"─".repeat(100)}\nPER-QUESTION TRACE — every failing case, stage by stage\n${"─".repeat(100)}`);
      for (const r of failures) {
        console.log(
          `\n[${r.diagnosis!.letter}] ${r.id}  (${r.category})\n` +
            `  question   ${r.question}\n` +
            `  routing    intent=${r.intent} ${r.routingOk ? "✓" : "✗ (expected another)"}  mode=${r.retrievalMode ?? "—"}\n` +
            `  retrieval  ${r.evidenceCount} passage(s), ${r.sourceCount} cited source(s)` +
            `${r.contextPrecision !== null ? `, context precision ${Math.round(r.contextPrecision * 100)}%` : ""}\n` +
            `  expected   ${r.expectedSlugs.length ? r.expectedSlugs.slice(0, 3).join(", ") : "(unlabelled)"}\n` +
            `  evidence   ${r.evidenceSlugs.length ? r.evidenceSlugs.slice(0, 4).join(", ") : "(none)"}\n` +
            `  cited      ${r.citedSlugs.length ? r.citedSlugs.slice(0, 3).join(", ") : "(none cited)"}\n` +
            `  answer     ${r.answerClass}, ${r.answerChars} chars, ${r.hallucinated} hallucinated citation(s)\n` +
            `  → ${r.diagnosis!.stage}: ${r.diagnosis!.reason}\n` +
            `  → fix in:  ${r.diagnosis!.remedy}\n` +
            `  answer text: ${r.answer.slice(0, 160).replace(/\s+/g, " ")}`,
        );
      }
    } else if (failures.length) {
      console.log("  (re-run with --diagnose for the per-question trace)");
    }

    const unwanted = rows.filter((r) => r.unwantedTemplate);
    if (unwanted.length) {
      console.log(`\nanswers that should have been synthesized but were templates — ${unwanted.length}`);
      for (const r of unwanted.slice(0, 12)) console.log(`  [${r.category}] ${r.question.slice(0, 78)}`);
      if (unwanted.length > 12) console.log(`  … and ${unwanted.length - 12} more`);
    }
  }

  // ── Live run: provider, cost, and the gates ───────────────────────────────
  const live = LIVE ? liveMetrics(rows, evaluation21) : null;
  let hardFailures: LiveGate[] = [];
  if (live && !JSON_OUT) {
    const models = [...new Set(rows.map((r) => r.live?.model).filter(Boolean))];
    const providers = [...new Set(rows.map((r) => r.live?.provider).filter(Boolean))];
    console.log(`\n${"─".repeat(78)}\nLIVE MODEL — ${LIVE_SUITE ? `suite ${LIVE_SUITE}` : "ad-hoc set"}\n${"─".repeat(78)}`);
    console.log(
      `provider ${providers.join(", ") || "—"} · model ${models.join(", ") || "—"} · ` +
        `${live.modelCalls} model call(s) of ${rows.length} question(s)\n` +
        `tokens: in ${live.inputTokens} · out ${live.outputTokens} · total ${live.totalTokens}` +
        `${live.modelCalls ? ` (${Math.round(live.totalTokens / live.modelCalls)}/call)` : ""}\n` +
        `model latency p50 ${live.latencyP50} ms · p95 ${live.latencyP95} ms\n` +
        `citations: ${live.groundedCitations} grounded · ${live.hallucinatedCitations} hallucinated`,
    );
    console.log("\ngates");
    for (const g of LIVE_GATES) {
      const bad = g.failed(live);
      console.log(
        `  ${bad ? (g.hard ? "HARD FAIL" : "warn     ") : "ok       "} ${g.id.padEnd(22)} ${g.describe}` +
          `${bad ? ` — ${g.actual(live)}` : ""}`,
      );
    }
    hardFailures = LIVE_GATES.filter((g) => g.hard && g.failed(live));
  }

  // ── Historical artifact (§22) ─────────────────────────────────────────────
  // Headline metrics only, one file per run, machine-readable. Never a prompt,
  // never an answer, never a key: a trend file that carries model output is a
  // trend file nobody can publish.
  if (ARTIFACT) {
    const dir = "artifacts/ai-quality";
    mkdirSync(dir, { recursive: true });
    const num = (v: number | null) => (v === null ? null : Number(v.toFixed(4)));
    const artifact = {
      date: new Date().toISOString().slice(0, 10),
      generatedAt: report.generatedAt,
      suite: SUITE,
      liveSuite: LIVE_SUITE ?? null,
      live: LIVE,
      degraded: embeddingFailures > 0,
      questions: rows.length,
      corpusBooks: fixture.corpusBooks,
      model: [...new Set(rows.map((r) => r.live?.model).filter(Boolean))].join(",") || null,
      provider: [...new Set(rows.map((r) => r.live?.provider).filter(Boolean))].join(",") || null,
      routing: num(evaluation21.routing.value),
      entityResolution: num(evaluation21.entityResolution.value),
      retrieval: num(evaluation21.retrieval.value),
      contextSufficiency: num(evaluation21.contextSufficiency.value),
      contextRelevance: num(evaluation21.contextRelevance.value),
      evidenceCoverage: num(evaluation21.evidenceCoverage.value),
      irrelevantContextRatio: num(evaluation21.irrelevantContextRatio.value),
      multiDocumentRecall: num(evaluation21.multiDocumentRecall.value),
      groundedness: num(evaluation21.groundedness.value),
      citationCorrectness: num(evaluation21.citationCorrectness.value),
      answerCorrectness: num(evaluation21.answerCorrectness.value),
      noAnswerRecall: num(evaluation21.noAnswerRecall.value),
      falseNoAnswerRate: num(evaluation21.falseNoAnswerRate),
      unsupportedAnswerRate: num(evaluation21.unsupportedAnswerRate),
      wrongDocumentRate: num(evaluation21.wrongDocumentRate),
      wrongPageRate: num(evaluation21.wrongPageRate),
      finishReasonFailures: evaluation21.finishReasonFailures,
      hallucinatedCitations: live?.hallucinatedCitations ?? 0,
      groundedCitations: live?.groundedCitations ?? 0,
      modelCalls: live?.modelCalls ?? 0,
      inputTokens: live?.inputTokens ?? 0,
      outputTokens: live?.outputTokens ?? 0,
      totalTokens: live?.totalTokens ?? 0,
      latencyP50Ms: report.latency.p50Ms,
      latencyP95Ms: report.latency.p95Ms,
      scopeCensus: census,
    };
    const stamp = report.generatedAt.replace(/[:.]/g, "-");
    const file = `${dir}/${artifact.date}${LIVE ? "-live" : ""}${LIVE_SUITE ? `-${LIVE_SUITE}` : ""}-${stamp.slice(11, 19)}.json`;
    writeFileSync(file, `${JSON.stringify(artifact, null, 1)}\n`);
    if (!JSON_OUT) console.log(`\nWrote ${file}`);
  }

  if (COMPARE) {
    const prev = JSON.parse(readFileSync(COMPARE, "utf8")) as { overall: typeof overall };
    console.log("\nvs baseline:");
    for (const k of ["routing", "retrieval", "context", "grounded", "noAnswer", "template"] as const) {
      console.log(`  ${k.padEnd(10)} ${String(prev.overall[k]).padStart(6)} → ${String(overall[k]).padStart(6)}`);
    }
  }

  if (MATRIX) {
    writeFileSync(MATRIX, renderFailureMatrix(rows, report.corpus, LIVE));
    if (!JSON_OUT) console.log(`Wrote failure matrix ${MATRIX}`);
  }

  mkdirSync("scripts/ai-answer-benchmark/results", { recursive: true });
  const path = `scripts/ai-answer-benchmark/results/${new Date().toISOString().replace(/[:.]/g, "-")}${SUITE !== "v1" ? `-${SUITE}` : ""}${LIVE ? "-live" : ""}${embeddingFailures ? "-DEGRADED" : ""}.json`;
  writeFileSync(path, JSON.stringify(report, null, 1));
  if (!JSON_OUT) console.log(`\nWrote ${path}`);

  // ── The exit code ─────────────────────────────────────────────────────────
  // `--gate` fails ONLY on a hard regression, and only on a run that is
  // comparable: a run whose embedding provider was unreachable describes the
  // outage, and failing a scheduled job on that would teach everybody to
  // ignore it. A degraded run is announced and passes.
  if (GATE && hardFailures.length && embeddingFailures === 0) {
    console.log(
      `\nHARD QUALITY REGRESSION — ${hardFailures.map((g) => g.id).join(", ")}.\n` +
        `See docs/AI-BRAIN-2-1-LIVE-MONITORING.md for what each gate means and what to do.`,
    );
    return 1;
  }
  if (GATE && embeddingFailures > 0) {
    console.log("\n--gate: the run was DEGRADED, so its numbers are not comparable. Not failing on them.");
  }
  return 0;
}

const ratioOf = (rs: Row[], pick: (e: AnswerEvaluation) => boolean | null) => {
  const scorable = rs.map((r) => pick(r.evaluation)).filter((v): v is boolean => v !== null);
  return { n: scorable.length, value: scorable.length ? scorable.filter(Boolean).length / scorable.length : null };
};
const meanOf = (rs: Row[], pick: (e: AnswerEvaluation) => number | null) => {
  const vals = rs.map((r) => pick(r.evaluation)).filter((v): v is number => v !== null);
  return { n: vals.length, value: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null };
};
/**
 * The 2.1 scorecard for a set of rows.
 *
 * Every metric under the scope its LABEL can carry, and every metric the
 * label cannot carry EXCLUDED — null, and out of the denominator — rather
 * than counted as a zero. That single rule is what separates a ranking defect
 * from a recall list, and it is why `n` travels beside each value: a number
 * over three questions and a number over ninety are not the same number.
 */
function buildEvaluation(rs: Row[]) {
  return {
    n: rs.length,
    routing: ratioOf(rs, (e) => e.routingOk),
    entityResolution: ratioOf(rs, (e) => e.entityOk),
    retrieval: ratioOf(rs, (e) => e.retrievalOk),
    contextSufficiency: ratioOf(rs, (e) => e.contextSufficiency),
    contextRelevance: meanOf(rs, (e) => e.contextRelevance),
    evidenceCoverage: meanOf(rs, (e) => e.evidenceCoverage),
    irrelevantContextRatio: meanOf(rs, (e) => e.irrelevantContextRatio),
    duplicateContextRatio: meanOf(rs, (e) => e.duplicateContextRatio),
    multiDocumentRecall: meanOf(rs, (e) => e.multiDocumentRecall),
    groundedness: ratioOf(rs, (e) => e.groundedOk),
    citationCorrectness: ratioOf(rs, (e) => e.citationOk),
    answerCorrectness: ratioOf(rs, (e) => e.answerCorrect),
    noAnswerRecall: ratioOf(rs, (e) => e.noAnswerOk),
    falseNoAnswerRate: rs.filter((r) => r.evaluation.falseNoAnswer).length / Math.max(rs.length, 1),
    unsupportedAnswerRate:
      rs.filter((r) => r.evaluation.unsupportedAnswer).length /
      Math.max(rs.filter((r) => r.evaluation.scope === "no_evidence").length, 1),
    wrongDocumentRate: rs.filter((r) => r.evaluation.wrongDocument).length / Math.max(rs.length, 1),
    wrongPageRate: rs.filter((r) => r.evaluation.wrongPage).length / Math.max(rs.length, 1),
    finishReasonFailures: rs.filter(
      (r) => r.trace?.outcome.finishReason && r.trace.outcome.finishReason !== "stop",
    ).length,
  };
}

/**
 * What a LIVE run may not do, and what merely warrants a look.
 *
 * THE SPLIT IS THE POINT (§23 of the AI Brain 2.1 brief). A real model's
 * wording moves run to run and a channel that pages somebody for that stops
 * being read within a month. So the HARD gates are all properties that are
 * either true or false regardless of phrasing — a citation the retrieval set
 * does not contain, an answer the output cap cut off, an unanswerable
 * question answered — and everything else is a warning with a number beside
 * it.
 *
 * `finishReason` is first because it is the defect AI Brain 2.0 found and
 * could not have found offline: Gemini charges thinking tokens against
 * `maxOutputTokens`, so every evidence answer was being cut after one
 * sentence while every mock metric stayed green. lib/ai/output-budget.test.ts
 * pins the arithmetic; only a live run can prove the provider still agrees
 * with it.
 */
interface LiveGate {
  id: string;
  hard: boolean;
  describe: string;
  /** True when the run VIOLATES the gate. */
  failed: (m: LiveMetrics) => boolean;
  actual: (m: LiveMetrics) => string;
}

interface LiveMetrics {
  modelCalls: number;
  finishReasonFailures: number;
  hallucinatedCitations: number;
  groundedCitations: number;
  unsupportedAnswers: number;
  wrongDocuments: number;
  /** Wrong-document answers that did NOT tell the reader anything was missing. */
  silentWrongDocuments: number;
  falseNoAnswers: number;
  groundedness: number | null;
  answerCorrectness: number | null;
  emptyAnswers: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyP50: number;
  latencyP95: number;
}

const LIVE_GATES: readonly LiveGate[] = [
  {
    id: "finish-reason",
    hard: true,
    describe: "every answer finished (finishReason=stop)",
    failed: (m) => m.finishReasonFailures > 0,
    actual: (m) => `${m.finishReasonFailures} answer(s) did not finish`,
  },
  {
    id: "hallucinated-citations",
    hard: true,
    describe: "no citation names a page the retrieval set does not contain",
    failed: (m) => m.hallucinatedCitations > 0,
    actual: (m) => `${m.hallucinatedCitations} hallucinated`,
  },
  {
    id: "unsupported-answers",
    hard: true,
    describe: "no unanswerable question was answered",
    failed: (m) => m.unsupportedAnswers > 0,
    actual: (m) => `${m.unsupportedAnswers} answered`,
  },
  {
    id: "wrong-document",
    hard: true,
    // SILENT is the operative word, and it was bought with a false alarm.
    //
    // The first live smoke run failed this gate on cmp-002, a comparison of
    // two works where one side had no indexed passages. The model's answer
    // opened "a full comparison is not possible because one of the sides is
    // missing from the passages" and then named what it did have. Retrieval
    // was genuinely incomplete — `multiDocumentRecall` 0.5, exactly what that
    // metric exists to catch — but the ANSWER was honest, and paging somebody
    // at 2 a.m. for a system correctly reporting its own gap is how a channel
    // stops being read (§23).
    //
    // So the hard gate is the dangerous case only: an answer built on the
    // wrong works that does NOT say so. The honest one is counted, reported,
    // and left to the weekly trend.
    describe: "no answer SILENTLY drew on works outside the ones its question required",
    failed: (m) => m.silentWrongDocuments > 0,
    actual: (m) =>
      `${m.silentWrongDocuments} silent of ${m.wrongDocuments} wrong-document answer(s)`,
  },
  {
    id: "empty-answers",
    hard: true,
    describe: "no model call returned nothing",
    failed: (m) => m.emptyAnswers > 0,
    actual: (m) => `${m.emptyAnswers} empty`,
  },
  {
    id: "groundedness",
    hard: false,
    describe: "≥ 95% of answers that owed a citation carry one",
    failed: (m) => m.groundedness !== null && m.groundedness < 0.95,
    actual: (m) => (m.groundedness === null ? "n/a" : `${(m.groundedness * 100).toFixed(0)}%`),
  },
  {
    id: "false-no-answer",
    hard: false,
    describe: "no answerable question was refused",
    failed: (m) => m.falseNoAnswers > 0,
    actual: (m) => `${m.falseNoAnswers} refused`,
  },
  {
    id: "answer-correctness",
    hard: false,
    describe: "every requiredClaim the labels state is present",
    failed: (m) => m.answerCorrectness !== null && m.answerCorrectness < 1,
    actual: (m) => (m.answerCorrectness === null ? "n/a" : `${(m.answerCorrectness * 100).toFixed(0)}%`),
  },
];

function liveMetrics(rows: readonly Row[], e: ReturnType<typeof buildEvaluation>): LiveMetrics {
  const model = rows.filter((r) => r.live && !r.deterministic);
  const lat = model.map((r) => r.live!.latencyMs).sort((a, b) => a - b);
  const q = (p: number) => lat[Math.min(lat.length - 1, Math.floor(lat.length * p))] ?? 0;
  return {
    modelCalls: model.length,
    finishReasonFailures: model.filter((r) => r.live!.finishReason && r.live!.finishReason !== "stop").length,
    hallucinatedCitations: rows.reduce((n, r) => n + (r.live?.citations.hallucinated ?? 0), 0),
    groundedCitations: rows.reduce((n, r) => n + (r.live?.citations.grounded ?? 0), 0),
    unsupportedAnswers: rows.filter((r) => r.evaluation.unsupportedAnswer).length,
    wrongDocuments: rows.filter((r) => r.evaluation.wrongDocument).length,
    silentWrongDocuments: rows.filter(
      (r) => r.evaluation.wrongDocument && r.answerClass !== "refusal" && r.answerChars > 0,
    ).length,
    falseNoAnswers: rows.filter((r) => r.evaluation.falseNoAnswer).length,
    groundedness: e.groundedness.value,
    answerCorrectness: e.answerCorrectness.value,
    emptyAnswers: model.filter((r) => r.answerChars === 0).length,
    inputTokens: rows.reduce((n, r) => n + (r.live?.inputTokens ?? 0), 0),
    outputTokens: rows.reduce((n, r) => n + (r.live?.outputTokens ?? 0), 0),
    totalTokens: rows.reduce((n, r) => n + (r.live?.totalTokens ?? 0), 0),
    latencyP50: q(0.5),
    latencyP95: q(0.95),
  };
}

/**
 * The failure matrix the brief asks for: for every failing question, the
 * whole chain — question, expected vs predicted intent, normalization,
 * entities, retrieval strategy and candidates, selected passages with their
 * scores, context size, policy, output, citations, expected evidence, the
 * stage, the root cause and the remedy. Rendered from the trace each row
 * already carries; nothing here is recomputed.
 */
function renderFailureMatrix(rows: Row[], corpus: string, live: boolean): string {
  const failing = rows.filter((r) => r.diagnosis !== null);
  const lines: string[] = [
    `# AI answer benchmark — failure matrix`,
    ``,
    `Generated ${new Date().toISOString()} · ${live ? "live provider" : "mock model"} · corpus: ${corpus} · ${failing.length} of ${rows.length} questions failing`,
    ``,
  ];
  if (!failing.length) lines.push("No failing questions.");
  for (const r of failing) {
    const t = r.trace;
    const d = r.diagnosis!;
    lines.push(`## [${d.letter}] ${r.id} — ${r.category}`);
    lines.push(``);
    lines.push(`| | |`);
    lines.push(`|---|---|`);
    lines.push(`| question | ${r.question} |`);
    lines.push(`| expected intent | ${(fixtureIntents.get(r.id) ?? []).join(" / ")} |`);
    lines.push(`| predicted intent | ${r.intent} (${r.routingOk ? "ok" : "MISS"}), confidence ${t?.routing.confidence ?? "—"} |`);
    lines.push(`| normalized query / topic | ${t?.question.topic ?? "—"} (frame: ${t?.question.frame ?? "—"}, language: ${t?.question.language ?? "—"}) |`);
    lines.push(`| entities detected | titles: ${(t?.question.titleCandidates ?? []).join("; ") || "—"}; isbn: ${(t?.question.isbnCandidates ?? []).join("; ") || "—"}; compare: ${(t?.question.compareTargets ?? []).join(" vs ") || "—"} |`);
    lines.push(`| retrieval strategy | ${t?.retrieval.strategy ?? "—"} (mode ${r.retrievalMode ?? "—"}), candidates ${t?.retrieval.candidateCount ?? 0}, semantic ${t?.retrieval.semanticAvailable ?? "—"}, entity ${t?.retrieval.entity ? `${t.retrieval.entity.slug} (${t.retrieval.entity.band})` : "—"} |`);
    lines.push(`| retrieved documents | ${r.evidenceSlugs.join(", ") || "—"} |`);
    lines.push(`| selected context | ${t?.context.passages ?? 0} passage(s), ${t?.context.works ?? 0} work(s), ${t?.context.facts ?? 0} fact(s), ~${t?.context.inputTokens ?? 0} input tokens |`);
    lines.push(`| prompt policy | locale ${t?.policy.locale ?? "—"}, verbosity ${t?.policy.verbosity ?? "—"}, evidence ${t?.policy.hasEvidence ? "yes" : "no"} |`);
    lines.push(`| model output | ${r.answerClass}, ${r.answerChars} chars — ${r.answer.slice(0, 200).replace(/\s+/g, " ").replace(/\|/g, "\\|")} |`);
    lines.push(`| citations | grounded ${t?.citations.grounded ?? 0}, hallucinated ${r.hallucinated}, quoted ${t?.citations.quoted ?? 0}, attached ${r.sourceCount} — ${r.citedSlugs.join(", ") || "—"} |`);
    lines.push(`| expected evidence | ${r.expectedSlugs.join(", ") || "(no source labelled)"} |`);
    lines.push(`| actual failure | ${d.reason} |`);
    lines.push(`| failure stage | ${d.letter} — ${d.stage} |`);
    lines.push(`| proposed fix | ${d.remedy} |`);
    lines.push(``);
    if (t?.evidence.length) {
      lines.push(`Ranked passages:`);
      lines.push(``);
      lines.push(`| # | record | page | match | score | signals |`);
      lines.push(`|---|---|---|---|---|---|`);
      t.evidence.forEach((e, i) => {
        const pages = e.pageEnd && e.pageEnd > e.page ? `${e.page}–${e.pageEnd}` : String(e.page);
        lines.push(`| ${i + 1} | ${e.title.replace(/\|/g, "\\|")} | ${pages} | ${e.matchType} | ${e.score.toFixed(4)} | ${JSON.stringify(e.signals ?? {})} |`);
      });
      lines.push(``);
    }
  }
  return lines.join("\n");
}

/** Expected intents by question id, for the matrix. Filled in main(). */
const fixtureIntents = new Map<string, string[]>();

main()
  .then((code) => process.exit(code ?? 0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
