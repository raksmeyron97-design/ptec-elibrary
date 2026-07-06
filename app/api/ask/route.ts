// app/api/ask/route.ts
// PTEC Library AI assistant — Gemini tool-loop, non-streaming.
// GEMINI_API_KEY is server-side only — never exposed to client bundles.

import { GoogleGenAI, Content, FunctionDeclaration } from "@google/genai";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { LIBRARY_INFO, LibraryInfoTopic } from "@/lib/library-info";
import type { AppRole } from "@/lib/types/roles";
import { ADMIN_PANEL_ROLES } from "@/lib/types/roles";
import { generateEmbedding } from "@/lib/gemini-embeddings";
export const runtime = "nodejs";

// ── Cost-control constants ────────────────────────────────────────────────────
const DAILY_USER_LIMIT   = 10;   // per-user messages/day (Asia/Phnom_Penh date)
const DAILY_GLOBAL_LIMIT = 500;  // total messages/day across all users
const COOLDOWN_MS        = 5_000; // min ms between accepted requests per user
const MAX_OUTPUT_TOKENS  = 700;  // hard cap on Gemini response length
const MAX_TURNS          = 6;    // max conversation turns sent to Gemini

// Sentinel UUID for the global circuit breaker row in ai_usage.
// This is not a real user — it tracks total daily requests across all users.
const GLOBAL_SENTINEL = "00000000-0000-0000-0000-000000000000";

const MODEL = "gemini-3.5-flash";

// Public covers CDN — research/post covers are stored as R2 keys and need this prefix.
const COVERS_URL = process.env.NEXT_PUBLIC_R2_COVERS_URL ?? "";

// ── In-memory cooldown tracker (per-user, resets on cold start — that's OK) ──
// Daily quota is NOT in-memory; it lives in Supabase.
const cooldownMap = new Map<string, number>();

// ── Types ─────────────────────────────────────────────────────────────────────
interface InboundMessage {
  role: "user" | "model";
  text: string;
}

type ResultKind = "book" | "research" | "post";

// A single result card shown in the widget. `slug` is only a stable React key;
// `url` is the real destination so books, research reports, and posts each link
// to their correct route.
interface BookResult {
  slug: string;
  title: string;
  author: string;
  coverUrl: string | null;
  url: string;
  type: ResultKind;
}

