// lib/ai/evaluation.ts
// WHAT A BENCHMARK LABEL MEANS, and which metrics that label can carry. Pure —
// no I/O, no `server-only`, no database, so every rule that decides whether a
// question passed is unit-testable offline.
//
// WHY THIS MODULE EXISTS
// ──────────────────────
// AI Brain 2.0 left one metric short of its target — context quality, 75%
// against 90% — and its own final report says the gap "is largely a label
// artefact". That is a dangerous thing for a report to have to say: it means
// the instrument cannot tell a ranking defect from a label that was never
// exhaustive, and every future reading of that number inherits the ambiguity.
//
// The cause is one assumption, applied to every question alike: that
// `question.sources` names EVERY record which could legitimately answer it.
// For "what does this book say about validity" (the reader is inside one
// book) that is true by construction. For "what is validity?" it is not:
// the label is a RECALL LIST of six books built by scanning page text, while
// 10–47 books in the collection carry the topic. An answer drawing on an
// unlabelled-but-relevant book scored 17% context precision while being the
// better answer.
//
// So a label is no longer one shape. It carries an EVIDENCE SCOPE, and the
// scope decides which questions the label is entitled to answer:
//
//   scope             retrieval        context relevance     what a miss means
//   ─────────────────────────────────────────────────────────────────────────
//   exact_page        that page        pages named           wrong page
//   page_range        a page in span   pages in span         outside the span
//   single_document   that record      exhaustive            wrong document
//   multi_document    EVERY required   any required          a document missing
//   topic_unscoped    any labelled     NOT MEASURABLE        nothing
//   metadata          record in list   NOT APPLICABLE        wrong record
//   no_evidence       —                —                     answered at all
//
// THE RULE THAT KEEPS THIS HONEST. A scope may never be chosen per question
// to make a number better. `deriveEvidenceScope` is a pure function of fields
// the fixture ALREADY carries, in a fixed order, and the benchmark prints a
// census of what it derived — so a scope that flatters a question has to be
// argued for in the rule table, in the open, for every question the rule
// touches. v1's 123 questions are never edited; their scopes are derived.
//
// AND WHERE THE LABEL CANNOT BEAR THE WEIGHT, WE MEASURE SOMETHING ELSE.
// `topic_unscoped` context relevance is reported as null, not as 55%. In its
// place the evaluator judges the context by properties OF THE CONTEXT — what
// share of passages carry a real retrieval signal, how many are duplicates —
// which needs no label at all and cannot go stale as the collection grows.

/** What kind of evidence satisfies a question. See the table above. */
export type EvidenceScope =
  /** The question names a page: "what does page 50 say?" */
  | "exact_page"
  /** The question names a span: "explain the discussion in pages 40–50". */
  | "page_range"
  /** One record answers it, and the label names every record that could. */
  | "single_document"
  /** Several NAMED works must each contribute: "compare A and B". */
  | "multi_document"
  /** A topic the corpus covers broadly; the label is a recall list, not a set. */
  | "topic_unscoped"
  /** A catalogue fact. The evidence is a record, not a passage. */
  | "metadata"
  /** The collection cannot answer it; the refusal is the correct answer. */
  | "no_evidence";

export const EVIDENCE_SCOPES: readonly EvidenceScope[] = [
  "exact_page",
  "page_range",
  "single_document",
  "multi_document",
  "topic_unscoped",
  "metadata",
  "no_evidence",
];

/**
 * Categories whose questions NAME the works they compare, so every labelled
 * work is required rather than merely acceptable.
 *
 * This list is short on purpose. v1's `multi_document` category is NOT in it:
 * its questions are "Across the library's books, how is X handled?" with a
 * six-slug recall list and no work named anywhere in the question. Calling
 * that multi-document is the mislabel this module exists to correct — the
 * retrieval benchmark carries the same one, where the same category labels 20
 * questions against 12–34 documents each.
 */
const NAMED_WORK_CATEGORIES: ReadonlySet<string> = new Set([
  "comparison",
  "cross_book_synthesis",
]);

/**
 * At or above this many labelled records, a label is a RECALL LIST.
 *
 * Six is the cap v1's generator used for topic questions, and no question in
 * either fixture names five distinct works in its text. Below it, a label
 * small enough to have been chosen deliberately is treated as one.
 */
export const TOPIC_RECALL_MIN = 5;

