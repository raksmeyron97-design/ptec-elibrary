/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/search/route.ts
// Public AI semantic search — no auth required.
// Hybrid retrieval:  pgvector (gemini-embedding-001) → keyword fallback/supplement.
// Plus a Gemini one-shot summary.  Response shape: { answer, books }
//
// Requires migration 0001_pgvector_search.sql + a backfill run of
// scripts/embed-library.ts so rows have embeddings.

import { createServiceClient } from "@/lib/supabase/server";
import { GoogleGenAI } from "@google/genai";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BOOKS = 6;
const COVERS_URL = process.env.NEXT_PUBLIC_R2_COVERS_URL ?? "";

const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIM = 768; // must match vector(768) columns
const MIN_SIMILARITY = 0.25;

const RATE_PER_MIN = 10; // per-IP requests/minute
const DAILY_AI_LIMIT = 1000; // global Gemini summary calls/day (denial-of-wallet)
const SEARCH_SENTINEL = "00000000-0000-0000-0000-000000000002";

function getClientIP(req: Request): string {
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
  slug: string;
  title: string;
  author: string;
  coverUrl: string | null;
  category?: string;
  url?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function coverUrlOf(raw: string | null): string | null {
  if (!raw) return null;
  return raw.startsWith("http") ? raw : `${COVERS_URL}/${raw}`;
}

function urlFor(source: string, ref: string): string {
  if (source === "research") return `/research/${ref}`;
  if (source === "catalog") return `/catalogs/${ref}`;
  return `/books/${ref}`;
}

function sanitize(raw: string): string {
  return raw.replace(/[%,()\\*]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenize(q: string): string[] {
  const words = q.split(/\s+/).filter((w) => w.length >= 2);
  return Array.from(new Set([q, ...words])).slice(0, 7);
}

function orFilter(fields: string[], tokens: string[]): string {
  const clauses: string[] = [];
  for (const tok of tokens) for (const f of fields) clauses.push(`${f}.ilike.%${tok}%`);
  return clauses.join(",");
}

function normalize(v: number[]): number[] {
  const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / mag);
}

// ── 1. Semantic search (pgvector) ─────────────────────────────────────────────
async function embedQuery(text: string): Promise<number[] | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const res = await ai.models.embedContent({
      model: EMBED_MODEL,
      contents: text,
      config: { outputDimensionality: EMBED_DIM, taskType: "RETRIEVAL_QUERY" },
    });
    const values = res.embeddings?.[0]?.values;
    return values?.length ? normalize(values) : null;
  } catch (err) {
    console.error("[/api/search] embed error:", err);
    return null;
  }
}

async function semanticSearch(
  db: ReturnType<typeof createServiceClient>,
  q: string,
): Promise<AIBook[]> {
  const vec = await embedQuery(q);
  if (!vec) return [];

  const { data, error } = await db.rpc("match_library", {
    query_embedding: vec,
    match_count: MAX_BOOKS,
    min_similarity: MIN_SIMILARITY,
  });
  if (error) {
    console.error("[/api/search] match_library error:", error.message);
    return [];
  }

  return (data ?? []).map((r: any) => ({
    slug: r.ref,
    title: r.title,
    author: r.author ?? "Unknown",
    category: r.category ?? undefined,
    coverUrl: coverUrlOf(r.cover_url ?? null),
    url: urlFor(r.source, r.ref),
  }));
}

// ── 2. Keyword fallback / supplement ──────────────────────────────────────────
async function keywordSearch(
  db: ReturnType<typeof createServiceClient>,
  rawQ: string,
): Promise<AIBook[]> {
  const q = sanitize(rawQ);
  if (!q) return [];
  const tokens = tokenize(q);

  const [{ data: books }, { data: research }, { data: catalog }] = await Promise.all([
    db
      .from("books")
      .select("slug, title, cover_url, authors(name), categories(name)")
      .eq("is_published", true)
      .or(orFilter(["title", "description"], tokens))
      .order("download_count", { ascending: false })
      .limit(MAX_BOOKS),
    db
      .from("research_reports")
      .select("id, title, cover_url, author_names")
      .eq("is_published", true)
      .or(orFilter(["title", "abstract"], tokens))
      .order("view_count", { ascending: false })
      .limit(MAX_BOOKS),
    db
      .from("catalog_books")
      .select("slug, title, cover_url, author, category")
      .eq("is_active", true)
      .or(orFilter(["title", "description"], tokens))
      .limit(MAX_BOOKS),
  ]);

  const out: AIBook[] = [];
  for (const b of books ?? [])
    out.push({
      slug: (b as any).slug,
      title: (b as any).title,
      author: (b as any).authors?.name ?? "Unknown",
      category: (b as any).categories?.name ?? "E-Book",
      coverUrl: coverUrlOf((b as any).cover_url ?? null),
      url: `/books/${(b as any).slug}`,
    });
  for (const r of research ?? [])
    out.push({
      slug: (r as any).id,
      title: (r as any).title,
      author: (r as any).author_names ?? "Unknown",
      category: "Research Report",
      coverUrl: coverUrlOf((r as any).cover_url ?? null),
      url: `/research/${(r as any).id}`,
    });
  for (const c of catalog ?? [])
    out.push({
      slug: (c as any).slug,
      title: (c as any).title,
      author: (c as any).author ?? "Unknown",
      category: (c as any).category ?? "Physical Book",
      coverUrl: coverUrlOf((c as any).cover_url ?? null),
      url: `/catalogs/${(c as any).slug}`,
    });
  return out;
}

// ── Hybrid: semantic first, keyword fills the gaps ────────────────────────────
async function hybridSearch(rawQ: string): Promise<AIBook[]> {
  const db = createServiceClient();

  const semantic = await semanticSearch(db, rawQ);

  const seen = new Set(semantic.map((b) => b.url ?? b.slug));
  const merged = [...semantic];

  if (merged.length < MAX_BOOKS) {
    const kw = await keywordSearch(db, rawQ);
    for (const b of kw) {
      const key = b.url ?? b.slug;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(b);
      }
      if (merged.length >= MAX_BOOKS) break;
    }
  }

  return merged.slice(0, MAX_BOOKS);
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
      model: "gemini-3.5-flash", // bump to gemini-3.5-flash for higher quality
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { maxOutputTokens: 250, thinkingConfig: { thinkingBudget: 0 } },
    });
    return res.text ?? "";
  } catch (err) {
    console.error("[/api/search] Gemini error:", err);
    return "";
  }
}

// ── GET /api/search?q=... ─────────────────────────────────────────────────────
export async function GET(req: Request) {
  const ip = getClientIP(req);
  if (!rateLimit(ip, RATE_PER_MIN, 60_000).success) {
    return Response.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (!q || q.length > 300) {
    return Response.json({ error: "Missing or invalid query (max 300 chars)." }, { status: 400 });
  }

  let books: AIBook[] = [];
  try {
    books = await hybridSearch(q);
  } catch (err) {
    console.error("[/api/search] search failed:", err);
    return Response.json({ error: "Search failed. Please try again." }, { status: 500 });
  }

  // Summary is best-effort: quota/RPC/Gemini failure must not break search.
  let answer = "";
  try {
    const db = createServiceClient();
    const { data: aiAllowed } = await db.rpc("increment_ai_usage", {
      p_user_id: SEARCH_SENTINEL,
      p_limit: DAILY_AI_LIMIT,
    });
    if ((aiAllowed as number) !== -1) {
      answer = await generateAnswer(q, books.map((b) => b.title));
    }
  } catch (err) {
    console.error("[/api/search] AI summary skipped:", err);
  }

  return Response.json({ answer, books });
}