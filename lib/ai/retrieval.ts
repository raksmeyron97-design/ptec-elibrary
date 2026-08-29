// lib/ai/retrieval.ts
// All database and embedding access for the assistant, behind one adaptive
// policy. Server-only.
//
// Two things this module fixes outright:
//
//  1. ONE embedder for both sides of every vector search. /api/ask used to
//     query `books.embedding` — filled with gemini-embedding-001 /
//     RETRIEVAL_DOCUMENT vectors — using text-embedding-004 query vectors, so
//     its "semantic search" compared points from two unrelated spaces and the
//     route quietly fell through to keyword search on every request while
//     still paying for the embedding call (audit §2.1).
//
//  2. A QUERY BUDGET. Keyword-first for anything a plain ilike can answer,
//     semantic only when keyword comes up short. The common book search costs
//     one query and zero embeddings; a PDF question costs one embedding and
//     one RPC (§18).

import "server-only";

import { GoogleGenAI } from "@google/genai";
import { createServiceClient } from "@/lib/supabase/server";
import { getSiteConfig } from "@/lib/system-settings/config";
import { LIBRARY_INFO, type LibraryInfoTopic } from "@/lib/library-info";
import { EMBEDDING_DIM, EMBEDDING_MODEL } from "./models";
import { cacheKey, cached } from "./cache";
import { filterTokens, orFilter, sanitizeFilterTerm } from "./guardrails";
import { normalizeQuery } from "./intent";
import { MAX_PASSAGES, MAX_RESULTS } from "./token-budget";
import type { AILocale, ResultKind, SearchResult } from "./response";
import type { RetrievedPassage } from "./citations";
import type { CompactWork } from "./context";
import { EMPTY_RETRIEVAL, type RetrievalOutcome } from "./plan";

const COVERS_URL = process.env.NEXT_PUBLIC_R2_COVERS_URL ?? "";

/** Semantic thresholds. Chunks are held to a higher bar than work metadata
 *  because a weak page match produces a confident-sounding wrong citation. */
const WORK_MIN_SIMILARITY = 0.25;
const CHUNK_MIN_SIMILARITY = 0.3;
/** Keyword hits at or above this count make the semantic pass unnecessary. */
const KEYWORD_SUFFICIENT = 3;
/** Raw chars kept per retrieved passage before context compression trims it. */
const PASSAGE_CHARS = 600;

// ── Shared row → UI mappers ───────────────────────────────────────────────────
export function coverUrlOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw.startsWith("http") ? raw : `${COVERS_URL}/${raw}`;
}

const ROUTE_FOR: Record<string, string> = {
  book: "/books",
  research: "/theses",
  catalog: "/catalogs",
  publication: "/publications",
  learning_path: "/paths",
  post: "/posts",
};

export function urlFor(source: string, ref: string): string {
  return `${ROUTE_FOR[source] ?? "/books"}/${ref}`;
}

const KIND_FOR: Record<string, ResultKind> = {
  book: "book",
  research: "research",
  catalog: "catalog",
  publication: "publication",
  learning_path: "path",
  post: "post",
};

// ── Result envelope ───────────────────────────────────────────────────────────
// The shape itself lives in ./plan (pure) so the benchmark and the decision
// tests can construct one without pulling in Supabase.
export type { RetrievalOutcome } from "./plan";

function emptyOutcome(): RetrievalOutcome {
  return { ...EMPTY_RETRIEVAL };
}

// ── Embedding ─────────────────────────────────────────────────────────────────
function l2normalize(values: number[]): number[] {
  const mag = Math.sqrt(values.reduce((s, x) => s + x * x, 0)) || 1;
  return values.map((x) => x / mag);
}

/**
 * Query-side embedding, cached by normalized text. Returns null rather than
 * throwing: every caller has a keyword path to fall back to, and an embedding
 * outage must degrade search, not break it (§26).
 */
