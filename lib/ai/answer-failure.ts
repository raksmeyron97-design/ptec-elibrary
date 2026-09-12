// lib/ai/answer-failure.ts
// WHICH STAGE failed, for one bad answer. Pure — no I/O, no `server-only`.
//
// The retrieval benchmark already answers "why did retrieval miss this page?"
// (`lib/ai/failure-class.ts`). This module answers the larger question the
// answer benchmark asks: of the ten stages a question passes through, which
// one is responsible for the reader getting a bad answer?
//
//   Question → intent → query → retrieval → ranking → context → prompt
//            → model → citations → answer
//
// WHY THIS IS A MODULE AND NOT A PARAGRAPH IN A REPORT
//
// "The AI isn't good enough" is not actionable and, measured, was not even
// true: every failure the Final Production Reliability Audit 2.0 found was in
// query understanding, retrieval, ranking or the prompt, and none was in the
// model. That conclusion is only trustworthy if the classification is a
// function of observable facts rather than of whoever read the transcript —
// so it is written down, ordered, and unit-tested.
//
// THE ORDER OF THE CHECKS IS THE DESIGN.
//
// A stage that makes every later stage impossible is reported instead of the
// stages it disabled. A question routed to an intent that retrieves nothing
// has no ranking to blame and no context to inspect; calling that a "context
// failure" sends someone to tune a chunker over a path that never ran.
//
// AND `MODEL_REASONING` IS DELIBERATELY THE LAST RESORT.
//
// It is reachable only when every upstream stage is positively verified
// correct — right intent, right evidence, clean context, a prompt that did not
// contradict itself, real citations. Anything less returns the upstream cause.
// This is the rule that stops "the model is bad" from being the default
// explanation for an unread pipeline, which is how a team ends up fine-tuning
// its way around a keyword table.

/** The failure taxonomy, in pipeline order. */
export type AnswerFailureStage =
  /** A — the question was understood as a different question. */
  | "QUERY_UNDERSTANDING"
  /**
   * B2 — the question named a work and the resolver attached a different one.
   *
   * Checked BEFORE retrieval because it decides what retrieval is pointed at:
   * a question answered thoroughly from the wrong book is not a recall gap,
   * and sending someone to tune a lexical floor over it wastes the trip. The
   * letter is "B2" rather than a renumbering because these letters appear in
   * shipped reports and a matrix somebody may be comparing against.
   */
  | "ENTITY_RESOLUTION"
  /** B — the right evidence exists in the corpus and was not retrieved. */
  | "RETRIEVAL"
  /** C — the right evidence was retrieved and lost its place in the ordering. */
  | "RANKING"
  /** D — evidence reached the prompt, but as the wrong passages. */
  | "CONTEXT"
  /** E — the instructions given alongside correct evidence were wrong for it. */
  | "PROMPT"
  /** F — everything upstream was correct and the answer still is not. */
  | "MODEL_REASONING"
  /** G — the answer is supported, but its citations are not usable. */
  | "CITATION"
  /** H — the answer cited something the retrieval set does not contain. */
  | "HALLUCINATION"
  /** I — "we don't have that" was owed and not given, or given wrongly. */
  | "NO_ANSWER_HANDLING";

export const FAILURE_LETTER: Record<AnswerFailureStage, string> = {
  QUERY_UNDERSTANDING: "A",
  ENTITY_RESOLUTION: "B2",
  RETRIEVAL: "B",
  RANKING: "C",
  CONTEXT: "D",
  PROMPT: "E",
  MODEL_REASONING: "F",
  CITATION: "G",
  HALLUCINATION: "H",
  NO_ANSWER_HANDLING: "I",
};

/**
 * What the benchmark OBSERVED about one question.
 *
 * Every field is a measurement the harness can make without judgement. The
 * judgement is this module's job, and keeping the split honest is what lets
 * the classification be argued with.
 */
