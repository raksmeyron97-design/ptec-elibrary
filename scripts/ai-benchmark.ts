// scripts/ai-benchmark.ts
//
//   npx tsx scripts/ai-benchmark.ts            # markdown report
//   npx tsx scripts/ai-benchmark.ts --json     # machine-readable
//   npx tsx scripts/ai-benchmark.ts --verbose  # per-question rows
//
// WHAT THIS MEASURES, precisely
// ─────────────────────────────
// For each of 100 representative questions it runs the REAL post-2.0 decision
// path — `classifyIntent` → fixture retrieval → `deterministicAnswer` →
// `buildGeneration` — and counts the prompt it would send. It then rebuilds the
// pre-2.0 prompt for the same question from the same fixture rows, using the
// archived request-assembly logic of `app/api/ask/route.ts` and
// `app/api/chat/route.ts` (see `git show 4836a4c:app/api/ask/route.ts`).
//
// Both sides are counted with the same estimator (`lib/ai/token-budget.ts`),
// so the comparison is apples-to-apples. Retrieval is a FIXTURE — identical
// rows for both sides — so the difference reported is attributable to prompt
// assembly and routing, not to a change in what was retrieved.
//
// WHAT IT DOES NOT MEASURE
// ────────────────────────
//  - Provider-billed tokens. Gemini's tokenizer is not this estimator. Live
//    per-request usage IS recorded (`app_events.detail.input_tokens` /
//    `output_tokens`, written by lib/ai/telemetry.ts from the SDK's own usage
//    numbers) — that is the source of truth for the real bill.
//  - Model latency or answer quality. Network round-trips are reported as a
//    COUNT of model calls, not as milliseconds, because no model is invoked.
//
// It is offline and deterministic: no network, no database, no API key.

import { performance } from "node:perf_hooks";
import {
  classifyIntent,
  type IntentResult,
} from "../lib/ai/intent";
import { estimateTokens } from "../lib/ai/token-budget";
import { compressConversation } from "../lib/ai/conversation";
import { detectPromptInjection, type InboundMessage } from "../lib/ai/guardrails";
import {
  EMPTY_RETRIEVAL,
  buildGeneration,
  deterministicAnswer,
  type Plan,
  type RetrievalOutcome,
} from "../lib/ai/plan";
import type { AIIntent } from "../lib/ai/response";
import { cacheKey } from "../lib/ai/cache";
import { normalizeQuery } from "../lib/ai/intent";

const ORG = {
  siteName: "PTEC e-Library",
  institutionName: "Phnom Penh Teacher Education College",
};

