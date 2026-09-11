// lib/ai/query.ts
// A structured reading of the reader's question, built by CONSTRUCTION rather
// than by subtraction. Pure — no I/O, no server-only.
//
// WHY THIS EXISTS
//
// `extractQuery()` in lib/ai/intent.ts derived the topic of a question by
// stripping the frames it knew about with regexes. Every frame it did not know
// leaked straight into both retrieval legs: "Explain ethics as the library's
// books describe it" reached the lexical leg as the whole sentence, so its
// terms were [describe, explain, library, ethics] and the page-match floor
// demanded three of them — a page that discusses ethics without also saying
// "describe", "explain" and "library" scored 1 and was dropped. The semantic
// leg embedded the sentence rather than the concept. Measured with
// scripts/ai-answer-benchmark.ts against the live corpus (2026-09-11): that
// question retrieved ZERO passages over a collection with six labelled books
// on ethics, "What is action research?" was routed to a thesis search because
// "action research" is a collection keyword, and "Across the library's books,
// how is scaffolding handled?" lost its frame only partially and searched for
// `'s books, how is scaffolding handled`.
//
// So the question is first read into a typed shape — WHAT KIND of question
// (its frame), WHAT it is about (its topic), and WHICH entities it names
// (titles, authors, ISBNs) — and everything downstream reads those fields.
// The frame decides the answer policy (does this need evidence? may it be
// synthesised? is "we don't hold that" an acceptable answer?); the topic is
// what gets embedded and searched; the entity candidates are what the
// catalogue resolves exactly.
//
// Deterministic on purpose. A model classifier would cost a round-trip to
// learn what a dozen patterns know for free, and it could not be unit-tested
// offline. The patterns are conservative: when none matches, the frame is
// `none` and the older keyword tables decide, exactly as before.

import { queryIsbn } from "@/lib/search/normalize";
import { validateIsbn } from "@/lib/books/duplicate-detection/normalize";

/** What kind of question this is — the thing the answer policy keys on. */
export type QueryFrame =
  /** "What is X?" — a concept the corpus should define. */
  | "definition"
  /** "Explain X" / "how does X work" — an evidence-backed explanation. */
  | "explanation"
  /** "What does the literature say about X" — cross-collection evidence. */
  | "evidence"
  /** "Compare A and B" — two works or two concepts. */
  | "comparison"
  /** "Do you have the book X?" — the exact entity, or an honest no. */
  | "availability"
  /** "Who wrote X?" — X is a WORK; the byline is the answer. */
  | "author_lookup"
  /** "Summarize X" */
  | "summary"
  /** No recognised frame — the keyword tables decide. */
  | "none";

export type QueryLanguage = "en" | "km" | "mixed";

export interface AiQuery {
  raw: string;
  language: QueryLanguage;
  frame: QueryFrame;
  /** The concept or subject the question is about, with its frame removed. */
  topic: string;
  /** Spans the reader marked or phrased as a work's title. */
  titleCandidates: string[];
  /** Names the question presents as a person. */
  authorCandidates: string[];
  isbnCandidates: string[];
  /** For a comparison: the two sides, in the order asked. */
  compareTargets: string[];
  /**
   * A work the question names as the SOURCE to answer from ("According to
   * X, what is Y", "What does X say about Y") when the reader is not on
   * X's page. Retrieval resolves it and scopes to it.
   */
  scopeTitle?: string;
  /** The named entity must be resolved exactly; a "similar" result is wrong. */
  exactEntityRequired: boolean;
  /** The answer must rest on retrieved passages, not on a catalogue card. */
  requiresEvidence: boolean;
  /** Several sources may be combined into one answer. */
  allowsSynthesis: boolean;
  /** "The library holds nothing on this" is an acceptable, complete answer. */
  noAnswerAllowed: boolean;
}

const KHMER_CHAR = /[ក-៿]/u;
const LATIN_LETTER = /[a-z]/i;

export function detectQueryLanguage(text: string): QueryLanguage {
  const km = KHMER_CHAR.test(text);
  const latin = LATIN_LETTER.test(text);
  if (km && latin) return "mixed";
  return km ? "km" : "en";
}

