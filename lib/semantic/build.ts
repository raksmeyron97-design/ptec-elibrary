/* lib/semantic/build.ts
 *
 * The whole per-record decision, in one pure function.
 *
 * Given a document's extracted pages and its catalogue tags, `buildInsights`
 * returns either the topics that document demonstrably covers — with the body
 * pages that prove each one — or a stated reason why it has nothing to say.
 * Nothing here reads a database, calls a model, or knows about HTTP, so the
 * unit tests and the build script exercise the identical code path.
 *
 * ── Why "nothing to say" is a first-class result ─────────────────────────────
 *
 * Most of this collection cannot support the feature today, and that has to be
 * legible rather than silent. A book with no extracted pages, a book whose
 * Khmer extraction is structurally broken, and a book whose tags simply are
 * not discussed in its body are three different situations with three
 * different owners: the indexer, the extraction toolchain, and the cataloguer.
 * Collapsing them into an empty section would hide the second one — which is
 * currently 99 books — behind the appearance of a working feature.
 *
 * ── Versioning ───────────────────────────────────────────────────────────────
 *
 * SEMANTIC_VERSION is stored on every computed row. Changing the detector, the
 * classifier, the label rules or the evidence thresholds means bumping it, and
 * the builder then treats every stored row as stale. Rows are never silently
 * overwritten by a different generation of this logic.
 */

import { analyzeTextHealth, type TextHealth } from "@/lib/semantic/text-quality";
import { classifyPages, type PageInput, type PassageKind } from "@/lib/semantic/passages";
import { collectEvidence, supportedTopics, EVIDENCE_RULES } from "@/lib/semantic/topics";

/** Bump on any change to the detector, classifier, label rules or thresholds. */
export const SEMANTIC_VERSION = 1;

export type InsightStatus =
  /** Topics were proven from body text. */
  | "ok"
  /** No pages were extracted for this record — ask the indexer. */
  | "no-text"
  /** Pages exist and are not this document's text — ask the toolchain. */
  | "damaged-text"
  /** Text is good, but no catalogue tag is discussed in it — ask the cataloguer. */
  | "unsupported-topics";

export type InsightTopic = {
  label: string;
  /** Body pages that carry it, ascending, capped at EVIDENCE_RULES.maxPagesShown. */
  pages: number[];
  /** Proven pages beyond the ones listed. */
  morePages: number;
  mentions: number;
  score: number;
};

export type SemanticInsights = {
  version: number;
  status: InsightStatus;
  topics: InsightTopic[];
  /** Page counts by structural kind — the feature's own coverage report. */
  pages: Record<PassageKind, number> & { total: number };
  /** Health of the sampled body text. Null when there was no text to sample. */
  textHealth: Pick<TextHealth, "script" | "verdict" | "reasons"> | null;
  /** Catalogue tags refused before evidence was even looked for. */
  rejectedLabels: number;
};

export type BuildInput = {
  pages: readonly PageInput[];
  /** The record's catalogue tags, as the librarian wrote them. */
  tags: readonly string[];
  title?: string | null;
  authors?: readonly string[];
};

/** Characters of body text sampled for the health verdict. Damage is a
 *  property of the font, so it is uniform across a file — more text would
 *  cost more and change nothing. */
const HEALTH_SAMPLE_CHARS = 12_000;

const EMPTY_PAGE_COUNTS = {
  total: 0,
  body: 0,
  "front-matter": 0,
  contents: 0,
  references: 0,
  "back-matter": 0,
  sparse: 0,
} satisfies SemanticInsights["pages"];

export function buildInsights(input: BuildInput): SemanticInsights {
  const base = {
    version: SEMANTIC_VERSION,
    topics: [] as InsightTopic[],
    pages: { ...EMPTY_PAGE_COUNTS },
    textHealth: null as SemanticInsights["textHealth"],
    rejectedLabels: 0,
  };

  if (input.pages.length === 0) return { ...base, status: "no-text" };

  const classified = classifyPages(input.pages);
  const counts = { ...EMPTY_PAGE_COUNTS, total: classified.length };
  for (const page of classified) counts[page.kind] += 1;

  // Health is judged on BODY text: front matter is a title page in a display
  // face and a references section is dense with foreign names, so either would
  // skew the ratios for a document that is otherwise fine.
  const sample = classified
    .filter((p) => p.kind === "body")
    .map((p) => p.body)
    .join("\n")
    .slice(0, HEALTH_SAMPLE_CHARS);

  const health = analyzeTextHealth(sample);
  const textHealth = { script: health.script, verdict: health.verdict, reasons: health.reasons };

  if (health.verdict === "damaged") {
    return { ...base, status: "damaged-text", pages: counts, textHealth };
  }
  // "unknown" means too little body text to judge, which is also too little to
  // prove a topic from. It is reported as no-text rather than as damage: we
  // did not find a defect, we found nothing to inspect.
  if (health.verdict === "unknown" || counts.body === 0) {
    return { ...base, status: "no-text", pages: counts, textHealth };
  }

  const context = { title: input.title, authors: input.authors };
  const evidence = collectEvidence(input.tags, classified, context);
  const rejectedLabels = input.tags.length - evidence.length;

  const topics = supportedTopics(evidence).map((topic) => ({
    label: topic.label,
    pages: topic.pages.slice(0, EVIDENCE_RULES.maxPagesShown),
    morePages: Math.max(0, topic.pages.length - EVIDENCE_RULES.maxPagesShown),
    mentions: topic.mentions,
    score: topic.score,
  }));

  return {
    version: SEMANTIC_VERSION,
    status: topics.length > 0 ? "ok" : "unsupported-topics",
    topics,
    pages: counts,
    textHealth,
    rejectedLabels,
  };
}