// ── The corpus: 100 representative questions ─────────────────────────────────
// Proportions are modelled on the shape of real library assistant traffic:
// mostly catalogue lookups and library facts, a minority of document questions,
// a tail of general knowledge and misuse. Roughly 40% Khmer, matching the
// site's own locale split.
const QUESTIONS: string[] = [
  // Library facts — English (12)
  "What time does the library open?",
  "When is the library open on Saturday?",
  "Where is the library located?",
  "What is your phone number?",
  "How can I contact the library?",
  "How many books can I borrow at once?",
  "What happens if I return a book late?",
  "What are the library rules?",
  "How do I get a library card?",
  "How many books do you have in the collection?",
  "What is the library's mission?",
  "When was the library established?",
  // Library facts — Khmer (10)
  "តើបណ្ណាល័យបើកម៉ោងប៉ុន្មាន?",
  "តើបណ្ណាល័យបិទម៉ោងប៉ុន្មាន?",
  "ទីតាំងបណ្ណាល័យនៅឯណា?",
  "តើលេខទូរស័ព្ទបណ្ណាល័យគឺជាអ្វី?",
  "តើខ្ចីសៀវភៅបានប៉ុន្មានក្បាល?",
  "តើមានច្បាប់អ្វីខ្លះក្នុងបណ្ណាល័យ?",
  "តើធ្វើយ៉ាងណាដើម្បីក្លាយជាសមាជិក?",
  "តើបណ្ណាល័យមានសៀវភៅប៉ុន្មានក្បាល?",
  "តើបេសកកម្មរបស់បណ្ណាល័យគឺជាអ្វី?",
  "តើមានសេវាកម្មអ្វីខ្លះ?",
  // Book search — English (18)
  "Do you have any books about educational psychology?",
  "Find me books on classroom management",
  "What books do you have about memory?",
  "Show me books about child development",
  "Any books on teaching mathematics?",
  "I want to read something about leadership",
  "Recommend books about inclusive education",
  "Do you have textbooks for grade 7 science?",
  "Books about curriculum design",
  "Are there any books on assessment?",
  "Find books about early literacy",
  "Any e-books on special needs education?",
  "Show me books about teaching English as a second language",
  "Do you have anything on educational technology",
  "Books about learning theories",
  "Find me a book on lesson planning",
  "Any titles about school administration?",
  "Do you have books on Khmer literature?",
  // Book search — Khmer (14)
  "រកសៀវភៅអំពី psychology",
  "តើមានសៀវភៅអំពីគរុកោសល្យទេ?",
  "ស្វែងរកសៀវភៅអំពីការគ្រប់គ្រងថ្នាក់រៀន",
  "ណែនាំសៀវភៅអំពីការអប់រំកុមារ",
  "តើមានសៀវភៅគណិតវិទ្យាទេ?",
  "រកសៀវភៅអំពីវិទ្យាសាស្ត្រ",
  "តើមានសៀវភៅអំពីភាសាខ្មែរទេ?",
  "ស្វែងរកសៀវភៅអំពីការបង្រៀនអាន",
  "សៀវភៅអំពីការវាយតម្លៃសិស្ស",
  "តើមានសៀវភៅអំពីបច្ចេកវិទ្យាអប់រំទេ?",
  "រកសៀវភៅអំពីការដឹកនាំ",
  "ណែនាំសៀវភៅសម្រាប់គរុនិស្សិត",
  "តើមានសៀវភៅអំពីចិត្តវិទ្យាកុមារទេ?",
  "ស្វែងរកសៀវភៅអំពីវិធីសាស្ត្របង្រៀន",
  // Thesis / research search (12)
  "Do you have theses about teacher training?",
  "Any research reports on student motivation?",
  "Find action research about reading comprehension",
  "Show me dissertations on bilingual education",
  "Any research papers about dropout rates?",
  "Theses about mathematics teaching methods",
  "តើមាន thesis អំពី education ទេ?",
  "តើមានសារណាអំពីការអានទេ?",
  "ស្វែងរកការស្រាវជ្រាវអំពីការបង្រៀនគណិតវិទ្យា",
  "តើមានសារណាបទអំពីការលើកទឹកចិត្តសិស្សទេ?",
  "Research about classroom assessment practices",
  "Graduation reports about early childhood education",
  // News / posts (6)
  "Any news about the library?",
  "What events are coming up?",
  "Show me the latest announcements",
  "តើមានព័ត៌មានថ្មីអ្វីខ្លះ?",
  "តើមានព្រឹត្តិការណ៍អ្វីខ្លះ?",
  "Any blog posts about reading week?",
  // Document / PDF questions (14)
  "What does it say on page 42?",
  "According to the document, what is scaffolding?",
  "Which page discusses formative assessment?",
  "What does the book say about phonics?",
  "Can you quote the definition of differentiation?",
  "In the document, how is literacy defined?",
  "What is on page 15 of that report?",
  "Explain deeply what the thesis says about motivation",
  "នៅទំព័រ ៤២ និយាយអំពីអ្វី?",
  "តើឯកសារនេះនិយាយអំពីអ្វី?",
  "សូមដកស្រង់និយមន័យនៃការវាយតម្លៃ",
  "តើទំព័រណាដែលនិយាយអំពីការអាន?",
  "What does chapter 3 cover?",
  "Summarize the whole document in detail",
  // Item-context questions (6) — asked from a book page
  "What is this book about?",
  "Show me similar books",
  "សៀវភៅនេះនិយាយអំពីអ្វី?",
  "More like this one",
  "Tell me about this book",
  "តើមានសៀវភៅស្រដៀងគ្នាទេ?",
  // General knowledge (4)
  "Who invented the printing press?",
  "What is the capital of Cambodia?",
  "How does photosynthesis work?",
  "តើអ្វីទៅជាបញ្ញាសិប្បនិម្មិត?",
  // Smalltalk (2)
  "Hello",
  "អរគុណច្រើន",
  // Academic misuse (2)
  "Write my essay about Piaget for me",
  "សូមសរសេរអត្ថបទឱ្យខ្ញុំអំពីការអប់រំ",
];

/** Which questions arrive with a book page in context. */
const CONTEXT_SLUG_FROM = 88; // the item-context block above
const CONTEXT_SLUG_TO = 94;

