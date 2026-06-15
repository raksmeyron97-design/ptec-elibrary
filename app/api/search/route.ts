/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/search/route.ts
// Public AI semantic search — no auth required.
// Uses Supabase full-text search + Gemini summary.
// Replace the searchBooks body with pgvector later (zero client changes needed).
//
// Response shape:  { answer: string, books: AIBook[] }

import { createServiceClient } from "@/lib/supabase/server";
import { GoogleGenAI } from "@google/genai";
import { rateLimit } from "@/lib/rate-limit";

export const runtime  = "nodejs";
export const dynamic  = "force-dynamic";

const MAX_BOOKS  = 6;
const COVERS_URL = process.env.NEXT_PUBLIC_R2_COVERS_URL ?? "";

// Abuse / cost controls for this public, Gemini-backed endpoint.
const RATE_PER_MIN       = 10;   // per-IP requests/minute
const DAILY_AI_LIMIT     = 1000; // global Gemini calls/day (denial-of-wallet cap)
// Distinct sentinel row in ai_usage so this counter doesn't mix with the
// chat/ask global breaker.
const SEARCH_SENTINEL = "00000000-0000-0000-0000-000000000002";

function getClientIP(req: Request): string {
  // x-real-ip is set by the platform and cannot be spoofed by the client;
  // the left-most x-forwarded-for value can, so never trust it for limiting.
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return "unknown";
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface AIBook {
  slug:      string;
  title:     string;
  author:    string;
  coverUrl:  string | null;
  category?: string;
}

// ── Book search (swap body for pgvector when ready) ───────────────────────────

async function searchBooks(rawQ: string): Promise<AIBook[]> {
  const db = createServiceClient();

  // Strip PostgREST filter metacharacters before interpolating into `.or(...)`
  // filter strings so the user query can't break out of the filter.
  const q = rawQ.replace(/[%,()\\*]/g, " ").replace(/\s+/g, " ").trim();
  if (!q) return [];

  // 1. E-Books
  const { data: primaryBooks } = await db
    .from("books")
    .select("slug, title, cover_url, authors(name), categories(name)")
    .eq("is_published", true)
    .or(`title.ilike.%${q}%,description.ilike.%${q}%`)
    .order("download_count", { ascending: false })
    .limit(MAX_BOOKS);

   
  const bookResults: any[] = primaryBooks ?? [];

  if (bookResults.length < 3) {
    const { data: catBooks } = await db
      .from("books")
      .select("slug, title, cover_url, authors(name), categories!inner(name)")
      .eq("is_published", true)
      .ilike("categories.name", `%${q}%`)
      .order("download_count", { ascending: false })
      .limit(MAX_BOOKS);

    const seen = new Set(bookResults.map((b) => b.slug as string));
    for (const b of catBooks ?? []) {
      if (!seen.has(b.slug as string)) {
        seen.add(b.slug as string);
        bookResults.push(b);
      }
    }
  }

  // 2. Research Reports
  const { data: primaryResearch } = await db
    .from("research_reports")
    .select("id, title, cover_url, author_names, keywords, program")
    .eq("is_published", true)
    .or(`title.ilike.%${q}%,abstract.ilike.%${q}%`)
    .order("view_count", { ascending: false })
    .limit(MAX_BOOKS);

  // 3. Physical Books (Catalog)
  const { data: primaryCatalog } = await db
    .from("catalog_books")
    .select("slug, title, cover_url, author, category")
    .eq("is_active", true)
    .or(`title.ilike.%${q}%,description.ilike.%${q}%`)
    .limit(MAX_BOOKS);

  const mappedBooks = bookResults.slice(0, MAX_BOOKS).map((b: any) => {
    const raw: string | null = b.cover_url ?? null;
    const coverUrl = raw ? (raw.startsWith("http") ? raw : `${COVERS_URL}/${raw}`) : null;
    return {
      slug:     b.slug as string,
      title:    b.title as string,
      author:   (b.authors?.name as string | undefined) ?? "Unknown",
      category: (b.categories?.name as string | undefined) ?? "E-Book",
      coverUrl,
      url:      `/books/${b.slug}`,
    };
  });

  const mappedResearch = (primaryResearch ?? []).map((r: any) => {
    const raw: string | null = r.cover_url ?? null;
    const coverUrl = raw ? (raw.startsWith("http") ? raw : `${COVERS_URL}/${raw}`) : null;
    return {
      slug:     r.id as string,
      title:    r.title as string,
      author:   (r.author_names as string | undefined) ?? "Unknown",
      category: "Research Report",
      coverUrl,
      url:      `/research/${r.id}`,
    };
  });

  const mappedCatalog = (primaryCatalog ?? []).map((c: any) => {
    const raw: string | null = c.cover_url ?? null;
    const coverUrl = raw ? (raw.startsWith("http") ? raw : `${COVERS_URL}/${raw}`) : null;
    return {
      slug:     c.slug as string,
      title:    c.title as string,
      author:   (c.author as string | undefined) ?? "Unknown",
      category: (c.category as string | undefined) ?? "Physical Book",
      coverUrl,
      url:      `/catalogs/${c.slug}`,
    };
  });

  // Interleave all three sources
  const combined = [];
  const maxLen = Math.max(mappedBooks.length, mappedResearch.length, mappedCatalog.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < mappedBooks.length) combined.push(mappedBooks[i]);
    if (i < mappedResearch.length) combined.push(mappedResearch[i]);
    if (i < mappedCatalog.length) combined.push(mappedCatalog[i]);
  }

  return combined.slice(0, MAX_BOOKS);
}

// ── Gemini one-shot summary ───────────────────────────────────────────────────

async function generateAnswer(q: string, titles: string[]): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return "";

  const bookList =
    titles.length > 0
      ? `Found these books: ${titles.join(", ")}.`
      : "No specific books were found in the catalog.";

  const prompt = `You are the PTEC Library AI assistant for Phnom Penh Teacher Education College.
A user searched for: "${q}"
${bookList}
Write 1–3 concise sentences: briefly explain the topic and how the listed books relate to it. If no books were found, suggest alternative search terms. Detect the language of the query and reply in the same language (Khmer if Khmer, English if English).`;

  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const res = await ai.models.generateContent({
      model:    "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config:   {
        maxOutputTokens: 250,
        thinkingConfig:  { thinkingBudget: 0 },
      },
    });
    return res.text ?? "";
  } catch (err) {
    console.error("[/api/search] Gemini error:", err);
    return "";
  }
}

// ── GET /api/search?q=... ─────────────────────────────────────────────────────

export async function GET(req: Request) {
  // Per-IP rate limit — this endpoint hits Gemini, so keep it tight.
  const ip = getClientIP(req);
  if (!rateLimit(ip, RATE_PER_MIN, 60_000).success) {
    return Response.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";

  if (!q || q.length > 300) {
    return Response.json({ error: "Missing or invalid query (max 300 chars)." }, { status: 400 });
  }

  try {
    const books = await searchBooks(q);

    // Global daily cap on the Gemini summary (denial-of-wallet protection across
    // all IPs). When exhausted, still return DB results — just skip the AI text.
    let answer = "";
    const db = createServiceClient();
    const { data: aiAllowed } = await db.rpc("increment_ai_usage", {
      p_user_id: SEARCH_SENTINEL,
      p_limit: DAILY_AI_LIMIT,
    });
    if ((aiAllowed as number) !== -1) {
      answer = await generateAnswer(q, books.map((b) => b.title));
    }

    return Response.json({ answer, books });
  } catch (err) {
    console.error("[/api/search]", err);
    return Response.json({ error: "Search failed. Please try again." }, { status: 500 });
  }
}
