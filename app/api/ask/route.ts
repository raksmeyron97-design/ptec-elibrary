// app/api/ask/route.ts
// PTEC Library AI assistant — Gemini tool-loop, non-streaming.
// GEMINI_API_KEY is server-side only — never exposed to client bundles.

import { GoogleGenAI, Content, FunctionDeclaration } from "@google/genai";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { LIBRARY_INFO, LibraryInfoTopic } from "@/lib/library-info";
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

const MODEL = "gemini-2.5-flash";

// ── In-memory cooldown tracker (per-user, resets on cold start — that's OK) ──
// Daily quota is NOT in-memory; it lives in Supabase.
const cooldownMap = new Map<string, number>();

// ── Types ─────────────────────────────────────────────────────────────────────
interface InboundMessage {
  role: "user" | "model";
  text: string;
}

interface BookResult {
  slug: string;
  title: string;
  author: string;
  coverUrl: string | null;
}

// ── Gemini client ─────────────────────────────────────────────────────────────
function getAI() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not configured on the server.");
  return new GoogleGenAI({ apiKey: key });
}

// ── System instruction ────────────────────────────────────────────────────────
const SYSTEM_INSTRUCTION = `You are the PTEC Library assistant for Phnom Penh Teacher Education College.

SCOPE — you MAY help with:
• Finding and recommending books from the PTEC digital catalog.
• Answering questions about the library: opening hours, location, contact info, borrowing, rules.
• Summarizing or explaining a book based on its title, description, category, and department metadata.
  You do NOT have access to PDF contents — if asked for chapter-level detail, say so and link to the book page.

SCOPE — you MUST politely decline:
• Writing essays, homework, or assignments for students.
• Answering general questions unrelated to the library or its collection.
• Discussing anything outside the library's scope.

BEHAVIOR RULES:
• Always ground book recommendations in search tool results. Never invent books.
• If search_books returns nothing, say so graciously and suggest broader search terms.
• Recommend at most 5 books per response.
• Keep answers concise (2–5 sentences) unless summarizing a specific book.
• Reply in the user's language: if the user writes in Khmer (ភាសាខ្មែរ), respond entirely in Khmer.
• When recommending books, always mention the book title and author from the tool result.`;

// ── Supabase book search ──────────────────────────────────────────────────────
async function searchBooks(args: {
  query: string;
  language?: string;
  department?: string;
  limit?: number;
}): Promise<BookResult[]> {
  const db = createServiceClient();
  const limit = Math.min(args.limit ?? 5, 8);
  const q = args.query.trim();

  let query = db
    .from("books")
    .select("slug, title, cover_url, description, department, language, authors(name), categories(name)")
    .eq("is_published", true)
    .or(`title.ilike.%${q}%,description.ilike.%${q}%`)
    .order("download_count", { ascending: false })
    .limit(limit);

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
    coverUrl: b.cover_url ?? null,
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
  switch (args.topic) {
    case "hours":    return { en: LIBRARY_INFO.hours.en,    km: LIBRARY_INFO.hours.km };
    case "location": return { en: LIBRARY_INFO.location.en, km: LIBRARY_INFO.location.km, phone: LIBRARY_INFO.phone, email: LIBRARY_INFO.email };
    case "contact":  return { phone: LIBRARY_INFO.phone, email: LIBRARY_INFO.email, en: LIBRARY_INFO.location.en };
    case "borrowing": return { en: LIBRARY_INFO.borrowing.en, km: LIBRARY_INFO.borrowing.km };
    case "rules":    return { en: LIBRARY_INFO.rules.en, km: LIBRARY_INFO.rules.km, rulesPage: LIBRARY_INFO.links.rules };
    default:         return { error: "Unknown topic." };
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
        limit:      { type: "number", description: "Max number of results (1–8)." },
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
    description: "Get factual library information: opening hours, location, contact, borrowing rules, or library rules.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          enum: ["hours", "location", "contact", "borrowing", "rules"],
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
  } else if (name === "get_book_details") {
    result = await getBookDetails(args as { slug: string });
    if (!result.error) {
      books = [{ slug: String(result.slug), title: String(result.title), author: String(result.author), coverUrl: null }];
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
  const isAdmin = profile?.role === "admin";

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
          if (!seenSlugs.has(b.slug)) {
            seenSlugs.add(b.slug);
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