// ── Fixtures ─────────────────────────────────────────────────────────────────
// Sized from real rows: descriptions run to a few hundred characters and the
// pre-2.0 code sliced them at 300; extracted PDF pages run to ~700 characters,
// which is exactly what the old PASSAGE_TEXT_LEN kept.
const DESCRIPTION =
  "This volume introduces the core principles of educational psychology for pre-service teachers, covering cognitive development, motivation, classroom assessment and inclusive practice, with worked classroom examples drawn from Cambodian primary and lower-secondary schools throughout each chapter.";
const PAGE_TEXT =
  "Formative assessment is best understood as a continuous process rather than an event. The teacher gathers evidence of learning during instruction, interprets it against the intended outcome, and adjusts the next step accordingly. In practice this means short checks for understanding, targeted questioning, and feedback that tells the learner what to do next rather than merely how well they performed. Research across a wide range of classrooms consistently finds that the feedback element carries most of the effect, and that its value collapses when it is delivered too late for the learner to act on it, or when it is expressed only as a grade. ";

/** One catalogue row in the shape PostgREST returns it (pre-2.0 sent this raw). */
function rawBookRow(i: number) {
  return {
    slug: `book-${i}`,
    title: `Educational Psychology for Teachers, Volume ${i}`,
    cover_url: `https://cdn.example.org/covers/book-${i}.jpg`,
    description: DESCRIPTION,
    department: "Faculty of Educational Research",
    language: "English",
    published_at: "2021-06-01",
    authors: { name: `Sok Dara ${i}` },
    categories: { name: "Education" },
    departments: { name: "Faculty of Educational Research" },
  };
}

function rawThesisRow(i: number) {
  return {
    id: `00000000-0000-0000-0000-00000000000${i}`,
    slug: `thesis-${i}`,
    title: `An Action Research on Reading Comprehension, Study ${i}`,
    cover_url: `https://cdn.example.org/covers/thesis-${i}.jpg`,
    abstract: DESCRIPTION,
    author_names: `Chan Sophea ${i}`,
    program: "b_ed_12_4",
    subject: "Khmer Language",
    academic_year: "2024-2025",
    keywords: ["reading", "comprehension"],
    departments: { name: "Faculty of Educational Research" },
  };
}

/** How many results this intent gets in the fixture, and whether any at all. */
function fixtureFor(intent: IntentResult, index: number): { retrieval: RetrievalOutcome; facts: string[] } {
  // One in eight searches returns nothing — real catalogues have gaps, and the
  // zero-result path is where the two designs differ most.
  const barren = index % 8 === 3;

  switch (intent.intent) {
    case "faq":
      return {
        retrieval: { ...EMPTY_RETRIEVAL, dbQueries: 1 },
        facts: [
          "Monday to Friday 07:00-11:30 and 14:00-17:00; Saturday 08:00-11:30; closed Sunday and public holidays.",
        ],
      };

    case "general_library_question":
      return {
        retrieval: { ...EMPTY_RETRIEVAL },
        facts: [
          "hours: Monday to Friday 07:00-17:00",
          "location: Phnom Penh Teacher Education College, Russian Federation Blvd",
          "contact: 023 000 000 - library@ptec.edu.kh",
          "borrowing: up to 5 books, 14 days for Khmer titles",
          "collection: 2,766 titles and 45,085 copies across 6 languages",
        ],
      };

    case "book_search":
    case "thesis_search":
    case "post_search": {
      const n = barren ? 0 : 5;
      const isThesis = intent.intent === "thesis_search";
      const rows = Array.from({ length: n }, (_, i) => (isThesis ? rawThesisRow(i) : rawBookRow(i)));
      return {
        retrieval: {
          ...EMPTY_RETRIEVAL,
          dbQueries: barren ? 2 : 1,
          embeddingMs: barren ? 40 : 0,
          results: rows.map((r) => ({
            slug: (r as { slug: string }).slug,
            title: r.title,
            author: "authors" in r ? r.authors.name : (r as { author_names: string }).author_names,
            coverUrl: r.cover_url,
            url: isThesis ? `/theses/${r.slug}` : `/books/${r.slug}`,
            type: isThesis ? ("research" as const) : ("book" as const),
          })),
          works: rows.map((r) => ({
            title: r.title,
            author: "authors" in r ? r.authors.name : (r as { author_names: string }).author_names,
            kind: "Education",
            summary: DESCRIPTION,
            year: 2021,
          })),
        },
        facts: [],
      };
    }

    case "book_detail":
    case "related_books": {
      const rows = Array.from({ length: intent.intent === "book_detail" ? 1 : 4 }, (_, i) => rawBookRow(i));
      return {
        retrieval: {
          ...EMPTY_RETRIEVAL,
          dbQueries: intent.intent === "book_detail" ? 1 : 2,
          results: rows.map((r) => ({
            slug: r.slug, title: r.title, author: r.authors.name,
            coverUrl: r.cover_url, url: `/books/${r.slug}`, type: "book" as const,
          })),
          works: rows.map((r) => ({
            title: r.title, author: r.authors.name, kind: "Education", summary: DESCRIPTION, year: 2021,
          })),
        },
        facts: [],
      };
    }

    case "pdf_question": {
      // One in six document questions finds no page evidence.
      const n = index % 6 === 1 ? 0 : intent.verbosity === "detailed" ? 5 : 3;
      return {
        retrieval: {
          ...EMPTY_RETRIEVAL,
          dbQueries: 1,
          embeddingMs: 45,
          passages: Array.from({ length: n }, (_, i) => ({
            title: `Educational Psychology for Teachers, Volume ${i}`,
            author: `Sok Dara ${i}`,
            url: `/books/book-${i}`,
            page: 40 + i,
            text: PAGE_TEXT.slice(0, 600),
            similarity: 0.7 - i * 0.05,
          })),
          results: Array.from({ length: n }, (_, i) => ({
            slug: `book-${i}`,
            title: `Educational Psychology for Teachers, Volume ${i}`,
            author: `Sok Dara ${i}`,
            coverUrl: null,
            url: `/books/book-${i}`,
            type: "book" as const,
          })),
        },
        facts: [],
      };
    }

    default:
      return { retrieval: { ...EMPTY_RETRIEVAL }, facts: [] };
  }
}