export interface AnswerFacts {
  /** The intent the router chose is one the label accepts. */
  routingOk: boolean;
  /** The mode this intent uses retrieves no passages at all, by construction. */
  retrievalDisabled: boolean;
  /** A template answered; no model was called. */
  deterministic: boolean;
  /** The label says a template is the wrong outcome for this question. */
  templateAcceptable: boolean;
  /** The honest answer is "the library does not hold this". */
  expectNoAnswer: boolean;
  /** The answer reads as a refusal / "no evidence" response. */
  answeredAsRefusal: boolean;
  /** Passages that reached the prompt. */
  evidenceCount: number;
  /** At least one expected source is among the evidence. */
  expectedSourceFound: boolean;
  /**
   * The resolver attached the work the question NAMED. Null when the question
   * named none, or when the label cannot say which one was right.
   */
  entityResolved: boolean | null;
  /**
   * Every claim the label requires is present in the answer. Null when the
   * label states none — which is most questions, and why stage F stays rare
   * rather than becoming the default verdict for anything unexplained.
   */
  answerCorrect: boolean | null;
  /** Share of evidence drawn from an expected source, 0–1. Null when unlabelled. */
  contextPrecision: number | null;
  /**
   * Whether the label names EVERY source that could legitimately answer this
   * question — true only for a question SCOPED to one record.
   *
   * This distinction decides whether low context precision is a defect at all.
   * For "what does this book say about X" the label is exhaustive by
   * construction and a passage from another book is simply wrong. For "what
   * does the literature say about X" the label is a recall list built by
   * scanning page text, so an answer drawing on an unlabelled-but-relevant
   * book scores low precision while being a BETTER answer. Measured: all 14
   * context attributions in the first diagnostic run were unscoped questions,
   * four of them catalogue searches where returning five cards and the named
   * book among them is the correct behaviour.
   */
  expectedSourcesExhaustive: boolean;
  /** The label requires the answer to carry a verified citation. */
  expectGrounded: boolean;
  /** The answer carries at least one citation that survived grounding. */
  grounded: boolean;
  /** Citations the answer invented and grounding deleted. */
  hallucinatedCitations: number;
  /** The answer has any substance at all. */
  answerNonEmpty: boolean;
  /**
   * Whether a model actually produced this answer. False under the mock
   * provider and on every template path — and `MODEL_REASONING` is not
   * assessable when it is false, which the classifier enforces.
   */
  modelAnswered: boolean;
}

export interface AnswerDiagnosis {
  stage: AnswerFailureStage;
  letter: string;
  /** One sentence naming the evidence that decided it. */
  reason: string;
  /** What to change. Never "improve the model" unless the stage is F. */
  remedy: string;
}

/** Below this, the prompt was mostly passages from records the question did not name. */
const CONTEXT_PRECISION_FLOOR = 0.34;

/**
 * Diagnose one failing question, or return null when nothing failed.
 *
 * `null` is a real answer and is checked first: a question that routed
 * correctly, retrieved its evidence and produced a grounded answer has no
 * failure to attribute, and inventing one would put noise into the very
 * report that is supposed to rank the next piece of work.
 */
