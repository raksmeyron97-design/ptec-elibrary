/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/search/route.ts
// Public AI semantic search — no auth required. Response shape is unchanged:
// { answer, books, passages }.
//
// Post-2.0 this route shares the AI core rather than reimplementing it: one
// cached embedder (lib/ai/retrieval.embedQuery), one filter sanitizer, one
// model registry, one budget helper, one telemetry writer. It previously
// carried its own copies of all five (audit §3).
//
// The other change that matters is WHEN the summary is generated. It used to
// run on every request, including zero-result queries and exact title lookups
// — cases where a template sentence is both cheaper and more useful. Now the
// model is asked only when it has something to add (§4.12).

import { createServiceClient } from "@/lib/supabase/server";
import { GoogleGenAI } from "@google/genai";
import { rateLimit } from "@/lib/rate-limit";
import { ratePolicy, isExpensiveSearchDisabled } from "@/lib/rate-limit-policy";
import { logSecurityEvent } from "@/lib/security-log";
import { getOrgIdentity } from "@/lib/system-settings/config";
import { clientIp } from "@/lib/client-ip";
import { MODEL_IDS } from "@/lib/ai/models";
import { allowPublicSummary } from "@/lib/ai/limits";
import { coverUrlOf, embedQuery, urlFor } from "@/lib/ai/retrieval";
import { filterTokens, orFilter, sanitizeFilterTerm } from "@/lib/ai/guardrails";
import { detectLanguage, normalizeQuery } from "@/lib/ai/intent";
import { estimateTokens } from "@/lib/ai/token-budget";
import { recordAiRequest } from "@/lib/ai/telemetry";
import { noResults } from "@/lib/ai/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BOOKS = 6;
const MIN_SIMILARITY = 0.25;
const MAX_PASSAGES = 5;
const CHUNK_MIN_SIMILARITY = 0.3;
const SNIPPET_LEN = 260;
/** Summary output cap — one to three sentences, never an essay. */
const SUMMARY_OUTPUT_TOKENS = 180;


interface AIBook {
  slug: string;
  title: string;
  author: string;
  coverUrl: string | null;
  category?: string;
  url?: string;
}

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

// ── Retrieval ─────────────────────────────────────────────────────────────────
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

async function keywordSearch(
  db: ReturnType<typeof createServiceClient>,
  rawQ: string,
): Promise<AIBook[]> {
  const tokens = filterTokens(rawQ, 7);
  if (!tokens.length) return [];

  const [{ data: books }, { data: research }, { data: catalog }, { data: publications }, { data: paths }] =
    await Promise.all([
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
      db
        .from("learning_paths")
        .select("slug, title, title_km, cover_url, audience")
        .eq("is_published", true)
        .or(orFilter(["title", "title_km", "description", "description_km", "audience"], tokens))
        .order("position", { ascending: true })
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
  for (const p of paths ?? [])
    out.push({
      slug: (p as any).slug,
      title: (p as any).title,
      author: (p as any).audience ?? "PTEC Library",
      category: "Learning Path",
      coverUrl: coverUrlOf((p as any).cover_url ?? null),
      url: `/paths/${(p as any).slug}`,
    });
  return out;
}

interface HybridResult {
  books: AIBook[];
  passages: AIPassage[];
  embeddingMs: number;
  cacheHit: boolean;
  dbQueries: number;
}

/** Semantic (works + passages) first, keyword fills the gaps. */
async function hybridSearch(rawQ: string): Promise<HybridResult> {
  const db = createServiceClient();

  // One cached query embedding feeds both retrievers (no extra Gemini call,
  // and a repeated query costs none at all).
  const emb = await embedQuery(rawQ);
  const [semantic, passages] = emb.vector
    ? await Promise.all([semanticSearch(db, emb.vector), chunkSearch(db, emb.vector)])
    : [[] as AIBook[], [] as AIPassage[]];
  let dbQueries = emb.vector ? 2 : 0;

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
    dbQueries += 5;
    for (const b of kw) {
      const key = b.url ?? b.slug;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(b);
      }
      if (merged.length >= MAX_BOOKS) break;
    }
  }

  return {
    books: merged.slice(0, MAX_BOOKS),
    passages,
    embeddingMs: emb.ms,
    cacheHit: emb.cacheHit,
    dbQueries,
  };
}

// ── Summary ───────────────────────────────────────────────────────────────────
/**
 * True when a generated sentence would tell the searcher something the result
 * list does not already say. Two cases where it would not:
 *
 *  - nothing matched — the template says so, and says it in the right language
 *  - the top hit's title IS the query — the searcher found the exact item they
 *    named, and a paragraph about it is noise
 */