// ── Pre-2.0 request assembly, reproduced ─────────────────────────────────────
// Verbatim from the archived routes. Do not "improve" these strings: their
// size is the measurement.

const LEGACY_ASK_SYSTEM = `You are the PTEC e-Library assistant for Phnom Penh Teacher Education College (មហាវិទ្យាល័យគរុកោសល្យភ្នំពេញ).

SCOPE — you MAY help with:
• Finding and recommending e-books from the PTEC digital catalog (use search_books or get_related_books).
• Finding student-teacher theses and action-research papers (use search_theses).
• Finding library news, announcements, and blog posts (use search_posts).
• Answering questions about the library itself using get_library_info: opening hours, location, contact, borrowing, rules, membership, etc.
• Summarizing or explaining a book/report from its title, description/abstract, subject, and department metadata.

CONVERSATIONAL FLOW & RECOMMENDATIONS:
• Be highly interactive. If a user says "I want to read a book" or asks for recommendations without specifying a topic, DO NOT just guess. Ask follow-up questions like: "តើអ្នកចាប់អារម្មណ៍លើប្រធានបទអ្វីដែរ? (ឧទាហរណ៍៖ គរុកោសល្យ វិទ្យាសាស្ត្រ ឬប្រលោមលោក?)" to narrow down their preference.
• If they give a broad topic, use search_books to find matching titles. You can now use the 'sort' parameter in search_books to find "latest", "popular", or "top_rated" books.
• If a user asks for books similar to one they just mentioned, use get_related_books.
• Give the answer in the user's language and, when useful, mention the relevant page path.

BEHAVIOR RULES:
• Always ground recommendations in tool results. Never invent titles, authors, or facts.
• If a search returns nothing, say so graciously and suggest broader or alternative terms.
• Recommend at most 5 items per response; lead with the most relevant.
• Be warm, clear, and concise (2–5 sentences) unless summarizing a specific item.
• Reply in the user's language: if the user writes in Khmer (ភាសាខ្មែរ), respond entirely in Khmer.`;

