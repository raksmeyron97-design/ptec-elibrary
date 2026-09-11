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
import type { AITrace } from "../lib/ai/trace";

config({ path: ".env.local" });
config({ path: ".env" });

const ARGV = process.argv.slice(2);
const has = (f: string) => ARGV.includes(f);
const valueOf = (f: string) => {
  const i = ARGV.indexOf(f);
  return i >= 0 ? ARGV[i + 1] : undefined;
};

const LIVE = has("--live");
const VERBOSE = has("--verbose");
const JSON_OUT = has("--json");
const ONLY = valueOf("--category");
/** Which fixture: `v1` (the original 123, the permanent baseline), `v2` (the edge-case suite), or `all`. */
const SUITE = valueOf("--suite") ?? "v1";
/** Comma-separated question ids — a small, deliberate set for a --live run. */
const IDS = valueOf("--ids")?.split(",").map((s) => s.trim()).filter(Boolean);
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

async function main() {
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

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