export async function embedQuery(
  text: string,
): Promise<{ vector: number[] | null; ms: number; cacheHit: boolean }> {
  const normalized = normalizeQuery(text);
  if (!normalized) return { vector: null, ms: 0, cacheHit: false };

  const key = cacheKey([EMBEDDING_MODEL, EMBEDDING_DIM, normalized]);
  const started = Date.now();
  try {
    const { value, hit } = await cached<number[] | null>("embedding", key, async () => {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return null;
      const ai = new GoogleGenAI({ apiKey });
      const res = await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: normalized,
        config: { outputDimensionality: EMBEDDING_DIM, taskType: "RETRIEVAL_QUERY" },
      });
      const values = res.embeddings?.[0]?.values;
      return values?.length ? l2normalize(values) : null;
    });
    return { vector: value, ms: hit ? 0 : Date.now() - started, cacheHit: hit };
  } catch (err) {
    console.error("[ai/retrieval] embedding failed:", err instanceof Error ? err.message : err);
    return { vector: null, ms: Date.now() - started, cacheHit: false };
  }
}

// ── Keyword search, one table per resource type ───────────────────────────────
type Db = ReturnType<typeof createServiceClient>;

/* eslint-disable @typescript-eslint/no-explicit-any */

async function keywordBooks(db: Db, query: string, limit: number) {
  const tokens = filterTokens(query);
  if (!tokens.length) return [];
  const { data, error } = await db
    .from("books")
    .select("slug, title, cover_url, description, department, published_at, authors(name), categories(name)")
    .eq("is_published", true)
    .or(orFilter(["title", "description"], tokens))
    .order("download_count", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[ai/retrieval] books keyword search:", error.message);
    return [];
  }
  return (data ?? []) as any[];
}

async function keywordTheses(db: Db, query: string, limit: number) {
  const tokens = filterTokens(query);
  if (!tokens.length) return [];
  const { data, error } = await db
    .from("research_reports")
    .select("id, slug, title, cover_url, abstract, author_names, program, subject, academic_year")
    .eq("is_published", true)
    .or(orFilter(["title", "abstract", "author_names"], tokens))
    .order("view_count", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[ai/retrieval] theses keyword search:", error.message);
    return [];
  }
  return (data ?? []) as any[];
}

async function keywordPosts(db: Db, query: string, limit: number) {
  const tokens = filterTokens(query);
  if (!tokens.length) return [];
  const { data, error } = await db
    .from("posts")
    .select("slug, title, cover_url, excerpt, category, created_at")
    .eq("is_published", true)
    .or(orFilter(["title", "excerpt"], tokens))
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[ai/retrieval] posts keyword search:", error.message);
    return [];
  }
  return (data ?? []) as any[];
}

function bookRow(b: any): { result: SearchResult; work: CompactWork } {
  return {
    result: {
      slug: b.slug,
      title: b.title,
      author: b.authors?.name ?? "Unknown",
      coverUrl: coverUrlOf(b.cover_url),
      url: `/books/${b.slug}`,
      type: "book",
    },
    work: {
      title: b.title,
      author: b.authors?.name ?? "Unknown",
      kind: b.categories?.name ?? b.department ?? undefined,
      summary: b.description ?? undefined,
      year: b.published_at ? String(b.published_at).slice(0, 4) : undefined,
    },
  };
}

function thesisRow(r: any): { result: SearchResult; work: CompactWork } {
  const ref = r.slug ?? r.id;
  return {
    result: {
      slug: ref,
      title: r.title,
      author: r.author_names ?? "Unknown",
      coverUrl: coverUrlOf(r.cover_url),
      url: `/theses/${ref}`,
      type: "research",
    },
    work: {
      title: r.title,
      author: r.author_names ?? "Unknown",
      kind: r.subject ?? r.program ?? undefined,
      summary: r.abstract ?? undefined,
      year: r.academic_year ?? undefined,
    },
  };
}

function postRow(p: any): { result: SearchResult; work: CompactWork } {
  return {
    result: {
      slug: p.slug,
      title: p.title,
      author: p.category ?? "News",
      coverUrl: coverUrlOf(p.cover_url),
      url: `/posts/${p.slug}`,
      type: "post",
    },
    work: {
      title: p.title,
      author: p.category ?? "News",
      kind: "News",
      summary: p.excerpt ?? undefined,
      year: p.created_at ? String(p.created_at).slice(0, 4) : undefined,
    },
  };
}