export function diagnoseAnswer(f: AnswerFacts): AnswerDiagnosis | null {
  const d = (stage: AnswerFailureStage, reason: string, remedy: string): AnswerDiagnosis => ({
    stage,
    letter: FAILURE_LETTER[stage],
    reason,
    remedy,
  });

  // ── I. The no-answer contract, first ────────────────────────────────────
  // A question the collection provably cannot answer is a different contract
  // from every other question, and getting it wrong in either direction is
  // the failure. Checked before routing because the honest refusal is correct
  // whichever intent produced it.
  if (f.expectNoAnswer) {
    if (!f.answeredAsRefusal || f.evidenceCount > 0) {
      return d(
        "NO_ANSWER_HANDLING",
        `the collection holds nothing on this subject, and the assistant answered anyway (${f.evidenceCount} passage(s))`,
        "raise the evidence floor so an incidental word match stops counting as evidence (lib/ai/evidence.ts minLexicalScore, CHUNK_MIN_SIMILARITY)",
      );
    }
    return null;
  }
  if (f.answeredAsRefusal && f.evidenceCount > 0) {
    return d(
      "PROMPT",
      "evidence reached the prompt and the answer still refused",
      "check the mode rider for this intent — an instruction that contradicts the evidence it is handed (lib/ai/prompts.ts)",
    );
  }

  // ── A. Query understanding ──────────────────────────────────────────────
  // Reported before anything downstream, because a question sent to the wrong
  // intent never reaches the stages that would otherwise be blamed.
  if (!f.routingOk) {
    return d(
      "QUERY_UNDERSTANDING",
      "the router chose an intent the question cannot be answered from",
      "the keyword tables in lib/ai/intent.ts — add the phrasing, or widen the frame-stripping",
    );
  }
  if (f.retrievalDisabled && f.expectGrounded) {
    return d(
      "QUERY_UNDERSTANDING",
      "the intent is right but its retrieval mode fetches no passages, so a grounded answer was impossible",
      "retrievalModeFor() in lib/ai/plan.ts — this intent needs an evidence mode",
    );
  }
  if (f.deterministic && !f.templateAcceptable) {
    return d(
      "QUERY_UNDERSTANDING",
      "a canned template answered a question that needed evidence",
      "deterministicAnswer() in lib/ai/plan.ts, or the intent that routed here",
    );
  }

  // ── B2. Entity resolution ───────────────────────────────────────────────
  // Before retrieval, because it chooses what retrieval is aimed at.
  if (f.entityResolved === false) {
    return d(
      "ENTITY_RESOLUTION",
      "the question named a work and the resolver attached a different one",
      "lib/ai/entity.ts — the resolution order (exact > normalized > edition-stripped > prefix > contains > fuzzy) or the popularity band",
    );
  }

  // ── B. Retrieval ────────────────────────────────────────────────────────
  if (!f.expectedSourceFound) {
    if (f.evidenceCount === 0) {
      return d(
        "RETRIEVAL",
        "both legs returned nothing for a question the corpus can answer",
        "lib/ai/retrieval.ts — the lexical floor, the similarity floor, or the query the legs were given",
      );
    }
    return d(
      "RETRIEVAL",
      `${f.evidenceCount} passage(s) were retrieved and none came from a source that answers the question`,
      "lib/ai/retrieval.ts and the term extraction feeding it (queryTerms / extractQuery)",
    );
  }

  // ── C / D. The right evidence was found. Did it survive, and cleanly? ───
  // Only where the label can bear the weight — see `expectedSourcesExhaustive`.
  if (
    f.expectedSourcesExhaustive &&
    f.contextPrecision !== null &&
    f.contextPrecision < CONTEXT_PRECISION_FLOOR
  ) {
    return d(
      "CONTEXT",
      `the expected source was retrieved but only ${Math.round(f.contextPrecision * 100)}% of the prompt's passages came from one`,
      "EVIDENCE_LIMITS + diversify() in lib/ai/evidence.ts — the per-record cap is spending slots on weaker records",
    );
  }

  // ── H / G. Citations ────────────────────────────────────────────────────
  if (f.hallucinatedCitations > 0) {
    return d(
      "HALLUCINATION",
      `${f.hallucinatedCitations} citation(s) named a page the retrieval set does not contain`,
      "enforceGrounding() deleted them, so the reader was protected — but the prompt is inviting them",
    );
  }
  if (f.expectGrounded && !f.grounded) {
    if (!f.answerNonEmpty) {
      return d(
        "CITATION",
        "no answer text and no citations, from evidence that was retrieved",
        "the generation step returned nothing — check maxOutputTokens and the provider trace",
      );
    }
    return d(
      "CITATION",
      "the answer has substance but carries no citation that survived grounding",
      "lib/ai/guardrails.ts enforceGrounding + the citation format the rider asks for",
    );
  }

  // ── F. Only now, and only with the model in the loop ────────────────────
  if (!f.answerNonEmpty) {
    if (!f.modelAnswered) {
      return d(
        "PROMPT",
        "an empty answer on a path no model ran — the template produced nothing",
        "the template for this intent in lib/ai/templates.ts",
      );
    }
    return d(
      "MODEL_REASONING",
      "correct intent, correct evidence, clean context, and the model returned nothing",
      "this is the ONLY class of failure that justifies looking at the model itself",
    );
  }

  // The Stage F monitor (§24 of the AI Brain 2.1 brief). Every upstream stage
  // has now been positively verified for this question — right intent, right
  // entity, right evidence, clean context, real citations — and the answer
  // still does not carry a claim the label requires. That, and only that, is
  // a reasoning failure.
  //
  // Two conditions keep it honest. `modelAnswered` means a model actually
  // reasoned (never true under the mock). `answerCorrect !== null` means the
  // label SAID what a correct answer must contain — a deterministic list of
  // substrings, not a judgement, because an LLM judge would put the thing
  // under test in the jury.
  if (f.modelAnswered && f.answerCorrect === false) {
    return d(
      "MODEL_REASONING",
      "every upstream stage verified correct, and the answer still omits a claim the label requires",
      "this is the ONLY class of failure that justifies looking at the model itself — reproduce it across runs before acting (§25)",
    );
  }

  return null;
}

/**
 * Whether `MODEL_REASONING` is even assessable in this run.
 *
 * Under the mock provider no model reasons about anything, so a run that
 * reports zero model failures is reporting that it could not look — not that
 * it looked and found none. The benchmark prints this distinction rather than
 * letting a 0 be read as a clean bill of health.
 */
export function modelReasoningAssessable(live: boolean): boolean {
  return live;
}