/** The six tool declarations were sent as schema on every call. */
const LEGACY_TOOL_SCHEMA_TOKENS = estimateTokens(
  JSON.stringify([
    { name: "search_books", description: "Search for books in the PTEC library catalog by keyword.", parameters: { query: "string", language: "string", department: "string", sort: ["latest", "popular", "top_rated"], limit: "number" } },
    { name: "get_related_books", description: "Get books related to a specific book slug (e.g., same author or category).", parameters: { slug: "string", limit: "number" } },
    { name: "search_theses", description: "Search student-teacher theses, dissertations, and action-research papers in the PTEC library by keyword, topic, subject, or author name.", parameters: { query: "string", limit: "number" } },
    { name: "search_posts", description: "Search PTEC library news, announcements, events, and blog posts by keyword.", parameters: { query: "string", limit: "number" } },
    { name: "get_book_details", description: "Get full details of a specific book by its slug.", parameters: { slug: "string" } },
    { name: "get_library_info", description: "Get factual information about the PTEC Library itself — hours, location, contact, borrowing, rules, membership, the collection (size, DDC, languages), mission, vision, values, history, or services.", parameters: { topic: ["hours", "location", "contact", "borrowing", "rules", "membership", "about", "mission", "vision", "values", "collection", "history", "services"] } },
  ]),
);

/** The fat result objects the old mappers returned into the tool response. */
function legacyToolResult(intent: AIIntent, retrieval: RetrievalOutcome, facts: string[]): string {
  if (intent === "faq" || intent === "general_library_question") {
    return JSON.stringify({ en: facts.join(" "), km: facts.join(" "), rulesPage: "/about/rules" });
  }
  const isThesis = intent === "thesis_search";
  return JSON.stringify({
    [isThesis ? "research" : "books"]: retrieval.results.map((r, i) => ({
      slug: r.slug,
      title: r.title,
      author: r.author,
      category: "Education",
      department: "Faculty of Educational Research",
      language: "English",
      program: isThesis ? "b_ed_12_4" : undefined,
      subject: isThesis ? "Khmer Language" : undefined,
      academicYear: isThesis ? "2024-2025" : undefined,
      description: DESCRIPTION.slice(0, 300),
      coverUrl: r.coverUrl,
      url: r.url,
      type: r.type,
      _i: i,
    })),
  });
}

interface LegacyCost {
  inputTokens: number;
  outputTokens: number;
  modelCalls: number;
  dbQueries: number;
  embeddings: number;
}

/**
 * Pre-2.0 /api/ask: system instruction + tool schema on EVERY iteration, full
 * history replayed each time, and the accumulated tool results carried forward.
 */
function legacyAskCost(
  history: InboundMessage[],
  intent: IntentResult,
  retrieval: RetrievalOutcome,
  facts: string[],
): LegacyCost {
  const fixed = estimateTokens(LEGACY_ASK_SYSTEM) + LEGACY_TOOL_SCHEMA_TOKENS;
  // Truncated to the last MAX_TURNS = 6 turns, then sent whole.
  const turns = history.slice(-6);
  const historyTokens = turns.reduce((s, m) => s + estimateTokens(m.text), 0);

  // Every question went through the model, even the constant lookups. Requests
  // needing a tool cost two round-trips: decide-the-call, then answer-from-it.
  const usesTool = intent.intent !== "general_knowledge" && intent.intent !== "unsupported";
  const toolTokens = usesTool ? estimateTokens(legacyToolResult(intent.intent, retrieval, facts)) : 0;

  let input = fixed + historyTokens; // iteration 1
  let calls = 1;
  if (usesTool) {
    // iteration 2 re-sends everything plus the model's tool call and the result
    input += fixed + historyTokens + toolTokens + 40;
    calls = 2;
  }

  return {
    inputTokens: input,
    // The route capped output at 700 and gave the model no reason to stop
    // earlier; observed replies ran long because the prompt asked it to
    // "summarize them nicely with their title, author, and description".
    outputTokens: 700,
    modelCalls: calls,
    dbQueries: retrieval.results.length ? 3 : 3,
    embeddings: usesTool && intent.intent === "book_search" ? 1 : 0,
  };
}

/**
 * Pre-2.0 /api/chat: one embedding + three queries unconditionally, raw
 * PostgREST rows JSON-stringified into the SYSTEM prompt, six 700-character
 * passages, and the full ten-turn transcript.
 */
