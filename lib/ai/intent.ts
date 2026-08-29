// lib/ai/intent.ts
// Deterministic intent classification, language detection, verbosity
// detection and query normalization. Pure — no I/O, no model call.
//
// The whole point of this module is that a large majority of library questions
// are answerable without ever asking an LLM what the user meant. Using a model
// to classify "តើបណ្ណាល័យបើកម៉ោងប៉ុន្មាន?" costs a full round-trip to learn
// something a keyword table knows for free (audit §4.4).
//
// It is written to be *conservative*: when the signals are weak the result is
// a low-confidence guess that the router is free to escalate, rather than a
// confident wrong branch.

import type { AIIntent, AILocale, Verbosity } from "./response";
import type { LibraryInfoTopic } from "@/lib/library-info";

export interface IntentResult {
  intent: AIIntent;
  /** 0–1. The router only takes zero-LLM shortcuts at >= CONFIDENT. */
  confidence: number;
  locale: AILocale;
  verbosity: Verbosity;
  /** Set for `faq` — which library fact was asked for. */
  topic?: LibraryInfoTopic;
  /** Page path carrying the full detail of that fact. Filled by retrieval. */
  factLink?: string;
  /** The topical part of the question, with search verbs stripped. */
  query: string;
  /** Resource slug carried in from the page the user is on, when relevant. */
  slug?: string;
  /** Page number the user explicitly referenced ("p. 42", "ទំព័រ ៤២"). */
  page?: number;
  /** True for greetings / thanks — answered from a template, never a model. */
  smalltalk?: boolean;
}

/** Confidence at or above which the router may skip the LLM entirely. */
export const CONFIDENT = 0.7;

// ── Language ──────────────────────────────────────────────────────────────────
const KHMER_CHAR = /[ក-៿᧠-᧿]/;

/**
 * Khmer if the text contains any meaningful amount of Khmer script. Mixed
 * queries ("រកសៀវភៅអំពី psychology") are Khmer — the user is writing Khmer and
 * expects a Khmer reply, even though the topic term is English.
 */
export function detectLanguage(text: string): AILocale {
  let khmer = 0;
  let letters = 0;
  for (const ch of text) {
    if (KHMER_CHAR.test(ch)) khmer++;
    if (/[\p{L}]/u.test(ch)) letters++;
  }
  if (letters === 0) return "en";
  return khmer / letters >= 0.15 ? "km" : "en";
}

// ── Verbosity ─────────────────────────────────────────────────────────────────
const DETAILED = [
  "in detail", "detailed", "explain deeply", "deep dive", "step by step",
  "step-by-step", "elaborate", "comprehensive", "thoroughly", "compare",
  "summarize the whole", "summarise the whole", "full summary", "at length",
  "លម្អិត", "ពន្យល់ឱ្យច្បាស់", "ជាជំហានៗ", "ប្រៀបធៀប", "លំអិត", "ឱ្យបានលម្អិត",
];
const BRIEF = [
  "briefly", "in short", "one sentence", "short answer", "tl;dr", "quickly",
  "just tell me", "សង្ខេប", "ខ្លីៗ", "ដោយសង្ខេប",
];

export function detectVerbosity(text: string): Verbosity {
  const t = text.toLowerCase();
  if (DETAILED.some((k) => t.includes(k))) return "detailed";
  if (BRIEF.some((k) => t.includes(k))) return "brief";
  return "normal";
}

// ── Normalization ─────────────────────────────────────────────────────────────
/**
 * Canonical form used for cache keys and embeddings. Collapses whitespace,
 * lowercases (Khmer is caseless, so this is a no-op there), and drops trailing
 * punctuation — so "Psychology books?" and "psychology books" share one
 * embedding and one cache entry.
 */