/** The label side: what the fixture says about one question. */
export interface QuestionLabel {
  id: string;
  category: string;
  /** Stated by v2.1+ fixtures. v1 never states one; it is derived. */
  evidenceScope?: EvidenceScope;
  /** Record slugs the question is labelled against. */
  sources?: string[];
  /**
   * For `multi_document`: the works that must EACH contribute. Defaults to
   * `sources`, which is why a comparison's two slugs are both required.
   */
  requiredDocuments?: string[];
  /** Pages that satisfy the label, per slug — `exact_page`. */
  pages?: Record<string, number[]>;
  /** Inclusive span per slug — `page_range`. */
  pageRange?: Record<string, [number, number]>;
  /**
   * Claims the answer must make to be correct, as lowercase substrings.
   * The ONLY input to answer correctness, and deliberately not a model's
   * judgement: an LLM judge would put the thing under test in the jury.
   */
  requiredClaims?: string[];
  /** The reader is inside one record ("Ask this book"). */
  scoped?: boolean;
  /** A canned catalogue answer is the right outcome. */
  templateOk?: boolean;
  expectNoAnswer?: boolean;
  expectGrounded?: boolean;
  expectIntent?: string[];
}

/** One passage that reached the prompt, with the signals that ranked it. */
export interface ObservedPassage {
  slug: string;
  page: number;
  pageEnd?: number;
  /** Lexical agreement score from lib/ai/evidence.ts, when the lexical leg found it. */
  lexical?: number;
  /** Cosine similarity, when the semantic leg found it. */
  semantic?: number;
}

/** The observation side: what the run actually did. */
export interface AnswerObservation {
  intent: string;
  deterministic: boolean;
  answeredAsRefusal: boolean;
  answerNonEmpty: boolean;
  /** Lowercased answer text, for `requiredClaims`. */
  answerText: string;
  passages: readonly ObservedPassage[];
  /** Records the answer surfaced at all — catalogue results included. */
  resultSlugs: readonly string[];
  citedSlugs: readonly string[];
  groundedCitations: number;
  hallucinatedCitations: number;
  /** The record the entity resolver attached, when the question named a work. */
  resolvedEntitySlug: string | null;
  finishReason: string | null;
}

/**
 * Below this a passage carries no retrieval signal worth the prompt slot.
 * `lexical` counts terms (+10 for a whole phrase), so 1 is one ordinary word;
 * `semantic` is the chunk floor from lib/ai/retrieval.ts.
 */
const SIGNAL_FLOOR = { lexical: 1, semantic: 0.7 } as const;

/** One question's 2.1 scorecard. `null` means "this label cannot answer that". */
export interface AnswerEvaluation {
  scope: EvidenceScope;
  routingOk: boolean;
  /** The resolver attached the work the question named. Null when none was named. */
  entityOk: boolean | null;
  /** The evidence a correct answer needs was retrieved. */
  retrievalOk: boolean | null;
  /** Share of REQUIRED documents that contributed ≥ 1 passage. Multi-document only. */
  multiDocumentRecall: number | null;
  /** Share of passages drawn from a labelled record. Null where the label is a recall list. */
  contextRelevance: number | null;
  /** Enough of the right evidence reached the prompt to answer at all. */
  contextSufficiency: boolean | null;
  /** Label-free: share of passages carrying a real lexical or semantic signal. */
  evidenceCoverage: number | null;
  /** Label-free: share carrying neither. */
  irrelevantContextRatio: number | null;
  /** Label-free: share that repeat a (record, page) already present. */
  duplicateContextRatio: number | null;
  groundedOk: boolean | null;
  /** Every citation the answer kept is real. False only when grounding deleted one. */
  citationOk: boolean;
  noAnswerOk: boolean | null;
  /** An answerable question was refused. */
  falseNoAnswer: boolean;
  /** An unanswerable question was answered. */
  unsupportedAnswer: boolean;
  /** Evidence was retrieved and none of it came from a required record. */
  wrongDocument: boolean;
  /** The right record, at a page the label excludes. Page-scoped labels only. */
  wrongPage: boolean;
  /** `requiredClaims` all present. Null when the label states none. */
  answerCorrect: boolean | null;
}

/**
 * Which scope a question's label carries, from fields the fixture already has.
 *
 * ORDERED, and the order is the argument. Each rule is a fact about the
 * QUESTION, never about how it scored.
 */