function summaryWorthIt(q: string, books: AIBook[], passages: AIPassage[]): boolean {
  if (books.length === 0) return false;
  if (passages.length > 0) return true;
  const nq = normalizeQuery(q);
  const top = normalizeQuery(books[0].title);
  return !(top === nq || (nq.length > 6 && top.startsWith(nq)));
}

async function generateAnswer(
  q: string,
  titles: string[],
  passages: AIPassage[],
): Promise<{ text: string; inputTokens: number; outputTokens: number; model: string } | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const org = await getOrgIdentity();
  // Compact: titles only, top three passages by page reference. No
  // descriptions, no cover URLs, no slugs — the model does not render cards.
  const prompt = [
    `You are the ${org.siteName} search assistant (${org.institutionName}).`,
    `Search query: "${q}"`,
    titles.length ? `Matching items: ${titles.join("; ")}.` : "No catalogue items matched.",
    passages.length
      ? `Also found inside PDFs: ${passages.slice(0, 3).map((p) => `"${p.title}" p.${p.page}`).join("; ")}.`
      : "",
    "Write 1-3 sentences explaining the topic and how these items relate to it. Cite a page as p. N only if it is listed above. Reply in the language of the query.",
  ]
    .filter(Boolean)
    .join("\n");

  const model = MODEL_IDS.fast;
  const ai = new GoogleGenAI({ apiKey: key });
  const res = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { maxOutputTokens: SUMMARY_OUTPUT_TOKENS, thinkingConfig: { thinkingBudget: 0 } },
  });
  const text = res.text ?? "";
  return {
    text,
    inputTokens: estimateTokens(prompt),
    outputTokens: estimateTokens(text),
    model,
  };
}

// ── GET /api/search?q=... ─────────────────────────────────────────────────────
export async function GET(req: Request) {
  const ip = clientIp(req.headers);
  const { limit, windowMs } = ratePolicy("search");
  if (!(await rateLimit(ip, limit, windowMs)).success) {
    logSecurityEvent({ type: "rate_limited", where: "/api/search", ip });
    return Response.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("q")?.trim() ?? "";
  if (!raw || raw.length > 300) {
    return Response.json({ error: "Missing or invalid query (max 300 chars)." }, { status: 400 });
  }
  const q = sanitizeFilterTerm(raw);
  if (!q) return Response.json({ error: "Missing or invalid query." }, { status: 400 });

  const started = Date.now();
  let hybrid: HybridResult;
  try {
    hybrid = await hybridSearch(q);
  } catch (err) {
    console.error("[/api/search] search failed:", err);
    return Response.json({ error: "Search failed. Please try again." }, { status: 500 });
  }
  const { books, passages } = hybrid;
  const locale = detectLanguage(raw);

  const baseTelemetry = {
    intent: "book_search" as const,
    locale,
    verbosity: "brief" as const,
    retrievalMs: Date.now() - started,
    embeddingMs: hybrid.embeddingMs,
    cacheHit: hybrid.cacheHit,
    dbQueries: hybrid.dbQueries,
    resultCount: books.length,
  };

  // Zero results, an exact-title hit, or emergency mode: answer from a
  // template. Search itself never depends on the model being available (§26).
  if (isExpensiveSearchDisabled() || !summaryWorthIt(q, books, passages)) {
    recordAiRequest("/api/search", "ok", {
      ...baseTelemetry,
      modelTier: "none",
      model: null,
      deterministic: true,
      latencyMs: Date.now() - started,
      fallback: "no_llm",
    });
    return Response.json({
      answer: books.length ? "" : noResults(raw, locale),
      books,
      passages,
    });
  }

  let answer = "";
  try {
    if (await allowPublicSummary()) {
      const generated = await generateAnswer(q, books.map((b) => b.title), passages);
      if (generated) {
        answer = generated.text;
        recordAiRequest("/api/search", "ok", {
          ...baseTelemetry,
          modelTier: "fast",
          model: generated.model,
          inputTokens: generated.inputTokens,
          outputTokens: generated.outputTokens,
          totalTokens: generated.inputTokens + generated.outputTokens,
          deterministic: false,
          latencyMs: Date.now() - started,
        });
      }
    }
  } catch (err) {
    // Summary is best-effort: quota/RPC/Gemini failure must not break search.
    console.error("[/api/search] AI summary skipped:", err);
    recordAiRequest("/api/search", "fallback", {
      ...baseTelemetry,
      modelTier: "none",
      model: null,
      deterministic: true,
      latencyMs: Date.now() - started,
      fallback: "error",
    });
  }

  return Response.json({ answer, books, passages });
}