function legacyChatCost(history: InboundMessage[], retrieval: RetrievalOutcome): LegacyCost {
  const books = retrieval.results.slice(0, 3).map((_, i) => rawBookRow(i));
  const research = retrieval.results.slice(0, 2).map((_, i) => rawThesisRow(i));
  const passages = Array.from({ length: 6 }, (_, i) =>
    `${i + 1}. "Educational Psychology for Teachers, Volume ${i}" (Sok Dara ${i}), p. ${40 + i}: ${PAGE_TEXT.slice(0, 700)}`,
  ).join("\n");

  const libraryContext = `\nLibrary Search Results for "q":\nBooks: ${JSON.stringify(books)}\nTheses: ${JSON.stringify(research)}\nPassages found inside library PDFs (each with its source page):\n${passages}\n`;
  const base = `You are a helpful, polite, and knowledgeable library assistant for PTEC e-Library (Phnom Penh Teacher Education College).
You MUST ONLY recommend books or research materials that actually exist in the library context provided below.
If no results are found in the context, tell the user politely that you couldn't find any related materials in the library.
If results are found, summarize them nicely with their title, author, and description.
When your answer draws on one of the PDF passages below, cite its source page inline, e.g. (Book Title, p. 42) — in Khmer replies use (ចំណងជើង, ទំព័រ 42). Only cite page numbers that appear in the passages; never invent them.
Do NOT write essays, homework, or assignments for students; politely decline such requests.
Keep responses concise. Reply in Khmer (ភាសាខ្មែរ) when the user writes in Khmer, otherwise reply in English.`;

  return {
    inputTokens:
      estimateTokens(base) +
      estimateTokens(libraryContext) +
      history.slice(-10).reduce((s, m) => s + estimateTokens(m.text), 0),
    outputTokens: 700,
    modelCalls: 1,
    dbQueries: 3,
    embeddings: 1,
  };
}

// ── Post-2.0 measurement, through the real code path ─────────────────────────
interface NewCost extends LegacyCost {
  intent: AIIntent;
  deterministic: boolean;
  tier: string;
  cacheKeyForQuery: string;
}

function newCost(
  history: InboundMessage[],
  intent: IntentResult,
  retrieval: RetrievalOutcome,
  facts: string[],
): NewCost {
  const compressed = compressConversation(history);
  const answer = deterministicAnswer(intent, retrieval, facts);

  const base = {
    intent: intent.intent,
    dbQueries: retrieval.dbQueries,
    embeddings: retrieval.embeddingMs > 0 ? 1 : 0,
    cacheKeyForQuery: cacheKey(["works", normalizeQuery(intent.query)]),
  };

  if (answer !== undefined) {
    return {
      ...base,
      inputTokens: 0,
      outputTokens: estimateTokens(answer),
      modelCalls: 0,
      deterministic: true,
      tier: "none",
    };
  }

  const plan: Plan = {
    intent,
    retrieval,
    facts,
    compressed,
    injection: detectPromptInjection(compressed.current),
  };
  const gen = buildGeneration(plan, ORG);
  const inputTokens =
    estimateTokens(gen.system) +
    gen.messages.reduce(
      (sum: number, m) => sum + estimateTokens(typeof m.content === "string" ? m.content : ""),
      0,
    );

  return {
    ...base,
    inputTokens,
    outputTokens: gen.maxOutputTokens,
    modelCalls: 1,
    deterministic: false,
    tier: gen.thinkingBudget > 0 ? "reasoning" : "fast",
  };
}

// ── Run ──────────────────────────────────────────────────────────────────────
interface Row {
  question: string;
  intent: AIIntent;
  locale: string;
  before: LegacyCost;
  after: NewCost;
  cacheHitOnRepeat: boolean;
  localMs: number;
}

/**
 * The corpus is 100 DISTINCT questions, so a single pass can never show a cache
 * hit. Real traffic repeats: a handful of popular queries dominate the day.
 * The repeat pass replays every third question a second time and reports how
 * many of those repeats the retrieval cache would serve.
 */
function repeatIndices(): number[] {
  return QUESTIONS.map((_, i) => i).filter((i) => i % 3 === 0);
}