// ── Semantic work search ──────────────────────────────────────────────────────
async function semanticWorks(
  db: Db,
  vec: number[],
  limit: number,
  types?: ReadonlySet<ResultKind>,
): Promise<Array<{ result: SearchResult; work: CompactWork }>> {
  const { data, error } = await db.rpc("match_library", {
    query_embedding: vec,
    match_count: Math.max(limit * 2, 8),
    min_similarity: WORK_MIN_SIMILARITY,
  });
  if (error) {
    console.error("[ai/retrieval] match_library:", error.message);
    return [];
  }
  const out: Array<{ result: SearchResult; work: CompactWork }> = [];
  for (const r of (data ?? []) as any[]) {
    const kind = KIND_FOR[r.source] ?? "book";
    if (types && !types.has(kind)) continue;
    out.push({
      result: {
        slug: r.ref,
        title: r.title,
        author: r.author ?? "Unknown",
        coverUrl: coverUrlOf(r.cover_url ?? null),
        url: urlFor(r.source, r.ref),
        type: kind,
      },
      work: { title: r.title, author: r.author ?? "Unknown", kind: r.category ?? undefined },
    });
    if (out.length >= limit) break;
  }
  return out;
}

// ── Passage search ────────────────────────────────────────────────────────────
async function matchChunks(db: Db, vec: number[], limit: number): Promise<RetrievedPassage[]> {
  const { data, error } = await db.rpc("match_book_chunks", {
    query_embedding: vec,
    match_count: Math.max(limit * 3, 9),
    min_similarity: CHUNK_MIN_SIMILARITY,
  });
  if (error) {
    // Pre-migration databases and empty chunk tables land here — the caller
    // still has metadata results to work with.
    console.error("[ai/retrieval] match_book_chunks:", error.message);
    return [];
  }
  // Rows arrive ranked. Keep at most one passage per work so three passages
  // mean three different sources rather than three pages of one book.
  const seen = new Set<string>();
  const out: RetrievedPassage[] = [];
  for (const r of (data ?? []) as any[]) {
    const url = urlFor(r.source, r.ref);
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({
      title: r.title,
      author: r.author ?? "Unknown",
      url,
      page: Number(r.page_no) || 1,
      text: String(r.content ?? "").slice(0, PASSAGE_CHARS),
      similarity: Number(r.similarity ?? 0),
    });
    if (out.length >= limit) break;
  }
  return out;
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Public API ────────────────────────────────────────────────────────────────
export interface SearchOptions {
  /** Which collections to search. Defaults to books. */
  types?: readonly ResultKind[];
  limit?: number;
  /** Skip the semantic pass entirely (used when the query is an exact title). */
  keywordOnly?: boolean;
}

/**
 * Adaptive catalog search (§17).
 *
 * Keyword first — one indexed `ilike` fan-out over the requested table. If it
 * returns enough strong hits, we stop: no embedding call, no vector scan, one
 * DB query. Only a thin keyword result triggers the semantic pass, which is
 * where conceptual questions ("books about how children learn to read") are
 * actually answered.
 *
 * Results are cached under the normalized query, so the same question from two
 * users in the same five minutes costs one round of work.
 */
export async function searchWorks(
  rawQuery: string,
  opts: SearchOptions = {},
): Promise<RetrievalOutcome> {
  const started = Date.now();
  const out = emptyOutcome();
  const query = sanitizeFilterTerm(rawQuery);
  if (!query) return out;

  const limit = opts.limit ?? MAX_RESULTS;
  const types = new Set<ResultKind>(opts.types ?? ["book"]);
  const key = cacheKey(["works", normalizeQuery(query), [...types].sort().join("+"), limit, opts.keywordOnly]);

  const { value, hit } = await cached<{
    results: SearchResult[];
    works: CompactWork[];
    dbQueries: number;
    embeddingMs: number;
    fallback?: RetrievalOutcome["fallback"];
  }>("retrieval", key, async () => {
    const db = createServiceClient();
    let dbQueries = 0;
    let embeddingMs = 0;

    const rows: Array<{ result: SearchResult; work: CompactWork }> = [];
    if (types.has("book")) {
      dbQueries++;
      rows.push(...(await keywordBooks(db, query, limit)).map(bookRow));
    }
    if (types.has("research")) {
      dbQueries++;
      rows.push(...(await keywordTheses(db, query, limit)).map(thesisRow));
    }
    if (types.has("post")) {
      dbQueries++;
      rows.push(...(await keywordPosts(db, query, limit)).map(postRow));
    }

    let fallback: RetrievalOutcome["fallback"];
    if (rows.length < KEYWORD_SUFFICIENT && !opts.keywordOnly) {
      const emb = await embedQuery(query);
      embeddingMs = emb.ms;
      if (emb.vector) {
        dbQueries++;
        const semantic = await semanticWorks(db, emb.vector, limit, types);
        const seen = new Set(rows.map((r) => r.result.url));
        for (const s of semantic) {
          if (seen.has(s.result.url)) continue;
          seen.add(s.result.url);
          rows.push(s);
        }
      } else if (rows.length === 0) {
        fallback = "no_embedding";
      }
    } else if (rows.length >= KEYWORD_SUFFICIENT) {
      fallback = "keyword";
    }

    const capped = rows.slice(0, limit);
    return {
      results: capped.map((r) => r.result),
      works: capped.map((r) => r.work),
      dbQueries,
      embeddingMs,
      fallback,
    };
  });

  out.results = value.results;
  out.works = value.works;
  out.dbQueries = hit ? 0 : value.dbQueries;
  out.embeddingMs = hit ? 0 : value.embeddingMs;
  out.cacheHit = hit;
  out.fallback = hit ? "cache" : value.fallback;
  out.retrievalMs = Date.now() - started;
  return out;
}

/**
 * Page-level evidence for a document question. One embedding + one RPC, and
 * the passages are capped at MAX_PASSAGES before they ever reach the context
 * builder — six 700-character chunks per request was the single largest
 * avoidable input cost in the old /api/chat (audit §4.8).
 */
export async function searchPassages(
  rawQuery: string,
  limit = MAX_PASSAGES,
): Promise<RetrievalOutcome> {
  const started = Date.now();
  const out = emptyOutcome();
  const query = sanitizeFilterTerm(rawQuery);
  if (!query) return out;

  const key = cacheKey(["chunks", normalizeQuery(query), limit]);
  const { value, hit } = await cached<{
    passages: RetrievedPassage[];
    dbQueries: number;
    embeddingMs: number;
    fallback?: RetrievalOutcome["fallback"];
  }>("retrieval", key, async () => {
    const emb = await embedQuery(query);
    if (!emb.vector) {
      return { passages: [], dbQueries: 0, embeddingMs: emb.ms, fallback: "no_embedding" as const };
    }
    const db = createServiceClient();
    const passages = await matchChunks(db, emb.vector, limit);
    return { passages, dbQueries: 1, embeddingMs: emb.ms };
  });

  out.passages = value.passages;
  out.results = value.passages.map((p) => ({
    slug: p.url.split("/").pop() ?? "",
    title: p.title,
    author: p.author,
    coverUrl: null,
    url: p.url,
    type: (p.url.startsWith("/theses") ? "research" : p.url.startsWith("/publications") ? "publication" : "book") as ResultKind,
  }));
  out.dbQueries = hit ? 0 : value.dbQueries;
  out.embeddingMs = hit ? 0 : value.embeddingMs;
  out.cacheHit = hit;
  out.fallback = hit ? "cache" : value.fallback;
  out.retrievalMs = Date.now() - started;
  return out;
}

/** Metadata for one book. One query. */
export async function getBookDetail(slug: string): Promise<RetrievalOutcome> {
  const started = Date.now();
  const out = emptyOutcome();
  const clean = sanitizeFilterTerm(slug);
  if (!clean) return out;

  const db = createServiceClient();
  const { data, error } = await db
    .from("books")
    .select("slug, title, cover_url, description, department, language, pages, rating, published_at, authors(name), categories(name)")
    .eq("slug", clean)
    .eq("is_published", true)
    .maybeSingle();
  out.dbQueries = 1;
  out.retrievalMs = Date.now() - started;
  if (error || !data) return out;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { result, work } = bookRow(data as any);
  out.results = [result];
  out.works = [work];
  return out;
}

/**
 * Books sharing this one's category or author.
 *
 * The pre-2.0 version filtered with `.or("categories.name.ilike.…")` on a
 * top-level query — PostgREST cannot filter an embedded resource that way
 * without `!inner`, so the filter was silently ignored and the function
 * returned "most-downloaded books minus this one" for every input (audit §2.2).
 * Filtering on the foreign keys we already have avoids the embed entirely.
 */
export async function getRelatedBooks(slug: string, limit = 4): Promise<RetrievalOutcome> {
  const started = Date.now();
  const out = emptyOutcome();
  const clean = sanitizeFilterTerm(slug);
  if (!clean) return out;

  const db = createServiceClient();
  const { data: seed } = await db
    .from("books")
    .select("id, category_id, author_id")
    .eq("slug", clean)
    .maybeSingle();
  out.dbQueries = 1;
  if (!seed) {
    out.retrievalMs = Date.now() - started;
    return out;
  }

  const filters: string[] = [];
  if (seed.category_id) filters.push(`category_id.eq.${seed.category_id}`);
  if (seed.author_id) filters.push(`author_id.eq.${seed.author_id}`);

  let q = db
    .from("books")
    .select("slug, title, cover_url, description, department, published_at, authors(name), categories(name)")
    .eq("is_published", true)
    .neq("slug", clean)
    .order("download_count", { ascending: false })
    .limit(limit);
  if (filters.length) q = q.or(filters.join(","));

  const { data, error } = await q;
  out.dbQueries = 2;
  out.retrievalMs = Date.now() - started;
  if (error) {
    console.error("[ai/retrieval] related books:", error.message);
    return out;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((data ?? []) as any[]).map(bookRow);
  out.results = rows.map((r) => r.result);
  out.works = rows.map((r) => r.work);
  return out;
}

// ── Library facts (zero-LLM path) ─────────────────────────────────────────────
/**
 * One library fact, already rendered in the reader's language.
 *
 * Contact details, address and hours come from PUBLISHED system settings, not
 * from lib/library-info — restating them in code is exactly how the assistant
 * once quoted a phone number the admin panel had already replaced.
 */
export async function getLibraryFact(
  topic: LibraryInfoTopic,
  locale: AILocale,
): Promise<{ text: string; link?: string; dbQueries: number; cacheHit: boolean }> {
  const key = cacheKey(["fact", topic, locale]);
  const { value, hit } = await cached<{ text: string; link?: string }>("faq", key, async () => {
    const cfg = await getSiteConfig();
    const L = LIBRARY_INFO;
    const pick = (v: { en: string; km: string }) => (locale === "km" ? v.km : v.en);

    switch (topic) {
      case "hours":
        return { text: pick(cfg.hours), link: L.links.timings };
      case "location":
        return {
          text: `${pick(cfg.address)}${cfg.phone ? ` · ${cfg.phone}` : ""}${cfg.email ? ` · ${cfg.email}` : ""}`,
          link: L.links.contact,
        };
      case "contact":
        return {
          text: [cfg.phone, cfg.email, cfg.links.website].filter(Boolean).join(" · "),
          link: L.links.contact,
        };
      case "borrowing":
        return { text: pick(L.borrowing), link: L.links.rules };
      case "rules":
        return { text: pick(L.rules), link: L.links.rules };
      case "membership":
        return { text: pick(L.membership), link: L.links.rules };
      case "about":
        return { text: pick(L.about), link: L.links.about };
      case "mission":
        return { text: pick(L.mission), link: L.links.about };
      case "vision":
        return { text: pick(L.vision), link: L.links.about };
      case "values":
        return { text: pick(L.values), link: L.links.about };
      case "collection":
        return { text: pick(L.collection), link: L.links.collection };
      case "history":
        return { text: pick(L.history), link: L.links.journey };
      case "services":
        return { text: pick(L.services), link: L.links.about };
      default:
        return { text: "" };
    }
  });
  return { ...value, dbQueries: hit ? 0 : 1, cacheHit: hit };
}

/**
 * Everything a general library question might need, in one compact bundle.
 * Used when the router knows the question is about the library but not which
 * fact it wants — cheaper and more accurate than a model round-trip to pick a
 * tool, which is what the pre-2.0 `get_library_info` tool call cost.
 */
export async function getLibraryOverview(locale: AILocale): Promise<string[]> {
  const topics: LibraryInfoTopic[] = ["hours", "location", "contact", "borrowing", "collection"];
  const facts = await Promise.all(topics.map((t) => getLibraryFact(t, locale)));
  return facts
    .map((f, i) => (f.text ? `${topics[i]}: ${f.text}` : ""))
    .filter(Boolean);
}
