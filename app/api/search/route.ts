/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/search/route.ts
// Public AI semantic search — no auth required.
// Hybrid retrieval:  pgvector (gemini-embedding-001) over work metadata
// (match_library) AND page-level chunks (match_book_chunks, migration 0082)
// → keyword fallback/supplement. Plus a Gemini one-shot summary.
// Response shape: { answer, books, passages } — passages are the best
// matching page-level excerpts from inside PDFs, deduped to one per work.
//
// Requires the pgvector migrations (0029/0082) + a backfill run of
// scripts/embed-library.ts so rows have embeddings.

import { createServiceClient } from "@/lib/supabase/server";
import { GoogleGenAI } from "@google/genai";
import { rateLimit } from "@/lib/rate-limit";
import { logAppEvent } from "@/lib/analytics/events";
import { ratePolicy, isExpensiveSearchDisabled } from "@/lib/rate-limit-policy";
import { logSecurityEvent } from "@/lib/security-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BOOKS = 6;
const COVERS_URL = process.env.NEXT_PUBLIC_R2_COVERS_URL ?? "";

const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIM = 768; // must match vector(768) columns
const MIN_SIMILARITY = 0.25;

// Rate limit comes from ratePolicy("search") — RL_SEARCH_PER_MIN to override.
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

// A passage found inside a PDF, deduped to the best chunk per work.
interface AIPassage {
  slug: string;
  title: string;
  author: string;
  coverUrl: string | null;
  url: string;
  page: number;
  snippet: string;
  similarity: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function coverUrlOf(raw: string | null): string | null {
  if (!raw) return null;
  return raw.startsWith("http") ? raw : `${COVERS_URL}/${raw}`;
}

function urlFor(source: string, ref: string): string {
  if (source === "research") return `/theses/${ref}`;
  if (source === "catalog") return `/catalogs/${ref}`;
  if (source === "publication") return `/publications/${ref}`;
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
  vec: number[],
): Promise<AIBook[]> {
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

// ── 1b. Passage search (page-level chunks, migration 0082) ───────────────────
const MAX_PASSAGES = 5;
const CHUNK_MIN_SIMILARITY = 0.3;
const SNIPPET_LEN = 260;

async function chunkSearch(
  db: ReturnType<typeof createServiceClient>,
  vec: number[],
): Promise<AIPassage[]> {
  const { data, error } = await db.rpc("match_book_chunks", {
    query_embedding: vec,
    match_count: 12,
    min_similarity: CHUNK_MIN_SIMILARITY,
  });
  if (error) {
    // Fail open pre-migration / on RPC trouble — works search still runs.
    console.error("[/api/search] match_book_chunks error:", error.message);
    return [];
  }

  // Rows arrive ordered by similarity; keep the best chunk per work.
  const passages: AIPassage[] = [];
  const seen = new Set<string>();
  for (const r of (data ?? []) as any[]) {
    const url = urlFor(r.source, r.ref);
    if (seen.has(url)) continue;
    seen.add(url);
    const text: string = r.content ?? "";
    passages.push({
      slug: r.ref,
      title: r.title,
      author: r.author ?? "Unknown",
      coverUrl: coverUrlOf(r.cover_url ?? null),
      url,
      page: r.page_no,
      snippet: text.length > SNIPPET_LEN ? `${text.slice(0, SNIPPET_LEN).trim()}…` : text,
      similarity: Math.round(Number(r.similarity ?? 0) * 100) / 100,
    });
    if (passages.length >= MAX_PASSAGES) break;
  }
  return passages;
}

// ── 2. Keyword fallback / supplement ──────────────────────────────────────────
async function keywordSearch(
  db: ReturnType<typeof createServiceClient>,
  rawQ: string,
): Promise<AIBook[]> {
  const q = sanitize(rawQ);
  if (!q) return [];
  const tokens = tokenize(q);

  const [{ data: books }, { data: research }, { data: catalog }, { data: publications }] = await Promise.all([
    db
      .from("books")
      .select("slug, title, cover_url, authors(name), categories(name)")
      .eq("is_published", true)
      .or(orFilter(["title", "description"], tokens))
      .order("download_count", { ascending: false })
      .limit(MAX_BOOKS),
    db
      .from("research_reports")
      .select("id, slug, title, cover_url, author_names")
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
    db
      .from("publications_with_stats")
      .select("slug, title, cover_url, author_names, journal_name")
      .eq("is_published", true)
      .or(orFilter(["title", "abstract"], tokens))
      .order("view_count", { ascending: false })
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
      slug: (r as any).slug ?? (r as any).id,
      title: (r as any).title,
      author: (r as any).author_names ?? "Unknown",
      category: "Thesis",
      coverUrl: coverUrlOf((r as any).cover_url ?? null),
      url: `/theses/${(r as any).slug ?? (r as any).id}`,
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
  for (const p of publications ?? [])
    out.push({
      slug: (p as any).slug,
      title: (p as any).title,
      author: (p as any).author_names ?? "Unknown",
      category: (p as any).journal_name ?? "Publication",
      coverUrl: coverUrlOf((p as any).cover_url ?? null),
      url: `/publications/${(p as any).slug}`,
    });
  return out;
}

// ── Hybrid: semantic (works + passages) first, keyword fills the gaps ─────────
async function hybridSearch(rawQ: string): Promise<{ books: AIBook[]; passages: AIPassage[] }> {
  const db = createServiceClient();

  // One query embedding feeds both retrievers (no extra Gemini call).
  const vec = await embedQuery(rawQ);
  const [semantic, passages] = vec
    ? await Promise.all([semanticSearch(db, vec), chunkSearch(db, vec)])
    : [[] as AIBook[], [] as AIPassage[]];

  const seen = new Set(semantic.map((b) => b.url ?? b.slug));
  const merged = [...semantic];

  // Works surfaced only by their page content still belong in the results.
  for (const p of passages) {
    if (merged.length >= MAX_BOOKS) break;
    if (!seen.has(p.url)) {
      seen.add(p.url);
      merged.push({ slug: p.slug, title: p.title, author: p.author, coverUrl: p.coverUrl, url: p.url });
    }
  }

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

  return { books: merged.slice(0, MAX_BOOKS), passages };
}

// ── Gemini one-shot summary ───────────────────────────────────────────────────
async function generateAnswer(q: string, titles: string[], passages: AIPassage[]): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return "";

  const bookList =
    titles.length > 0
      ? `Found these books: ${titles.join(", ")}.`
      : "No specific books were found in the catalog.";

  const passageList =
    passages.length > 0
      ? `The topic also appears inside these PDFs: ${passages
          .slice(0, 3)
          .map((p) => `"${p.title}" (p. ${p.page})`)
          .join(", ")}.`
      : "";

  const prompt = `You are the PTEC Library AI assistant for Phnom Penh Teacher Education College.
A user searched for: "${q}"
${bookList}
${passageList}
Write 1–3 concise sentences: briefly explain the topic and how the listed books relate to it. If a PDF passage is directly relevant, mention its page number (e.g. "p. 42"). If no books were found, suggest alternative search terms. Detect the language of the query and reply in the same language (Khmer if Khmer, English if English).`;

  const aiStarted = Date.now();
  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const res = await ai.models.generateContent({
      model: "gemini-3.5-flash", // bump to gemini-3.5-flash for higher quality
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { maxOutputTokens: 250, thinkingConfig: { thinkingBudget: 0 } },
    });
    logAppEvent({
      kind: "ai_request",
      status: "ok",
      route: "/api/search",
      latencyMs: Date.now() - aiStarted,
    });
    return res.text ?? "";
  } catch (err) {
    console.error("[/api/search] Gemini error:", err);
    logAppEvent({
      kind: "ai_request",
      status: "error",
      route: "/api/search",
      latencyMs: Date.now() - aiStarted,
    });
    return "";
  }
}

// ── GET /api/search?q=... ─────────────────────────────────────────────────────
export async function GET(req: Request) {
  const ip = getClientIP(req);
  const { limit, windowMs } = ratePolicy("search");
  if (!(await rateLimit(ip, limit, windowMs)).success) {
    logSecurityEvent({ type: "rate_limited", where: "/api/search", ip });
    return Response.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (!q || q.length > 300) {
    return Response.json({ error: "Missing or invalid query (max 300 chars)." }, { status: 400 });
  }

  let books: AIBook[] = [];
  let passages: AIPassage[] = [];
  try {
    ({ books, passages } = await hybridSearch(q));
  } catch (err) {
    console.error("[/api/search] search failed:", err);
    return Response.json({ error: "Search failed. Please try again." }, { status: 500 });
  }

  // Summary is best-effort: quota/RPC/Gemini failure must not break search.
  // In emergency mode the summary is skipped entirely — book results still work.
  let answer = "";
  if (isExpensiveSearchDisabled()) {
    return Response.json({ answer, books, passages });
  }
  try {
    const db = createServiceClient();
    const { data: aiAllowed } = await db.rpc("increment_ai_usage", {
      p_user_id: SEARCH_SENTINEL,
      p_limit: DAILY_AI_LIMIT,
    });
    if ((aiAllowed as number) !== -1) {
      answer = await generateAnswer(q, books.map((b) => b.title), passages);
    }
  } catch (err) {
    console.error("[/api/search] AI summary skipped:", err);
  }

  return Response.json({ answer, books, passages });
}