export function normalizeQuery(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[?!.,;:៕។៖]+\s*$/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Keyword tables ────────────────────────────────────────────────────────────
// Each entry is matched with `includes` against the lowercased text, so Khmer
// substrings work without a word segmenter.

const FAQ_TOPICS: Array<[LibraryInfoTopic, string[]]> = [
  ["hours", ["opening hour", "open hour", "closing time", "what time", "when do you open",
    "when does the library open", "when is the library open", "business hours", "office hours",
    "open on", "schedule", "timing",
    "ម៉ោងបើក", "បើកម៉ោង", "បិទម៉ោង", "ម៉ោងធ្វើការ", "ម៉ោងបម្រើ", "ពេលវេលាបើក"]],
  ["location", ["where is the library", "where are you located", "your address", "the address",
    "how do i get to", "directions to", "which building", "what floor",
    "ទីតាំង", "នៅឯណា", "នៅកន្លែងណា", "អាសយដ្ឋាន", "ស្ថិតនៅ"]],
  ["contact", ["contact", "phone number", "telephone", "email address", "reach you",
    "get in touch", "call the library",
    "ទំនាក់ទំនង", "លេខទូរស័ព្ទ", "អ៊ីមែល", "ទូរស័ព្ទ"]],
  ["borrowing", ["borrow", "check out a book", "loan period", "how many books can i",
    "renew", "due date", "return a book", "overdue",
    "ខ្ចី", "សងសៀវភៅ", "រយៈពេលខ្ចី", "ខ្ចីបាន"]],
  ["rules", ["library rules", "regulations", "code of conduct", "am i allowed",
    "can i eat", "can i drink", "penalty", "fine for", "prohibited",
    "ច្បាប់", "វិន័យ", "បទបញ្ជា", "ពិន័យ", "ហាមឃាត់"]],
  ["membership", ["membership", "member card", "library card", "how do i join",
    "sign up for the library", "register at the library",
    "សមាជិក", "ប័ណ្ណសមាជិក", "ចុះឈ្មោះ"]],
  ["collection", ["how many books do you have", "size of the collection", "the collection",
    "what languages", "dewey", "ddc", "how many titles", "how many copies",
    "បណ្ដុំឯកសារ", "ចំនួនសៀវភៅ", "មានសៀវភៅប៉ុន្មាន", "ភាសាអ្វីខ្លះ"]],
  // "printing" on its own is too broad — it matched "who invented the printing
  // press", which is a general-knowledge question, not a services question.
  ["services", ["what services", "services do you offer", "study room", "meeting room",
    "reading space", "printing service", "can i print",
    "សេវាកម្ម", "សេវា", "បន្ទប់អាន", "បន្ទប់ប្រជុំ"]],
  ["mission", ["mission", "បេសកកម្ម"]],
  ["vision", ["vision", "ចក្ខុវិស័យ"]],
  ["values", ["core values", "your values", "គុណតម្លៃ"]],
  ["history", ["history of the library", "when was the library", "when was it founded",
    "established in", "ប្រវត្តិ", "បង្កើតឡើងនៅ", "កកើតឡើង"]],
  // Deliberately NOT "about the library" — that phrase also appears in
  // "any news about the library?", which is a post search, not an identity
  // question. The entries here all name the library as the subject.
  ["about", ["about ptec library", "who are you", "what is this library",
    "tell me about the library", "អំពីបណ្ណាល័យ", "តើអ្នកជានរណា", "បណ្ណាល័យនេះជា"]],
];

const BOOK_WORDS = ["book", "books", "ebook", "e-book", "textbook", "novel", "title", "read",
  "សៀវភៅ", "អានសៀវភៅ", "ចំណងជើង"];
const THESIS_WORDS = ["thesis", "theses", "dissertation", "action research", "research report",
  "graduation report", "capstone", "research paper",
  "សារណា", "និក្ខេបបទ", "ស្រាវជ្រាវ", "របាយការណ៍ស្រាវជ្រាវ", "ស្រាវជ្រាវប្រតិបត្តិ"];
const POST_WORDS = ["news", "announcement", "announcements", "blog", "event", "events",
  "what's new", "whats new", "latest post", "notice",
  "ព័ត៌មាន", "ដំណឹង", "សេចក្ដីជូនដំណឹង", "ព្រឹត្តិការណ៍", "អត្ថបទ", "ប្រកាស"];
const SEARCH_WORDS = ["find", "search", "look for", "looking for", "show me", "do you have",
  "any books", "recommend", "suggestion", "suggest", "i want to read", "list of",
  "រក", "ស្វែងរក", "ណែនាំ", "មានទេ", "ចង់អាន", "សុំ"];
const RELATED_WORDS = ["similar", "like this", "related to this", "more like", "same author",
  "same topic as", "others like",
  "ស្រដៀង", "ដូចគ្នា", "បែបនេះ", "ទាក់ទង"];
const DETAIL_WORDS = ["what is this book about", "what's this book about", "about this book",
  "summarize this", "summarise this", "tell me about this",
  "សៀវភៅនេះនិយាយអំពីអ្វី", "សៀវភៅនេះអំពីអ្វី", "សង្ខេបសៀវភៅនេះ", "អំពីសៀវភៅនេះ"];
const PDF_WORDS = ["according to", "on page", "which page", "what page", "inside the book",
  "in the document", "does the book say", "does it say", "quote", "cite", "chapter",
  "ទំព័រ", "នៅក្នុងឯកសារ", "និយាយអំពី", "សរសេរថា", "ដកស្រង់"];
const LIBRARY_WORDS = ["library", "ptec", "catalog", "catalogue", "បណ្ណាល័យ", "វ.គ.ភ"];
// Greetings are matched on WORD boundaries, not as substrings: "hi" appears
// inside "this", "which" and "history", and a substring match sent every
// "what is this book about" down the smalltalk path.
const GREETING_RE =
  /(^|\W)(hello|hi|hey|good\s+(morning|afternoon|evening)|thanks|thank\s+you|bye|goodbye)(\W|$)|សួស្តី|ជម្រាបសួរ|អរគុណ|លាហើយ|ជម្រាបលា/u;
/** Requests we decline on academic-integrity grounds (§23). */
const ACADEMIC_MISUSE = ["write my essay", "write an essay for me", "do my homework",
  "do my assignment", "write my assignment", "write my thesis for me", "write the essay",
  "complete my homework", "answer my exam", "write my report for me",
  "សរសេរអត្ថបទឱ្យខ្ញុំ", "ធ្វើកិច្ចការឱ្យខ្ញុំ", "សរសេរសារណាឱ្យខ្ញុំ", "ធ្វើលំហាត់ឱ្យខ្ញុំ"];

function hits(text: string, words: readonly string[]): boolean {
  return words.some((w) => text.includes(w));
}

// ── Query extraction ──────────────────────────────────────────────────────────
// Strips the "find me books about" scaffolding so the retained text is the
// topic — which is what gets embedded and cached.
const LEAD_STRIP = [
  /^(please\s+)?(can you\s+|could you\s+|i want to\s+|i'?d like to\s+|i am looking for\s+|i'?m looking for\s+)?/i,
  /^(do you have\s+(any\s+)?|show me\s+(some\s+)?|find\s+(me\s+)?(some\s+)?|search for\s+|look for\s+|list\s+(some\s+)?|recommend\s+(me\s+)?(some\s+)?|suggest\s+(me\s+)?(some\s+)?)/i,
  /^(any\s+)?(good\s+)?(e-?books?|books?|theses|thesis|dissertations?|research(\s+papers?)?|articles?|posts?|news)\s+(about|on|regarding|related to|concerning|for)\s+/i,
  /^(about|on|regarding)\s+/i,
];
const KHMER_LEAD_STRIP = [
  /^(សូម)?\s*(ជួយ)?\s*(រក|ស្វែងរក|ណែនាំ|បង្ហាញ)\s*/u,
  /^(មាន|តើមាន)\s*/u,
  /^(សៀវភៅ|ឯកសារ|សារណា|និក្ខេបបទ|ព័ត៌មាន|អត្ថបទ)\s*(អំពី|ស្តីពី|ស្ដីពី|ពី|ទាក់ទងនឹង)\s*/u,
  /^(អំពី|ស្តីពី|ស្ដីពី)\s*/u,
];

export function extractQuery(text: string): string {
  let out = text.trim().replace(/^តើ\s*/u, "").replace(/[?？។៕]+$/u, "").trim();
  for (const re of [...LEAD_STRIP, ...KHMER_LEAD_STRIP]) out = out.replace(re, "").trim();
  // Trailing "ទេ?" / "please" are politeness, not topic.
  out = out.replace(/\s*(ទេ|ដែរ|បានទេ)\s*$/u, "").replace(/\s*please\s*$/i, "").trim();
  return out || text.trim();
}

const PAGE_RE = /(?:\bp(?:age|\.)?\s*|ទំព័រ\s*)(\d{1,4}|[០-៩]{1,4})/iu;
const KHMER_DIGITS = "០១២៣៤៥៦៧៨៩";

export function extractPage(text: string): number | undefined {
  const m = PAGE_RE.exec(text);
  if (!m) return undefined;
  const raw = m[1].replace(/[០-៩]/gu, (d) => String(KHMER_DIGITS.indexOf(d)));
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 && n < 100_000 ? n : undefined;
}

// ── Classifier ────────────────────────────────────────────────────────────────
export interface ClassifyContext {
  /** Slug of the resource the user is currently viewing, if the UI sent one. */
  slug?: string;
  /** Type of that resource. */
  slugType?: "book" | "research" | "publication";
  /** True when the previous assistant turn returned results — makes bare
   *  follow-ups ("the second one?") resolvable without a model. */
  hadResults?: boolean;
}

export function classifyIntent(raw: string, ctx: ClassifyContext = {}): IntentResult {
  const text = raw.trim();
  const lower = normalizeQuery(text);
  const locale = detectLanguage(text);
  const verbosity = detectVerbosity(lower);
  const page = extractPage(text);
  const query = extractQuery(text);
  const base = { locale, verbosity, query, slug: ctx.slug, page };

  // 1. Academic-integrity decline — checked first so it can't be smuggled in
  //    behind a book-search phrasing.
  if (hits(lower, ACADEMIC_MISUSE)) {
    return { ...base, intent: "unsupported", confidence: 0.95 };
  }

  // 2. Greetings / thanks. Short-circuits to a template; a 12-token "hello"
  //    should never cost an embedding + 3 queries + a model call (audit §4.6).
  if (lower.length <= 30 && GREETING_RE.test(lower)) {
    return { ...base, intent: "general_library_question", confidence: 0.95, smalltalk: true };
  }

  // 3. Library facts — highest-value zero-LLM path.
  for (const [topic, words] of FAQ_TOPICS) {
    if (hits(lower, words)) return { ...base, intent: "faq", confidence: 0.9, topic };
  }

  // 4. Context-bound intents (only meaningful when the UI told us what page
  //    the user is on).
  if (ctx.slug) {
    if (hits(lower, RELATED_WORDS)) {
      return { ...base, intent: "related_books", confidence: 0.85 };
    }
    if (hits(lower, DETAIL_WORDS)) {
      return { ...base, intent: "book_detail", confidence: 0.85 };
    }
    if (page !== undefined || hits(lower, PDF_WORDS)) {
      return { ...base, intent: "pdf_question", confidence: 0.8 };
    }
  }
  if (hits(lower, RELATED_WORDS) && hits(lower, BOOK_WORDS)) {
    return { ...base, intent: "related_books", confidence: 0.6 };
  }

  // 5. Content questions about documents — answerable only from page text.
  if (page !== undefined || hits(lower, PDF_WORDS)) {
    return { ...base, intent: "pdf_question", confidence: page !== undefined ? 0.85 : 0.7 };
  }

  // 6. Typed catalog searches. Thesis/post words are checked before book words
  //    because "research book" should go to theses, not the e-book catalog.
  if (hits(lower, THESIS_WORDS)) {
    return { ...base, intent: "thesis_search", confidence: 0.85 };
  }
  if (hits(lower, POST_WORDS)) {
    return { ...base, intent: "post_search", confidence: 0.8 };
  }
  if (hits(lower, BOOK_WORDS)) {
    return { ...base, intent: "book_search", confidence: 0.85 };
  }

  // 7. A bare search verb with a topic and no resource word — "find me
  //    something about memory". Books are the largest collection, so that's
  //    the default pool.
  if (hits(lower, SEARCH_WORDS)) {
    return { ...base, intent: "book_search", confidence: 0.7 };
  }

  // 8. Mentions the library but matched no fact table — needs the model, with
  //    library context.
  if (hits(lower, LIBRARY_WORDS)) {
    return { ...base, intent: "general_library_question", confidence: 0.6 };
  }

  // 9. A bare noun phrase after a results turn is a refinement of it.
  if (ctx.hadResults && lower.split(" ").length <= 6) {
    return { ...base, intent: "book_search", confidence: 0.55 };
  }

  // 10. Everything else: a general question. The model answers it, but tells
  //     the user plainly that it is not library data (§23).
  return { ...base, intent: "general_knowledge", confidence: 0.5 };
}

/** Intents whose answer can come entirely from the database + a template. */
export const ZERO_LLM_INTENTS: ReadonlySet<AIIntent> = new Set<AIIntent>([
  "faq",
  "book_search",
  "thesis_search",
  "post_search",
  "book_detail",
  "related_books",
]);

/** Intents that need document evidence before the model may answer. */
export const RAG_INTENTS: ReadonlySet<AIIntent> = new Set<AIIntent>(["pdf_question"]);