export function deriveEvidenceScope(q: QuestionLabel): EvidenceScope {
  // 0. A fixture that states its own scope is believed. v1 never does, which
  //    is what keeps v1 reproducible while this file changes.
  if (q.evidenceScope) return q.evidenceScope;

  // 1. The honest answer is "we don't hold that". No evidence can satisfy it,
  //    so no evidence metric applies — checked first for exactly that reason.
  if (q.expectNoAnswer) return "no_evidence";

  // 2. A page span named by the label, then a page named by the label. Only a
  //    fixture that took the trouble to record pages can carry these.
  if (q.pageRange && Object.keys(q.pageRange).length > 0) return "page_range";
  if (q.pages && Object.keys(q.pages).length > 0) return "exact_page";

  // 3. The reader is inside one record. The label is exhaustive by
  //    construction: a passage from another book is not weaker, it is wrong.
  if (q.scoped) return "single_document";

  // 4. A catalogue fact — a byline, a shelf check, an APA reference, an FAQ.
  //    Passages are not the evidence and precision over them means nothing.
  if (q.templateOk) return "metadata";

  const sources = q.sources ?? [];

  // 5. The question NAMES its works and needs all of them. Only categories
  //    whose questions actually do so — see NAMED_WORK_CATEGORIES.
  if (NAMED_WORK_CATEGORIES.has(q.category) && sources.length >= 2) return "multi_document";

  // 6. A label this wide was generated by scanning the corpus, not chosen. It
  //    is a recall list: good evidence outside it is still good evidence.
  if (sources.length >= TOPIC_RECALL_MIN) return "topic_unscoped";

  // 7. One or two records, deliberately chosen, with the reader outside them.
  if (sources.length >= 1) return "single_document";

  // 8. Nothing labelled at all — there is no set to be precise against.
  return "topic_unscoped";
}

/** The records that must EACH contribute, for a multi-document question. */
export function requiredDocuments(q: QuestionLabel, scope: EvidenceScope): string[] {
  if (scope !== "multi_document") return [];
  return q.requiredDocuments ?? q.sources ?? [];
}

function ratio(n: number, d: number): number | null {
  return d === 0 ? null : n / d;
}

/** Pages a passage covers: its page, or every page of a merged run. */
function passagePages(p: ObservedPassage): number[] {
  const end = p.pageEnd && p.pageEnd > p.page ? p.pageEnd : p.page;
  return Array.from({ length: end - p.page + 1 }, (_, i) => p.page + i);
}

function hasSignal(p: ObservedPassage): boolean {
  return (p.lexical ?? 0) >= SIGNAL_FLOOR.lexical || (p.semantic ?? 0) >= SIGNAL_FLOOR.semantic;
}

/** Every claim the label requires is present in the answer. Case-insensitive substrings. */
export function claimsSatisfied(answer: string, claims: readonly string[]): boolean {
  const text = answer.toLowerCase();
  return claims.every((c) => text.includes(c.toLowerCase()));
}

/**
 * Score one question under its scope.
 *
 * Every `null` in the result is a deliberate refusal to answer a question the
 * label cannot answer — it is excluded from aggregates rather than counted as
 * a zero, which is the single change that stops a recall list from reading as
 * a ranking defect.
 */