// Strip PostgREST filter metacharacters so a model-supplied query can't break
// out of the `.or(...)` / `.ilike(...)` filter strings.
function sanitizeQuery(raw: string): string {
  return raw
    .replace(/[%,()\\*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

// Book covers are stored as full URLs; research/post covers may be bare R2 keys.
function coverUrlOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw.startsWith("http") ? raw : `${COVERS_URL}/${raw}`;
}

// ── Gemini client ─────────────────────────────────────────────────────────────
function getAI() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not configured on the server.");
  return new GoogleGenAI({ apiKey: key });
}

// ── System instruction ────────────────────────────────────────────────────────
const SYSTEM_INSTRUCTION = `You are the PTEC Library assistant for Phnom Penh Teacher Education College (វិទ្យាស្ថានគរុកោសល្យរាជធានីភ្នំពេញ).

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

// ── Supabase book search ──────────────────────────────────────────────────────
async function searchBooks(args: {
  query: string;
  language?: string;
  department?: string;
  sort?: "latest" | "popular" | "top_rated";
  limit?: number;
}): Promise<BookResult[]> {
  const db = createServiceClient();
  const limit = Math.min(args.limit ?? 5, 8);
  const q = sanitizeQuery(args.query);
  if (!q) return [];

  // Try Semantic Search first
  try {
    const queryEmbedding = await generateEmbedding(args.query);
    const { data: vectorResults, error: vectorError } = await db.rpc("match_books", {
      query_embedding: queryEmbedding,
      match_threshold: 0.2, // Adjust based on sensitivity needed
      match_count: limit,
    });

    if (!vectorError && vectorResults && vectorResults.length > 0) {
      // If we got results, map them. We might need to filter by language/department manually or in RPC.
      // For simplicity, we filter the returned results here.
      let filtered = (vectorResults as any[]).filter(b => b.slug);
      if (args.language) filtered = filtered.filter(b => b.language === args.language);
      if (args.department) filtered = filtered.filter(b => b.department === args.department);

      return filtered.slice(0, limit).map((b: any) => ({
        slug: b.slug,
        title: b.title,
        author: b.author_name ?? "Unknown",
        category: b.category_name ?? "",
        department: b.department ?? "",
        language: b.language ?? "",
        description: String(b.description ?? "").slice(0, 300),
        coverUrl: coverUrlOf(b.cover_url),
        url: `/books/${b.slug}`,
        type: "book" as const,
      }));
    }
  } catch (err) {
    console.warn("[/api/ask] Semantic search failed, falling back to keyword search:", err);
  }

  // Fallback to Keyword Search
  let query = db
    .from("books")
    .select("slug, title, cover_url, description, department, language, authors(name), categories(name)")
    .eq("is_published", true)
    .or(`title.ilike.%${q}%,description.ilike.%${q}%`);

  if (args.sort === "latest") {
    query = query.order("published_at", { ascending: false });
  } else if (args.sort === "top_rated") {
    query = query.order("rating", { ascending: false });
  } else {
    query = query.order("download_count", { ascending: false });
  }
  query = query.limit(limit);

  if (args.language) query = query.eq("language", args.language);
  if (args.department) query = query.eq("department", args.department);

  const { data: primary } = await query;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: any[] = (primary ?? []) as any[];

  if (results.length < 3) {
    const { data: authorBooks } = await db
      .from("books")
      .select("slug, title, cover_url, description, department, language, authors!inner(name), categories(name)")
      .eq("is_published", true)
      .ilike("authors.name", `%${q}%`)
      .order("download_count", { ascending: false })
      .limit(limit);

    const { data: catBooks } = await db
      .from("books")
      .select("slug, title, cover_url, description, department, language, authors(name), categories!inner(name)")
      .eq("is_published", true)
      .ilike("categories.name", `%${q}%`)
      .order("download_count", { ascending: false })
      .limit(limit);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extra: any[] = [...(authorBooks ?? []), ...(catBooks ?? [])] as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seen = new Set(results.map((b: any) => b.slug as string));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const b of extra as any[]) {
      if (!seen.has(b.slug as string)) {
        seen.add(b.slug as string);
        results.push(b);
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return results.slice(0, limit).map((b: any) => ({
    slug: b.slug,
    title: b.title,
    author: b.authors?.name ?? "Unknown",
    category: b.categories?.name ?? "",
    department: b.department ?? "",
    language: b.language ?? "",
    description: String(b.description ?? "").slice(0, 300),
    coverUrl: coverUrlOf(b.cover_url),
    url: `/books/${b.slug}`,
    type: "book" as const,
  }));
}

// ── Related books search ──────────────────────────────────────────────────────
async function getRelatedBooks(args: {
  slug: string;
  limit?: number;
}): Promise<BookResult[]> {
  const db = createServiceClient();
  const limit = Math.min(args.limit ?? 4, 6);

  const { data: book } = await db
    .from("books")
    .select("id, slug, categories(name), authors(name)")
    .eq("slug", args.slug)
    .single();

  if (!book) return [];

  const categoryName = (book as any).categories?.name;
  const authorName = (book as any).authors?.name;

  let query = db
    .from("books")
    .select("slug, title, cover_url, description, department, language, authors(name), categories(name)")
    .eq("is_published", true)
    .neq("slug", args.slug)
    .order("download_count", { ascending: false })
    .limit(limit);

  if (categoryName && authorName) {
    query = query.or(`categories.name.ilike.%${categoryName}%,authors.name.ilike.%${authorName}%`);
  } else if (categoryName) {
    query = query.eq("categories.name", categoryName);
  } else if (authorName) {
    query = query.eq("authors.name", authorName);
  }

  const { data } = await query;
  return ((data ?? []) as any[]).map((b: any) => ({
    slug: b.slug,
    title: b.title,
    author: b.authors?.name ?? "Unknown",
    category: b.categories?.name ?? "",
    department: b.department ?? "",
    language: b.language ?? "",
    description: String(b.description ?? "").slice(0, 300),
    coverUrl: coverUrlOf(b.cover_url),
    url: `/books/${b.slug}`,
    type: "book" as const,
  }));
}

// ── Thesis search ──────────────────────────────────────────────────────────────
async function searchTheses(args: {
  query: string;
  limit?: number;
}): Promise<BookResult[]> {
  const db = createServiceClient();
  const limit = Math.min(args.limit ?? 4, 6);
  const q = sanitizeQuery(args.query);
  if (!q) return [];

  const { data } = await db
    .from("research_reports")
    .select("id, slug, title, cover_url, abstract, author_names, program, subject, academic_year, keywords")
    .eq("is_published", true)
    .or(`title.ilike.%${q}%,abstract.ilike.%${q}%,author_names.ilike.%${q}%`)
    .order("view_count", { ascending: false })
    .limit(limit);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r: any) => ({
    slug: r.slug ?? r.id,
    title: r.title,
    author: r.author_names ?? "Unknown",
    program: r.program ?? "",
    subject: r.subject ?? "",
    academicYear: r.academic_year ?? "",
    description: String(r.abstract ?? "").slice(0, 300),
    coverUrl: coverUrlOf(r.cover_url),
    url: `/theses/${r.slug ?? r.id}`,
    type: "research" as const,
  }));
}

// ── Post / news search ────────────────────────────────────────────────────────
async function searchPosts(args: {
  query: string;
  limit?: number;
}): Promise<BookResult[]> {
  const db = createServiceClient();
  const limit = Math.min(args.limit ?? 4, 6);
  const q = sanitizeQuery(args.query);
  if (!q) return [];

  const { data } = await db
    .from("posts")
    .select("id, slug, title, cover_url, excerpt, category, created_at")
    .eq("is_published", true)
    .or(`title.ilike.%${q}%,excerpt.ilike.%${q}%`)
    .order("created_at", { ascending: false })
    .limit(limit);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r: any) => ({
    slug: r.slug,
    title: r.title,
    author: r.category ?? "News",
    category: r.category ?? "News",
    description: String(r.excerpt ?? "").slice(0, 200),
    coverUrl: coverUrlOf(r.cover_url),
    url: `/posts/${r.slug}`,
    type: "post" as const,
  }));
}

async function getBookDetails(args: { slug: string }): Promise<Record<string, unknown>> {
  const db = createServiceClient();
  const { data } = await db
    .from("books")
    .select("slug, title, description, department, language, pages, rating, authors(name), categories(name)")
    .eq("slug", args.slug)
    .eq("is_published", true)
    .single();

  if (!data) return { error: "Book not found." };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = data as any;
  return {
    slug: b.slug,
    title: b.title,
    author: b.authors?.name ?? "Unknown",
    category: b.categories?.name ?? "",
    department: b.department ?? "",
    language: b.language ?? "",
    pages: b.pages,
    rating: b.rating,
    description: b.description ?? "",
    bookUrl: `/books/${b.slug}`,
  };
}

function getLibraryInfo(args: { topic: LibraryInfoTopic }): Record<string, unknown> {
  const L = LIBRARY_INFO;
  switch (args.topic) {
    case "hours":      return { en: L.hours.en, km: L.hours.km, timingsPage: L.links.timings };
    case "location":   return { en: L.location.en, km: L.location.km, phone: L.phone, email: L.email };
    case "contact":    return { phone: L.phone, email: L.email, website: L.website, en: L.location.en };
    case "borrowing":  return { en: L.borrowing.en, km: L.borrowing.km, rulesPage: L.links.rules };
    case "rules":      return { en: L.rules.en, km: L.rules.km, rulesPage: L.links.rules };
    case "membership": return { en: L.membership.en, km: L.membership.km, rulesPage: L.links.rules };
    case "about":      return { en: L.about.en, km: L.about.km, aboutPage: L.links.about };
    case "mission":    return { en: L.mission.en, km: L.mission.km };
    case "vision":     return { en: L.vision.en, km: L.vision.km };
    case "values":     return { en: L.values.en, km: L.values.km };
    case "collection": return { en: L.collection.en, km: L.collection.km, collectionPage: L.links.collection };
    case "history":    return { en: L.history.en, km: L.history.km, journeyPage: L.links.journey };
    case "services":   return { en: L.services.en, km: L.services.km };
    default:           return { error: "Unknown topic." };
  }
}

// ── Tool declarations ─────────────────────────────────────────────────────────
const toolDeclarations: FunctionDeclaration[] = [
  {
    name: "search_books",
    description: "Search for books in the PTEC library catalog by keyword.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        query:      { type: "string", description: "Search term — title, topic, author, or category." },
        language:   { type: "string", description: "Filter by language, e.g. 'English' or 'Khmer'." },
        department: { type: "string", description: "Filter by department or faculty." },
        sort:       { type: "string", enum: ["latest", "popular", "top_rated"], description: "Sort order for the results." },
        limit:      { type: "number", description: "Max number of results (1–8)." },
      },
      required: ["query"],
    },
  },
  {
    name: "get_related_books",
    description: "Get books related to a specific book slug (e.g., same author or category).",
    parametersJsonSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "The slug of the book to find related books for." },
        limit: { type: "number", description: "Max number of results (1–6)." },
      },
      required: ["slug"],
    },
  },
  {
    name: "search_theses",
    description: "Search student-teacher theses, dissertations, and action-research papers in the PTEC library by keyword, topic, subject, or author name.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search term — research topic, subject, title, or author." },
        limit: { type: "number", description: "Max number of results (1–6)." },
      },
      required: ["query"],
    },
  },
  {
    name: "search_posts",
    description: "Search PTEC library news, announcements, events, and blog posts by keyword.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search term — a topic, event, or keyword." },
        limit: { type: "number", description: "Max number of results (1–6)." },
      },
      required: ["query"],
    },
  },
  {
    name: "get_book_details",
    description: "Get full details of a specific book by its slug.",
    parametersJsonSchema: {
      type: "object",
      properties: { slug: { type: "string", description: "The book's URL slug." } },
      required: ["slug"],
    },
  },
  {
    name: "get_library_info",
    description: "Get factual information about the PTEC Library itself — hours, location, contact, borrowing, rules, membership, the collection (size, DDC, languages), mission, vision, values, history, or services.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          enum: [
            "hours", "location", "contact", "borrowing", "rules", "membership",
            "about", "mission", "vision", "values", "collection", "history", "services",
          ],
          description: "The topic to retrieve information about.",
        },
      },
      required: ["topic"],
    },
  },
];

// ── Execute a single tool call ────────────────────────────────────────────────
async function executeFunction(
  name: string,
  args: Record<string, unknown>
): Promise<{ result: Record<string, unknown>; books: BookResult[] }> {
  let result: Record<string, unknown>;
  let books: BookResult[] = [];

  if (name === "search_books") {
    const found = await searchBooks(args as Parameters<typeof searchBooks>[0]);
    books = found;
    result = { books: found };
  } else if (name === "search_theses") {
    const found = await searchTheses(args as Parameters<typeof searchTheses>[0]);
    books = found;
    result = { research: found };
  } else if (name === "get_related_books") {
    const found = await getRelatedBooks(args as Parameters<typeof getRelatedBooks>[0]);
    books = found;
    result = { related_books: found };
  } else if (name === "search_posts") {
    const found = await searchPosts(args as Parameters<typeof searchPosts>[0]);
    books = found;
    result = { posts: found };
  } else if (name === "get_book_details") {
    result = await getBookDetails(args as { slug: string });
    if (!result.error) {
      books = [{
        slug: String(result.slug),
        title: String(result.title),
        author: String(result.author),
        coverUrl: null,
        url: `/books/${String(result.slug)}`,
        type: "book",
      }];
    }
  } else if (name === "get_library_info") {
    result = getLibraryInfo(args as { topic: LibraryInfoTopic });
  } else {
    result = { error: `Unknown function: ${name}` };
  }

  return { result, books };
}

// ── POST handler ──────────────────────────────────────────────────────────────
export async function POST(req: Request) {

  // ── 1. Auth ─────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "auth" }, { status: 401 });
  }
  const userId = user.id;

  // ── 2. Body validation ───────────────────────────────────────────────────────
  let body: { messages?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "messages must be a non-empty array." }, { status: 400 });
  }

  const raw = body.messages as unknown[];
  if (raw.length > 10) {
    return Response.json({ error: "messages array exceeds 10 turns." }, { status: 400 });
  }

  const messages: InboundMessage[] = [];
  for (const m of raw) {
    const obj = m as Record<string, unknown>;
    if (
      typeof m !== "object" || m === null ||
      typeof obj["role"] !== "string" ||
      typeof obj["text"] !== "string" ||
      !["user", "model"].includes(obj["role"])
    ) {
      return Response.json({ error: "Each message must have role ('user'|'model') and text (string)." }, { status: 400 });
    }
    const text = obj["text"] as string;
    if (text.length > 500) {
      return Response.json({ error: "Message exceeds 500 characters." }, { status: 400 });
    }
    messages.push({ role: obj["role"] as InboundMessage["role"], text });
  }

  // Duplicate guard: reject if the incoming user message is identical (case-insensitive)
  // to the previous user message in the submitted history — no Gemini call.
  const userMessages = messages.filter((m) => m.role === "user");
  if (userMessages.length >= 2) {
    const last = userMessages[userMessages.length - 1].text.trim().toLowerCase();
    const prev = userMessages[userMessages.length - 2].text.trim().toLowerCase();
    if (last === prev) {
      return Response.json({ error: "duplicate" }, { status: 400 });
    }
  }

  // ── 3. Cooldown (in-memory, per-user) ────────────────────────────────────────
  const now = Date.now();
  const lastAccepted = cooldownMap.get(userId) ?? 0;
  if (now - lastAccepted < COOLDOWN_MS) {
    return Response.json({ error: "cooldown" }, { status: 429 });
  }
  // Update cooldown timestamp before quota check (block fast duplicate requests even if quota fails)
  cooldownMap.set(userId, now);

  // ── 4. Role check ─────────────────────────────────────────────────────────────
  const db = createServiceClient();
  const { data: profile } = await db
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  const isAdmin = ADMIN_PANEL_ROLES.includes((profile?.role ?? "reader") as AppRole);

  // ── 5. Per-user daily quota (skip for admins) ────────────────────────────────
  // Quota is incremented BEFORE the Gemini call — a failed AI call still costs
  // one use. This is intentional: simple and prevents abuse via forced errors.
  let remaining: number | null = null;
  if (!isAdmin) {
    const { data: quotaResult, error: quotaErr } = await db.rpc("increment_ai_usage", {
      p_user_id: userId,
      p_limit: DAILY_USER_LIMIT,
    });
    if (quotaErr) {
      console.error("[/api/ask] quota RPC error:", quotaErr.message ?? quotaErr);
      return Response.json({ error: "db_error" }, { status: 503 });
    }
    if ((quotaResult as number) === -1) {
      return Response.json({ error: "quota", remaining: 0 }, { status: 429 });
    }
    remaining = quotaResult as number;
  }

  // ── 6. Global daily circuit breaker ──────────────────────────────────────────
  // Uses the sentinel UUID so per-user quota doesn't mix with global tracking.
  // Only called AFTER per-user check passes, so blocked users don't consume budget.
  const { data: globalResult, error: globalErr } = await db.rpc("increment_ai_usage", {
    p_user_id: GLOBAL_SENTINEL,
    p_limit: DAILY_GLOBAL_LIMIT,
  });
  if (globalErr) {
    console.error("[/api/ask] global RPC error:", globalErr.message ?? globalErr);
    return Response.json({ error: "db_error" }, { status: 503 });
  }
  if ((globalResult as number) === -1) {
    return Response.json({ error: "global_limit" }, { status: 503 });
  }

  // ── 7. Gemini tool loop ───────────────────────────────────────────────────────
  // Truncate to last MAX_TURNS (6) conversation turns, then build contents.
  const truncated = messages.slice(-MAX_TURNS);
  let contents: Content[] = truncated.map((m) => ({
    role: m.role,
    parts: [{ text: m.text }],
  }));

  const allBooks: BookResult[] = [];
  const seenSlugs = new Set<string>();

  try {
    const ai = getAI();
    const geminiConfig = {
      systemInstruction: SYSTEM_INSTRUCTION,
      tools: [{ functionDeclarations: toolDeclarations }],
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      // Minimize thinking tokens for flash model to reduce cost
      thinkingConfig: { thinkingBudget: 0 },
    };

    let response = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: geminiConfig,
    });

    // Tool loop — max 3 iterations
    for (let iter = 0; iter < 3 && response.functionCalls && response.functionCalls.length > 0; iter++) {
      const functionCalls = response.functionCalls;

      const modelContent = response.candidates?.[0]?.content;
      if (modelContent) contents = [...contents, modelContent];

      const execResults = await Promise.all(
        functionCalls.map(async (fc) => {
          const name = fc.name ?? "";
          const args = (fc.args ?? {}) as Record<string, unknown>;
          return { fc, ...(await executeFunction(name, args)) };
        })
      );

      for (const { books } of execResults) {
        for (const b of books) {
          const key = `${b.type}:${b.slug}`;
          if (!seenSlugs.has(key)) {
            seenSlugs.add(key);
            allBooks.push(b);
          }
        }
      }

      const responseParts = execResults.map(({ fc, result }) => ({
        functionResponse: {
          id: fc.id ?? undefined,
          name: fc.name ?? "",
          response: result,
        },
      }));

      contents = [...contents, { role: "user", parts: responseParts }];

      response = await ai.models.generateContent({
        model: MODEL,
        contents,
        config: geminiConfig,
      });
    }

    const answer = response.text ?? "";

    return Response.json({ answer, books: allBooks.slice(0, 5), remaining });
  } catch (err) {
    console.error("[/api/ask] Gemini error:", err);
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