/**
 * An ISBN inside a sentence ("do you have ISBN 978-0-415-27410-4?"). `queryIsbn`
 * only recognises a query that IS an ISBN; this finds one carried in words,
 * and accepts it only when its digits make a valid-shaped ISBN-10/13.
 */
const ISBN_IN_TEXT = /\b(?:97[89][\s-]?)?(?:\d[\s-]?){9}[\dxX]\b/u;
function embeddedIsbn(text: string): string | null {
  const m = ISBN_IN_TEXT.exec(text);
  // Inside a sentence the check digit must verify: a ten-digit page number
  // or a phone number is ISBN-shaped, and lenience belongs to the bare form.
  if (!m || validateIsbn(m[0]).status !== "valid") return null;
  return queryIsbn(m[0]);
}

// ── Quoted spans ──────────────────────────────────────────────────────────────
const QUOTED_RE = /["“«]([^"“”«»]{2,160})["”»]/gu;

function quoted(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(QUOTED_RE)) out.push(m[1].trim());
  return out;
}

// ── Frames ────────────────────────────────────────────────────────────────────
// Each entry captures the TOPIC in group 1. Order matters: the more specific
// frames (author lookup, availability, evidence) run before the generic
// definition/explanation shapes, because "what is the author of X" and "what
// does the literature say about X" both begin like a definition.

interface FramePattern {
  frame: QueryFrame;
  re: RegExp;
}

const TRAIL = String.raw`\s*[?？។៕.!]*\s*$`;
const EN_LIBRARY_SOURCES = String.raw`(?:the\s+)?(?:library'?s?\s+|collection'?s?\s+|ptec'?s?\s+)?(?:literature|books?|sources?|authors?|studies|research|scholarship|texts?|materials?|collection)`;
const EN_CONTENT_VERBS = String.raw`(?:say|says|show|shows|tell\s+us|suggest|suggests|describe|describes|discuss|discusses|explain|explains|define|defines|present|presents|cover|covers|teach|teaches|handle|handles|treat|treats|approach|approaches|address|addresses)`;