export function evaluateAnswer(q: QuestionLabel, o: AnswerObservation): AnswerEvaluation {
  const scope = deriveEvidenceScope(q);
  const sources = q.sources ?? [];
  const required = requiredDocuments(q, scope);
  const routingOk = (q.expectIntent ?? []).length === 0 || (q.expectIntent ?? []).includes(o.intent);

  // Which records the answer actually drew on. For a metadata question the
  // catalogue result list IS the answer, so results count; for an evidence
  // question only passages do — a book listed beside the answer was never in
  // the prompt and cannot make the context better or worse.
  const passageSlugs = [...new Set(o.passages.map((p) => p.slug))];
  const drawnOn = scope === "metadata" ? [...new Set([...o.resultSlugs, ...o.citedSlugs])] : passageSlugs;

  // ── Entity resolution ───────────────────────────────────────────────────
  // Only a question that named a work has an entity to resolve, and only a
  // label naming records can say whether the right one was resolved.
  const entityOk =
    o.resolvedEntitySlug === null ? null : sources.length === 0 ? null : sources.includes(o.resolvedEntitySlug);

  // ── Retrieval, per scope ────────────────────────────────────────────────
  let retrievalOk: boolean | null;
  let wrongPage = false;
  switch (scope) {
    case "no_evidence":
      retrievalOk = null;
      break;
    case "multi_document":
      // EVERY required work, not any of them. "Compare A and B" answered
      // wholly from A is not a comparison, and `some()` called it one.
      retrievalOk = required.length > 0 ? required.every((s) => drawnOn.includes(s)) : null;
      break;
    case "exact_page":
    case "page_range": {
      const want = pagesWanted(q, scope);
      const onRecord = o.passages.filter((p) => want.has(p.slug));
      retrievalOk = onRecord.some((p) => passagePages(p).some((n) => want.get(p.slug)!.has(n)));
      // The right book at a page the label excludes is a DIFFERENT failure
      // from the wrong book, and folding the two hid it for 98 questions.
      wrongPage = !retrievalOk && onRecord.length > 0;
      break;
    }
    default:
      retrievalOk = sources.length ? sources.some((s) => drawnOn.includes(s)) : null;
  }

  // ── Context ─────────────────────────────────────────────────────────────
  // Relevance is label-bound, so it is measured ONLY where the label is
  // exhaustive. This is the truth fix: `topic_unscoped` and `metadata` return
  // null instead of a number that describes the label rather than the answer.
  const relevanceBearing = scope === "single_document" || scope === "multi_document" || scope === "exact_page" || scope === "page_range";
  const contextRelevance =
    relevanceBearing && passageSlugs.length
      ? passageSlugs.filter((s) => sources.includes(s)).length / passageSlugs.length
      : null;

  let contextSufficiency: boolean | null;
  if (scope === "no_evidence" || scope === "metadata") contextSufficiency = null;
  else if (scope === "multi_document")
    contextSufficiency = required.length > 0 ? required.every((s) => passageSlugs.includes(s)) : null;
  else contextSufficiency = o.passages.length > 0 && retrievalOk !== false;

  // Label-FREE context quality. These need no fixture and cannot go stale as
  // the collection grows, which is what makes them the right instrument for
  // an unscoped topic.
  const evidential = scope === "metadata" || scope === "no_evidence" ? null : o.passages;
  const evidenceCoverage = evidential ? ratio(evidential.filter(hasSignal).length, evidential.length) : null;
  const irrelevantContextRatio =
    evidential ? ratio(evidential.filter((p) => !hasSignal(p)).length, evidential.length) : null;
  const seenPages = new Set<string>();
  let duplicates = 0;
  for (const p of evidential ?? []) {
    const key = `${p.slug}#${p.page}`;
    if (seenPages.has(key)) duplicates++;
    else seenPages.add(key);
  }
  const duplicateContextRatio = evidential ? ratio(duplicates, evidential.length) : null;

  // ── Answer contracts ────────────────────────────────────────────────────
  const groundedOk = q.expectGrounded ? o.groundedCitations > 0 : null;
  const citationOk = o.hallucinatedCitations === 0;
  const noAnswerOk = q.expectNoAnswer ? o.answeredAsRefusal && o.passages.length === 0 : null;
  const unsupportedAnswer = q.expectNoAnswer === true && !(o.answeredAsRefusal && o.passages.length === 0);
  const falseNoAnswer = q.expectNoAnswer !== true && o.answeredAsRefusal;
  const wrongDocument =
    scope !== "no_evidence" && scope !== "topic_unscoped" && drawnOn.length > 0 && retrievalOk === false;
  const answerCorrect = q.requiredClaims?.length ? claimsSatisfied(o.answerText, q.requiredClaims) : null;

  return {
    scope,
    routingOk,
    entityOk,
    retrievalOk,
    multiDocumentRecall:
      scope === "multi_document" && required.length
        ? required.filter((s) => drawnOn.includes(s)).length / required.length
        : null,
    contextRelevance,
    contextSufficiency,
    evidenceCoverage,
    irrelevantContextRatio,
    duplicateContextRatio,
    groundedOk,
    citationOk,
    noAnswerOk,
    falseNoAnswer,
    unsupportedAnswer,
    wrongDocument,
    wrongPage,
    answerCorrect,
  };
}

/** The pages each labelled record may be cited at, for a page-scoped question. */
function pagesWanted(q: QuestionLabel, scope: EvidenceScope): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  if (scope === "page_range" && q.pageRange) {
    for (const [slug, [from, to]] of Object.entries(q.pageRange)) {
      const set = new Set<number>();
      for (let n = from; n <= to; n++) set.add(n);
      out.set(slug, set);
    }
    return out;
  }
  for (const [slug, pages] of Object.entries(q.pages ?? {})) out.set(slug, new Set(pages));
  return out;
}

/** How many questions each scope claimed — printed by the benchmark so the derivation is auditable. */
export function scopeCensus(labels: readonly QuestionLabel[]): Record<EvidenceScope, number> {
  const out = Object.fromEntries(EVIDENCE_SCOPES.map((s) => [s, 0])) as Record<EvidenceScope, number>;
  for (const q of labels) out[deriveEvidenceScope(q)]++;
  return out;
}
