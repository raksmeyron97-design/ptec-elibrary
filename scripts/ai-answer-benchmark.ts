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
const COMPARE = valueOf("--compare");

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

async function main() {
  const fixture = JSON.parse(
    readFileSync("scripts/ai-answer-benchmark/questions.json", "utf8"),
  ) as { generatedAt: string; corpusBooks: number; questions: Question[] };

  const all = fixture.questions.filter((q) => !ONLY || q.category === ONLY);

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
    try {
      const result = await runAssistant({
        messages: [{ role: "user", text: q.question }],
        context: q.scope && scopeOk ? { slug: q.scope.slug, slugType: q.scope.recordType } : {},
        locale: q.locale,
      });
      response = result.response;
      telemetry = result.telemetry;
    } catch (err) {
      process.stderr.write(`  ! ${q.id} threw: ${err instanceof Error ? err.message : String(err)}\n`);
    }

    const answer = response?.answer ?? "";
    const sources = response?.sources ?? [];
    const citedSlugs = [...new Set(sources.map((s) => (s as { slug?: string }).slug).filter(Boolean) as string[])];
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

    rows.push({
      id: q.id,
      category: q.category,
      question: q.question,
      intent: telemetry?.intent ?? "error",
      routingOk: q.expectIntent.includes(telemetry?.intent ?? ""),
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

  if (JSON_OUT) {
    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), live: LIVE, overall, byCategory, rows }, null, 1));
  } else {
    console.log(
      `\nAI answer benchmark — ${LIVE ? "LIVE provider" : "mock model (offline)"} — ${rows.length} questions` +
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

    const bad = rows.filter((r) => !r.routingOk);
    if (bad.length) {
      console.log(`\nrouting misses — ${bad.length}`);
      const grouped = new Map<string, number>();
      for (const r of bad) grouped.set(`${r.category}: → ${r.intent}`, (grouped.get(`${r.category}: → ${r.intent}`) ?? 0) + 1);
      for (const [k, v] of [...grouped].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
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

  mkdirSync("scripts/ai-answer-benchmark/results", { recursive: true });
  const path = `scripts/ai-answer-benchmark/results/${new Date().toISOString().replace(/[:.]/g, "-")}${LIVE ? "-live" : ""}.json`;
  writeFileSync(path, JSON.stringify({ generatedAt: new Date().toISOString(), live: LIVE, overall, byCategory, rows }, null, 1));
  if (!JSON_OUT) console.log(`\nWrote ${path}`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