const FRAMES: FramePattern[] = [
  // Who wrote X — X is a work, whatever else it looks like.
  {
    frame: "author_lookup",
    re: new RegExp(
      String.raw`^(?:please\s+)?(?:can\s+you\s+tell\s+me\s+)?who\s+(?:wrote|authored|is\s+the\s+author\s+of|are\s+the\s+authors\s+of|was\s+the\s+author\s+of)\s+(?:the\s+(?:e-?book|book|thesis|title)\s+)?(.+?)${TRAIL}`,
      "iu",
    ),
  },
  { frame: "author_lookup", re: new RegExp(String.raw`^(?:តើ\s*)?(?:អ្នកណា|នរណា)\s*(?:ជាអ្នក)?\s*(?:សរសេរ|និពន្ធ|តែង)\s*(?:សៀវភៅ)?\s*(.+?)${TRAIL}`, "u") },
  { frame: "author_lookup", re: new RegExp(String.raw`^(?:តើ\s*)?(?:អ្នកនិពន្ធ|អ្នកសរសេរ)\s*(?:នៃ|របស់)?\s*(?:សៀវភៅ)?\s*(.+?)\s*(?:ជា|គឺ)?\s*(?:អ្នកណា|នរណា)${TRAIL}`, "u") },

  // Do you have THE BOOK X / a copy of X — an availability check on a named work.
  {
    frame: "availability",
    re: new RegExp(
      String.raw`^(?:please\s+)?(?:do\s+you\s+have|does\s+the\s+library\s+(?:have|hold|carry|own)|is\s+there|have\s+you\s+got|do\s+you\s+carry|can\s+i\s+(?:find|get|borrow|read))\s+(?:a\s+copy\s+of\s+)?(?:the|a|an)\s+(?:e-?book|book|thesis|dissertation|title|publication|report)\s+(?:called\s+|titled\s+|named\s+)?(.+?)(?:\s+(?:available|in\s+(?:the\s+)?(?:library|collection|stock)|here))?${TRAIL}`,
      "iu",
    ),
  },
  { frame: "availability", re: new RegExp(String.raw`^(?:is|are)\s+(?:the\s+(?:e-?book|book|title)\s+)?(.+?)\s+(?:available|in\s+(?:the\s+)?(?:library|collection|stock))${TRAIL}`, "iu") },
  // "Do you have The Action Research Guidebook: A Four-Step Process?" — no
  // collection noun, but a Title-Case phrase is a work, not a topic. The
  // capitalisation test lives in detectFrame (TITLE_CASE), not in the regex.
  {
    frame: "availability",
    re: new RegExp(
      String.raw`^(?:please\s+)?(?:do\s+you\s+have|does\s+the\s+library\s+(?:have|hold|carry)|have\s+you\s+got|can\s+i\s+(?:find|get|borrow|read))\s+(?!(?:any|some|a|an|the)\s+(?:e-?books?|books?|theses|thesis|titles?|materials?|resources?|anything|something)\b)(?<titlecase>\S[^?]{3,120}?)(?:\s+(?:available|in\s+(?:the\s+)?(?:library|collection|stock)|here))?${TRAIL}`,
      "iu",
    ),
  },
  // Summarize X — X is a work; "summarize this book" (deictic) is not this frame.
  {
    frame: "summary",
    re: new RegExp(
      String.raw`^(?:please\s+)?(?:can\s+you\s+)?(?:summari[sz]e|give\s+me\s+a\s+summary\s+of|summary\s+of|what\s+are\s+the\s+main\s+ideas\s+of|overview\s+of)\s+(?:the\s+(?:e-?book|book|thesis|text)\s+)?(.+?)${TRAIL}`,
      "iu",
    ),
  },
  { frame: "summary", re: new RegExp(String.raw`^(?:សូម\s*)?សង្ខេប\s*(?:សៀវភៅ)?\s*(?!នេះ)(.+?)${TRAIL}`, "u") },
  // "មានសៀវភៅ X ទេ" names a work; "មានសៀវភៅអំពី X ទេ" ("books ABOUT X") names a
  // topic and stays a catalogue search — the lookahead is what tells them apart.
  { frame: "availability", re: new RegExp(String.raw`^(?:តើ\s*)?(?:បណ្ណាល័យ\s*)?មាន\s*(?:សៀវភៅ|ឯកសារ)\s*(?:ចំណងជើង|ឈ្មោះ)?\s*(?!(?:អំពី|ស្តីពី|ស្ដីពី|ពី|ទាក់ទង|សរសេរដោយ|និពន្ធដោយ|តែងដោយ|របស់))(.+?)\s*(?:ទេ|ដែរឬទេ|ឬទេ|ឬអត់)${TRAIL}`, "u") },

  // What does the literature say about X — evidence across the collection.
  {
    frame: "evidence",
    re: new RegExp(
      String.raw`^(?:so\s+)?what\s+(?:do|does)\s+${EN_LIBRARY_SOURCES}\s+${EN_CONTENT_VERBS}\s*(?:about|on|regarding|concerning|of)?\s*(.+?)${TRAIL}`,
      "iu",
    ),
  },
  {
    frame: "evidence",
    re: new RegExp(
      String.raw`^(?:according\s+to|based\s+on|from|in)\s+${EN_LIBRARY_SOURCES}\s*[,:]?\s*(?:what\s+(?:is|are)\s+(?:a|an|the)?\s*|how\s+(?:is|are)\s+|explain\s+|describe\s+)?(.+?)(?:\s+(?:handled|treated|defined|described|covered|approached|understood|explained|presented))?${TRAIL}`,
      "iu",
    ),
  },
  {
    frame: "evidence",
    re: new RegExp(
      String.raw`^across\s+${EN_LIBRARY_SOURCES}\s*[,:]?\s*(?:how\s+(?:is|are|do|does)\s+|what\s+(?:is|are)\s+(?:said\s+about\s+)?)?(.+?)(?:\s+(?:handled|treated|defined|described|covered|approached|understood|explained|presented|discussed|dealt\s+with))?${TRAIL}`,
      "iu",
    ),
  },
  {
    frame: "evidence",
    re: new RegExp(
      String.raw`^how\s+(?:is|are|do|does)\s+(.+?)\s+(?:handled|treated|defined|described|covered|approached|understood|explained|presented|discussed|dealt\s+with)\s+(?:in|across|by|throughout)\s+${EN_LIBRARY_SOURCES}${TRAIL}`,
      "iu",
    ),
  },
  { frame: "evidence", re: new RegExp(String.raw`^(?:តើ\s*)?(?:អក្សរសិល្ប៍|ការស្រាវជ្រាវ|សៀវភៅទាំងអស់|សៀវភៅនានា|ឯកសារនានា)\s*(?:និយាយ|បង្ហាញ|ពន្យល់|រៀបរាប់)\s*(?:អ្វី|អី|យ៉ាងណា|ដូចម្តេច)?\s*(?:អំពី|ស្តីពី|ស្ដីពី|ពី)?\s*(.+?)${TRAIL}`, "u") },

  // According to <WORK>, what is X / What does <WORK> say about X — a named
  // work as the source. After the collection-noun evidence frames above, so
  // "what do the books say about X" is never read as a work called "the books".
  {
    frame: "evidence",
    re: new RegExp(
      String.raw`^according\s+to\s+(?:the\s+(?:e-?book|book|thesis|text)\s+)?["“«]?(?<work>[^"”»,]{3,120}?)["”»]?\s*,\s*(?:what\s+(?:is|are)\s+(?:(?:a|an|the)\s+)?|how\s+(?:is|are)\s+|explain\s+|describe\s+)?(.+?)(?:\s+(?:handled|treated|defined|described|covered|approached|understood|explained|presented))?${TRAIL}`,
      "iu",
    ),
  },
  {
    frame: "evidence",
    re: new RegExp(
      String.raw`^what\s+(?:does|do)\s+(?:the\s+(?:e-?book|book|thesis|text)\s+)?["“«]?(?<work>[^"”»]{3,120}?)["”»]?\s+${EN_CONTENT_VERBS}\s+(?:about|on|regarding|of)\s+(.+?)${TRAIL}`,
      "iu",
    ),
  },

  // Explain X (as the library's books describe it).
  {
    frame: "explanation",
    re: new RegExp(
      String.raw`^(?:please\s+)?(?:can\s+you\s+|could\s+you\s+)?explain\s+(?:deeply\s+|briefly\s+|simply\s+|clearly\s+)?(?:to\s+me\s+)?(?:about\s+)?(?:the\s+(?:concept|term|idea|notion|meaning)\s+of\s+)?(.+?)(?:\s*[,]?\s+as\s+${EN_LIBRARY_SOURCES}\s+${EN_CONTENT_VERBS}\s*(?:it|them|this|these)?)?(?:\s+(?:in\s+detail|briefly|simply|to\s+me))?${TRAIL}`,
      "iu",
    ),
  },
  { frame: "explanation", re: new RegExp(String.raw`^how\s+(?:does|do)\s+(.+?)\s+work${TRAIL}`, "iu") },
  { frame: "explanation", re: new RegExp(String.raw`^(?:សូម\s*)?(?:ជួយ\s*)?ពន្យល់\s*(?:ខ្ញុំ\s*)?(?:អំពី|ស្តីពី|ស្ដីពី|ពី)?\s*(.+?)${TRAIL}`, "u") },

  // What is X — a definition.
  {
    frame: "definition",
    re: new RegExp(
      // The article is optional but, when present, must be a whole word:
      // `(?:a|an|the)?\s*` ate the "a" of "action research".
      String.raw`^(?:so\s+)?(?:what|what's|whats)\s+(?:is|are|was|were)\s+(?:(?:a|an|the)\s+)?(?:meaning\s+of\s+|definition\s+of\s+|concept\s+of\s+|term\s+)?(.+?)(?:\s+(?:mean|means|in\s+(?:education|research|teaching)))?${TRAIL}`,
      "iu",
    ),
  },
  { frame: "definition", re: new RegExp(String.raw`^(?:define|definition\s+of|meaning\s+of|what\s+does)\s+(.+?)(?:\s+mean)?${TRAIL}`, "iu") },
  { frame: "definition", re: new RegExp(String.raw`^(?:តើ\s*)?(.+?)\s*(?:គឺជាអ្វី|ជាអ្វី|មានន័យថាម៉េច|មានន័យយ៉ាងណា|មានន័យដូចម្តេច|មានន័យថាអ្វី)${TRAIL}`, "u") },
  { frame: "definition", re: new RegExp(String.raw`^(?:តើ\s*)?អ្វី(?:ទៅ)?(?:ជា|គឺ)\s*(.+?)${TRAIL}`, "u") },
];