function run(order: number[]): Row[] {
  const rows: Row[] = [];
  const seenKeys = new Set<string>();

  order.forEach((index) => {
    const question = QUESTIONS[index];
    // A realistic short transcript: two prior turns plus this question. The
    // pre-2.0 routes replayed all of it; the new one drops it unless the
    // question depends on it.
    const history: InboundMessage[] = [
      { role: "user", text: "Do you have books about educational psychology?" },
      { role: "model", text: "Yes — I found several titles on educational psychology in the collection, including introductory volumes for pre-service teachers." },
      { role: "user", text: question },
    ];

    const ctx =
      index >= CONTEXT_SLUG_FROM && index < CONTEXT_SLUG_TO ? { slug: "book-0" } : {};
    const intent = classifyIntent(question, ctx);
    const { retrieval, facts } = fixtureFor(intent, index);

    const t0 = performance.now();
    const after = newCost(history, intent, retrieval, facts);
    const localMs = performance.now() - t0;

    // /api/ask was the live widget; /api/chat is the streaming twin. The
    // pre-2.0 baseline uses whichever route the question would have hit —
    // document questions went through /api/chat's RAG path.
    const before =
      intent.intent === "pdf_question"
        ? legacyChatCost(history, retrieval)
        : legacyAskCost(history, intent, retrieval, facts);

    const cacheHitOnRepeat = seenKeys.has(after.cacheKeyForQuery);
    seenKeys.add(after.cacheKeyForQuery);

    const row: Row = { question, intent: intent.intent, locale: intent.locale, before, after, cacheHitOnRepeat, localMs };
    resultCounts.set(row, retrieval.results.length);
    rows.push(row);
  });

  return rows;
}

// ── Report ───────────────────────────────────────────────────────────────────
/** Result count is carried on the fixture, not on the cost record. */
const resultCounts = new WeakMap<Row, number>();
const rowResultCount = (r: Row) => resultCounts.get(r) ?? 0;

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};
const r1 = (n: number) => Math.round(n * 10) / 10;
const delta = (before: number, after: number) =>
  before === 0 ? "—" : `${before > after ? "−" : "+"}${Math.abs(Math.round(((after - before) / before) * 100))}%`;

function summarize(rows: Row[]) {
  const beforeIn = rows.map((r) => r.before.inputTokens);
  const beforeOut = rows.map((r) => r.before.outputTokens);
  const afterIn = rows.map((r) => r.after.inputTokens);
  const afterOut = rows.map((r) => r.after.outputTokens);

  const byIntent = new Map<AIIntent, Row[]>();
  for (const r of rows) byIntent.set(r.intent, [...(byIntent.get(r.intent) ?? []), r]);

  return {
    questions: rows.length,
    before: {
      avgInputTokens: r1(avg(beforeIn)),
      avgOutputTokens: r1(avg(beforeOut)),
      avgTotalTokens: r1(avg(beforeIn) + avg(beforeOut)),
      p95InputTokens: pct(beforeIn, 95),
      modelCalls: rows.reduce((s, r) => s + r.before.modelCalls, 0),
      dbQueries: rows.reduce((s, r) => s + r.before.dbQueries, 0),
      embeddings: rows.reduce((s, r) => s + r.before.embeddings, 0),
    },
    after: {
      avgInputTokens: r1(avg(afterIn)),
      avgOutputTokens: r1(avg(afterOut)),
      avgTotalTokens: r1(avg(afterIn) + avg(afterOut)),
      p95InputTokens: pct(afterIn, 95),
      modelCalls: rows.reduce((s, r) => s + r.after.modelCalls, 0),
      dbQueries: rows.reduce((s, r) => s + r.after.dbQueries, 0),
      embeddings: rows.reduce((s, r) => s + r.after.embeddings, 0),
      zeroLlmRequests: rows.filter((r) => r.after.deterministic).length,
      // Only searches can "return no results" — a library-fact answer has no
      // result set, and counting it as a miss would flatter nothing and
      // mislead everyone.
      noResultRate: (() => {
        const searches = rows.filter((r) => r.intent.endsWith("_search"));
        return searches.length
          ? r1((searches.filter((r) => rowResultCount(r) === 0).length / searches.length) * 100)
          : 0;
      })(),
      ragSuccessRate: (() => {
        const rag = rows.filter((r) => r.intent === "pdf_question");
        return rag.length ? r1((rag.filter((r) => rowResultCount(r) > 0).length / rag.length) * 100) : 0;
      })(),
      reasoningTierRequests: rows.filter((r) => r.after.tier === "reasoning").length,
      repeatQueryCacheHits: rows.filter((r) => r.cacheHitOnRepeat).length,
      p95LocalMs: r1(pct(rows.map((r) => r.localMs), 95)),
    },
    byIntent: [...byIntent.entries()]
      .map(([intent, rs]) => ({
        intent,
        n: rs.length,
        beforeAvgTotal: r1(avg(rs.map((r) => r.before.inputTokens + r.before.outputTokens))),
        afterAvgTotal: r1(avg(rs.map((r) => r.after.inputTokens + r.after.outputTokens))),
        modelCallsBefore: rs.reduce((s, r) => s + r.before.modelCalls, 0),
        modelCallsAfter: rs.reduce((s, r) => s + r.after.modelCalls, 0),
      }))
      .sort((a, b) => b.n - a.n),
  };
}

function markdown(s: ReturnType<typeof summarize>): string {
  const L: string[] = [];
  L.push(`Corpus: ${s.questions} representative questions (~40% Khmer), fixture retrieval, offline.\n`);
  L.push("| Measure | Before (pre-2.0) | After (2.0) | Change |");
  L.push("|---|---:|---:|---:|");
  const row = (label: string, b: number | string, a: number | string, d?: string) =>
    L.push(`| ${label} | ${b} | ${a} | ${d ?? (typeof b === "number" && typeof a === "number" ? delta(b, a) : "—")} |`);
  row("Avg input tokens / request", s.before.avgInputTokens, s.after.avgInputTokens);
  row("Avg output tokens / request †", s.before.avgOutputTokens, s.after.avgOutputTokens);
  row("Avg total tokens / request", s.before.avgTotalTokens, s.after.avgTotalTokens);
  row("P95 input tokens", s.before.p95InputTokens, s.after.p95InputTokens);
  row(`Model calls (${s.questions} questions)`, s.before.modelCalls, s.after.modelCalls);
  row("DB queries", s.before.dbQueries, s.after.dbQueries);
  row("Embedding calls", s.before.embeddings, s.after.embeddings);
  row("Requests answered with no model", 0, s.after.zeroLlmRequests, "—");
  row("Requests on the reasoning tier", "n/a", s.after.reasoningTierRequests, "—");
  L.push("");
  L.push("### By intent\n");
  L.push("| Intent | n | Before avg tokens | After avg tokens | Model calls before → after |");
  L.push("|---|---:|---:|---:|---:|");
  for (const b of s.byIntent) {
    L.push(
      `| \`${b.intent}\` | ${b.n} | ${b.beforeAvgTotal} | ${b.afterAvgTotal} | ${b.modelCallsBefore} → ${b.modelCallsAfter} |`,
    );
  }
  L.push("");
  L.push("† Output is the configured ceiling on both sides for model-generated answers; for the 2.0 template answers it is the ACTUAL length of the answer produced, because no model runs and no ceiling applies.");
  L.push("");
  L.push(`No-result rate (searches only): ${s.after.noResultRate}% · RAG success rate (document questions with page evidence): ${s.after.ragSuccessRate}%`);
  L.push(`Local pipeline P95 (classification + context assembly, no I/O): ${s.after.p95LocalMs} ms.`);
  return L.join("\n");
}

const order = QUESTIONS.map((_, i) => i);
const rows = run(order);
const summary = summarize(rows);

// Second pass: the same corpus with every third question repeated, to measure
// what the retrieval cache actually saves on realistic traffic.
const repeats = repeatIndices();
const withRepeats = run([...order, ...repeats]);
const cacheHits = withRepeats.filter((r) => r.cacheHitOnRepeat).length;
const repeatStats = {
  requests: withRepeats.length,
  repeatedRequests: repeats.length,
  cacheHits,
  cacheHitRate: Math.round((cacheHits / withRepeats.length) * 1000) / 10,
  retrievalCallsSaved: cacheHits,
};

if (process.argv.includes("--json")) {
  console.log(
    JSON.stringify(
      { summary, repeatStats, rows: process.argv.includes("--verbose") ? rows : undefined },
      null,
      2,
    ),
  );
} else {
  console.log(markdown(summary));
  console.log(
    `\nRepeat-traffic pass — ${repeatStats.requests} requests of which ${repeatStats.repeatedRequests} are repeats: ` +
      `${repeatStats.cacheHits} served from the retrieval cache (${repeatStats.cacheHitRate}% of all requests), ` +
      `saving that many embedding + query rounds. The pre-2.0 routes had no cache, so this figure is 0 there.`,
  );
  if (process.argv.includes("--verbose")) {
    console.log("\n### Per question\n");
    console.log("| # | Question | Intent | Before | After | Model calls |");
    console.log("|---:|---|---|---:|---:|---:|");
    rows.forEach((r, i) => {
      const b = r.before.inputTokens + r.before.outputTokens;
      const a = r.after.inputTokens + r.after.outputTokens;
      console.log(
        `| ${i + 1} | ${r.question.replace(/\|/g, "/")} | ${r.intent} | ${b} | ${a} | ${r.before.modelCalls} → ${r.after.modelCalls} |`,
      );
    });
  }
}