/**
 * Words that point at the reader's situation rather than at a subject. A
 * "definition" whose topic is one of these is not a definition: "what is this
 * book about" and "what is your phone number" are context and FAQ questions,
 * and the tables that own them run first in classifyIntent — this guard only
 * stops the frame from claiming them when parseQuery is used on its own.
 */
// A topic that is itself a question ("explain who invented the printing
// press") is not a concept the corpus defines; it stays on the general path.
const NOT_A_TOPIC =
  /^(?:this|that|it|(?:the\s+)?(?:library|collection|catalogue|catalog|site|website)(?:'s|s)?\b|your|you|ptec|the\s+(?:book|document|text|thesis|paper)\b|in\s+this|in\s+the\s+book|how\s+(?:this|it|that)\b|deeply|briefly|simply|who|whom|whose|why|when|where|whether)\b/iu;

const DEICTIC_IN_TOPIC = /\b(?:this|these)\s+(?:e-?book|book|document|text|thesis|paper|publication|report|volume)\b|សៀវភៅនេះ|ឯកសារនេះ|អត្ថបទនេះ/iu;

function cleanTopic(topic: string): string {
  return topic
    .replace(/^[\s"“”'‘’«»,:;-]+|[\s"“”'‘’«»,:;.!?-]+$/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface FrameMatch {
  frame: QueryFrame;
  topic: string;
  /** The work named as the source, when the frame names one. */
  scopeTitle?: string;
}

/** Two or more capitalised words: how a reader writes a title without quoting it. */
const TITLE_CASE = /^(?:\S*[A-Z]\S*)(?:\s+(?:[a-z]{1,3}|[A-Z0-9:&-]\S*|\S*[A-Z]\S*))*$/u;
const titleCaseWords = (s: string) => s.split(/\s+/).filter((w) => /^[A-Z]/.test(w)).length;

/** Collection nouns that are not a work's title ("the books", "the literature"). */
const NOT_A_WORK = /^(?:the\s+)?(?:library'?s?\s+|collection'?s?\s+)?(?:literature|books?|sources?|authors?|studies|research|scholarship|texts?|materials?|collection|document|this\s+book|it)$/iu;

/**
 * The frame a question wears and the topic left when it is removed, or null
 * when no frame matched. Conservative: a match whose topic is empty, a bare
 * pronoun, or a pointer at the reader's own page is not a match.
 */
export function detectFrame(text: string): FrameMatch | null {
  const t = text.trim();
  if (!t) return null;
  for (const { frame, re } of FRAMES) {
    const m = re.exec(t);
    if (!m) continue;
    const topic = cleanTopic(m[m.length - 1] ?? "");
    if (topic.length < 2) continue;
    if (NOT_A_TOPIC.test(topic)) continue;
    if ((frame === "definition" || frame === "explanation" || frame === "summary") && DEICTIC_IN_TOPIC.test(topic)) continue;
    // A capitalised phrase after "do you have" is a work only when at least
    // two of its words are capitalised — "Do you have Anything on reading?"
    // is a topic search.
    if (m.groups?.titlecase !== undefined && (!TITLE_CASE.test(topic) || titleCaseWords(topic) < 2)) continue;
    const work = m.groups?.work ? cleanTopic(m.groups.work) : "";
    if (m.groups && "work" in m.groups && (!work || NOT_A_WORK.test(work))) continue;
    return work ? { frame, topic, scopeTitle: work } : { frame, topic };
  }
  return null;
}

const COMPARE_LEAD =
  /^(?:please\s+)?(?:can\s+you\s+|could\s+you\s+)?(?:compare|contrast|comparison\s+(?:of|between)|what(?:'s|\s+is)\s+the\s+difference\s+between|what\s+are\s+the\s+differences\s+between|how\s+(?:do|does)\s+.+?\s+differ\s+from|ប្រៀបធៀប|ភាពខុសគ្នារវាង|អ្វីជាភាពខុសគ្នារវាង)\s+/iu;
const COMPARE_SPLIT = /\s+(?:and|versus|vs\.?|with|against|from|និង|ជាមួយ)\s+/iu;

/** The two sides of a comparison, quoted spans first, or []. */
export function compareSides(text: string): string[] {
  const q = quoted(text);
  if (q.length === 2) return q;
  const m = COMPARE_LEAD.exec(text.trim());
  if (!m) return [];
  const rest = cleanTopic(text.trim().slice(m[0].length));
  const parts = rest.split(COMPARE_SPLIT).map(cleanTopic).filter((p) => p.length >= 2);
  return parts.length === 2 ? parts : [];
}

/** A title the reader named without quoting it: "the book X", "titled X". */
const TITLED_RE = /\b(?:the\s+(?:e-?book|book|thesis|dissertation|title|publication|report)|titled|entitled|called)\s+(.+?)(?:\s+(?:available|in\s+the\s+library|please))?[?.!]*$/iu;

/**
 * Build the structured query. Never throws; on unrecognisable input every
 * list is empty, the frame is `none`, and `topic` is the trimmed text.
 */
export function parseQuery(raw: string): AiQuery {
  const text = raw.trim();
  const language = detectQueryLanguage(text);
  const titles = quoted(text);
  const isbn = queryIsbn(text) ?? embeddedIsbn(text);
  const frameMatch = detectFrame(text);
  const sides = compareSides(text);

  let frame: QueryFrame = frameMatch?.frame ?? "none";
  let topic = frameMatch?.topic ?? text;
  const scopeTitle = frameMatch?.scopeTitle;
  const titleCandidates = [...titles];
  if (scopeTitle && !titleCandidates.includes(scopeTitle)) titleCandidates.push(scopeTitle);
  const authorCandidates: string[] = [];
  const isbnCandidates = isbn ? [isbn] : [];
  let compareTargets: string[] = [];

  if (sides.length === 2) {
    frame = "comparison";
    compareTargets = sides;
    topic = sides.join(" and ");
    for (const s of sides) if (!titleCandidates.includes(s)) titleCandidates.push(s);
  } else if (frame === "author_lookup") {
    // The thing after "who wrote" is a WORK. Quoted or not, it is a title
    // candidate first; it is never read as a person's name.
    const t = titles[0] ?? topic;
    if (!titleCandidates.includes(t)) titleCandidates.push(t);
    topic = t;
  } else if (frame === "availability" || frame === "summary") {
    const t = titles[0] ?? topic;
    if (!titleCandidates.includes(t)) titleCandidates.push(t);
    topic = t;
  } else if (frame === "none") {
    const titled = TITLED_RE.exec(text);
    if (titled) {
      const t = cleanTopic(titled[1]);
      if (t.length >= 2 && !titleCandidates.includes(t)) titleCandidates.push(t);
    }
  }

  if (frame === "definition" || frame === "explanation" || frame === "evidence") {
    // A quoted phrase inside a concept question is the concept, verbatim —
    // unless it is the WORK the question names as its source.
    if (titles.length === 1 && topic.includes(titles[0]) && titles[0] !== scopeTitle) topic = titles[0];
  }

  const exactEntityRequired = frame === "availability" || frame === "author_lookup" || isbnCandidates.length > 0;
  const requiresEvidence = frame === "definition" || frame === "explanation" || frame === "evidence" || frame === "comparison" || frame === "summary";
  const allowsSynthesis = frame === "definition" || frame === "explanation" || frame === "evidence" || frame === "comparison";
  const noAnswerAllowed = frame !== "none";

  return {
    raw: text,
    language,
    frame,
    topic: cleanTopic(topic) || text,
    titleCandidates,
    authorCandidates,
    isbnCandidates,
    compareTargets,
    scopeTitle,
    exactEntityRequired,
    requiresEvidence,
    allowsSynthesis,
    noAnswerAllowed,
  };
}

/** Frames whose answer is retrieved evidence about a CONCEPT. */
export const CONCEPT_FRAMES: ReadonlySet<QueryFrame> = new Set<QueryFrame>(["definition", "explanation", "evidence"]);
