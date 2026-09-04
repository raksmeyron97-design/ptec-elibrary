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
import type { CompactWork } from "./context";
import { EMPTY_RETRIEVAL, type RetrievalOutcome } from "./plan";
import {
  EVIDENCE_LIMITS,
  balanceByDocument,
  diversify,
  fuseEvidence,
  spreadPages,
  type EvidenceRecordType,
  type RetrievalMode,
  type RetrievedEvidence,
} from "./evidence";
import { getResourceReadiness } from "./readiness";
import { makeSnippet } from "@/lib/search/snippet";
import { getListedAuthors } from "@/lib/authors/directory";
import { getAuthorProfile } from "@/lib/authors/profile";
import type { AuthorWork } from "@/lib/authors/types";
import { getIndexableSubjects, getSubjectDetail, type SubjectItem } from "@/lib/subjects";
import { personNameKey } from "@/lib/books/duplicate-detection/normalize";
import { normalizeSearchText } from "@/lib/search/normalize";

const COVERS_URL = process.env.NEXT_PUBLIC_R2_COVERS_URL ?? "";

/** Cards a resolved author/subject hub shows before pointing at its page. */
const HUB_RESULT_LIMIT = 5;
/** Subjects named in the "what subjects do you have" overview line. */
const SUBJECT_OVERVIEW_LIMIT = 10;

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
 * Page-level evidence for a document question, across the whole public
 * library. A thin wrapper over `retrieveEvidence` in hybrid mode — kept as a
 * named export because it is the shape the router, the tests and the token
 * benchmark already speak.
 *
 * What changed underneath: it is no longer vector-only. Before, a question
 * quoting a phrase printed on a page could return nothing while
 * /api/search/native found that page instantly, because the chunk's embedding
 * sat below the similarity floor. The lexical leg now runs alongside.
 */
export async function searchPassages(
  rawQuery: string,
  limit = MAX_PASSAGES,
): Promise<RetrievalOutcome> {
  return retrieveEvidence({ query: rawQuery, mode: "hybrid", limit });
}

/** Evidence from inside ONE resource — the "Ask this book" path. */
export async function searchRecordPassages(
  rawQuery: string,
  scope: EvidenceScope,
  limit = EVIDENCE_LIMITS.scoped.evidence,
): Promise<EvidenceOutcome> {
  return retrieveEvidence({ query: rawQuery, mode: "scoped", scope, limit });
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

// ── Research evidence (hybrid, optionally scoped) ─────────────────────────────
// The retrieval half of a grounded answer. Everything here returns
// RetrievedEvidence — a passage that knows which record and page it came from
// — so a citation can be verified against a record id rather than a title
// string, and "save this source" knows what to save.

export interface EvidenceScope {
  recordType: EvidenceRecordType;
  recordId: string;
}

const RECORD_TABLE: Record<EvidenceRecordType, string> = {
  book: "books",
  research: "research_reports",
  publication: "publications",
};

export interface ResolvedRecord {
  recordType: EvidenceRecordType;
  recordId: string;
  slug: string;
  title: string;
  author: string;
  year: string | null;
  url: string;
}

// Row shapes for the selects below. Narrow on purpose: the Supabase client has
// no generated schema types in this repo, and `any` here would silently absorb
// a renamed column into an undefined title.
type BookRecordRow = {
  id: string;
  slug: string;
  title: string;
  published_at: string | null;
  authors: { name: string } | null;
};
type ThesisRecordRow = {
  id: string;
  slug: string | null;
  title: string;
  author_names: string | null;
  academic_year: string | null;
  published_at: string | null;
};
type PublicationRecordRow = {
  id: string;
  slug: string;
  title: string;
  author_names: string | null;
  publication_date: string | null;
};
type PageRow = { record_type: string; record_id: string; page_no: number; content: string };
type ParentMetaRow = {
  id: string;
  slug: string | null;
  title: string;
  authors?: { name: string } | null;
  author_names?: string | null;
};
type ChunkRow = {
  source: string;
  record_id: string;
  ref: string;
  title: string;
  author: string | null;
  page_no: number;
  content: string;
  similarity: number;
};

/**
 * The record a slug names, or null when it is not a published resource.
 *
 * This is the gate scoped retrieval passes through: an unpublished or unknown
 * slug resolves to nothing, so a scoped question about it retrieves nothing
 * rather than falling back to a corpus-wide search that might surface
 * something adjacent (§35 — visibility decided BEFORE retrieval).
 */
export async function resolveRecord(
  recordType: EvidenceRecordType,
  slug: string,
): Promise<ResolvedRecord | null> {
  const clean = sanitizeFilterTerm(slug);
  if (!clean) return null;
  const db = createServiceClient();

  if (recordType === "book") {
    const { data } = await db
      .from("books")
      .select("id, slug, title, published_at, authors(name)")
      .eq("slug", clean)
      .eq("is_published", true)
      .maybeSingle();
    const row = data as BookRecordRow | null;
    if (!row) return null;
    return {
      recordType,
      recordId: row.id,
      slug: row.slug,
      title: row.title,
      author: row.authors?.name ?? "Unknown",
      year: row.published_at ? String(row.published_at).slice(0, 4) : null,
      url: `/books/${row.slug}`,
    };
  }

  if (recordType === "research") {
    const { data } = await db
      .from("research_reports")
      .select("id, slug, title, author_names, academic_year, published_at")
      .or(`slug.eq.${clean},id.eq.${clean}`)
      .eq("is_published", true)
      .maybeSingle();
    const row = data as ThesisRecordRow | null;
    if (!row) return null;
    const ref = row.slug ?? row.id;
    return {
      recordType,
      recordId: row.id,
      slug: ref,
      title: row.title,
      author: row.author_names ?? "Unknown",
      year: row.academic_year ?? (row.published_at ? String(row.published_at).slice(0, 4) : null),
      url: `/theses/${ref}`,
    };
  }

  const { data } = await db
    .from("publications")
    .select("id, slug, title, author_names, publication_date")
    .eq("slug", clean)
    .eq("is_published", true)
    .maybeSingle();
  const row = data as PublicationRecordRow | null;
  if (!row) return null;
  return {
    recordType,
    recordId: row.id,
    slug: row.slug,
    title: row.title,
    author: row.author_names ?? "Unknown",
    year: row.publication_date ? String(row.publication_date).slice(0, 4) : null,
    url: `/publications/${row.slug}`,
  };
}

/**
 * The published record whose title the words name, searched across all three
 * collections. Books first — the largest collection, and the one a bare title
 * usually means.
 *
 * The database is asked with the words in order (`%research%design%`), which
 * tolerates a dropped comma or article, and every candidate is then confirmed
 * on normalized text so a single shared word cannot claim a match. Returns
 * null rather than a best guess: a comparison built on the wrong document is
 * worse than one that says it could not find it.
 */
export async function findRecordByTitle(rawTitle: string): Promise<ResolvedRecord | null> {
  const clean = sanitizeFilterTerm(rawTitle);
  const normalized = normalizeSearchText(clean);
  if (normalized.length < 3) return null;
  const words = clean.split(/\s+/).filter((w) => w.length >= 3).slice(0, 6);
  if (!words.length) return null;
  const pattern = `%${words.join("%")}%`;
  const db = createServiceClient();
  const matches = (title: string) => {
    const t = normalizeSearchText(title);
    return t.includes(normalized) || normalized.includes(t);
  };

  const { data: books } = await db
    .from("books")
    .select("id, slug, title, published_at, authors(name)")
    .eq("is_published", true)
    .ilike("title", pattern)
    .order("download_count", { ascending: false })
    .limit(5);
  const book = ((books ?? []) as unknown as BookRecordRow[]).find((b) => matches(b.title));
  if (book) {
    return {
      recordType: "book",
      recordId: book.id,
      slug: book.slug,
      title: book.title,
      author: book.authors?.name ?? "Unknown",
      year: book.published_at ? String(book.published_at).slice(0, 4) : null,
      url: `/books/${book.slug}`,
    };
  }

  const { data: theses } = await db
    .from("research_reports")
    .select("id, slug, title, author_names, academic_year, published_at")
    .eq("is_published", true)
    .ilike("title", pattern)
    .limit(5);
  const thesis = ((theses ?? []) as unknown as ThesisRecordRow[]).find((r) => matches(r.title));
  if (thesis) {
    const ref = thesis.slug ?? thesis.id;
    return {
      recordType: "research",
      recordId: thesis.id,
      slug: ref,
      title: thesis.title,
      author: thesis.author_names ?? "Unknown",
      year: thesis.academic_year ?? null,
      url: `/theses/${ref}`,
    };
  }

  const { data: publications } = await db
    .from("publications")
    .select("id, slug, title, author_names, publication_date")
    .eq("is_published", true)
    .ilike("title", pattern)
    .limit(5);
  const publication = ((publications ?? []) as unknown as PublicationRecordRow[]).find((p) => matches(p.title));
  if (!publication) return null;
  return {
    recordType: "publication",
    recordId: publication.id,
    slug: publication.slug,
    title: publication.title,
    author: publication.author_names ?? "Unknown",
    year: publication.publication_date ? String(publication.publication_date).slice(0, 4) : null,
    url: `/publications/${publication.slug}`,
  };
}

/** Parent metadata for page rows, published-checked. One query per type. */
async function hydratePages(
  db: Db,
  rows: PageRow[],
  query: string,
): Promise<RetrievedEvidence[]> {
  const idsByType = new Map<EvidenceRecordType, string[]>();
  for (const r of rows) {
    const type = r.record_type as EvidenceRecordType;
    if (!RECORD_TABLE[type]) continue;
    idsByType.set(type, [...(idsByType.get(type) ?? []), r.record_id]);
  }

  const meta = new Map<string, { title: string; author: string; ref: string }>();
  await Promise.all(
    [...idsByType.entries()].map(async ([type, ids]) => {
      const select =
        type === "book"
          ? "id, slug, title, authors(name)"
          : type === "research"
            ? "id, slug, title, author_names"
            : "id, slug, title, author_names";
      const { data } = await db
        .from(RECORD_TABLE[type])
        .select(select)
        .in("id", [...new Set(ids)])
        .eq("is_published", true);
      for (const row of (data ?? []) as unknown as ParentMetaRow[]) {
        meta.set(`${type}:${row.id}`, {
          title: row.title,
          author: row.authors?.name ?? row.author_names ?? "Unknown",
          ref: row.slug ?? row.id,
        });
      }
    }),
  );

  const out: RetrievedEvidence[] = [];
  for (const r of rows) {
    const type = r.record_type as EvidenceRecordType;
    const info = meta.get(`${type}:${r.record_id}`);
    if (!info) continue; // unpublished or missing parent — never citable
    out.push({
      recordType: type,
      recordId: r.record_id,
      matchType: "pdf_exact",
      title: info.title,
      author: info.author,
      url: urlFor(type, info.ref),
      page: Number(r.page_no) || 1,
      text: makeSnippet(String(r.content ?? ""), query, PASSAGE_CHARS / 4),
      similarity: 1,
      score: 0,
    });
  }
  return out;
}

/**
 * Pages containing the query text verbatim.
 *
 * This is the leg the AI path never had: `book_pages` was searched only by
 * /api/search/native, so a question quoting a phrase printed on page 24 could
 * be answered "I found no evidence" while the search box found it instantly.
 * Scoped queries filter in SQL, not afterwards.
 */
async function lexicalPages(
  db: Db,
  query: string,
  scope: EvidenceScope | undefined,
  limit: number,
): Promise<RetrievedEvidence[]> {
  const q = sanitizeFilterTerm(query);
  if (q.length < 3) return [];
  try {
    let request = db
      .from("book_pages")
      .select("record_type, record_id, page_no, content")
      .ilike("content", `%${q}%`);
    if (scope) {
      request = request.eq("record_type", scope.recordType).eq("record_id", scope.recordId);
    }
    const { data, error } = await request.order("page_no", { ascending: true }).limit(limit * 3);
    if (error || !data?.length) return [];
    return hydratePages(db, data as unknown as PageRow[], q);
  } catch (err) {
    console.error("[ai/retrieval] lexical pages:", err instanceof Error ? err.message : err);
    return [];
  }
}

/** Chunks nearest the query vector, corpus-wide or inside one record. */
async function semanticChunks(
  db: Db,
  vec: number[],
  scope: EvidenceScope | undefined,
  limit: number,
): Promise<RetrievedEvidence[]> {
  const rpc = scope
    ? db.rpc("match_record_chunks", {
        query_embedding: vec,
        p_record_type: scope.recordType,
        p_record_id: scope.recordId,
        match_count: limit,
        min_similarity: CHUNK_MIN_SIMILARITY,
      })
    : db.rpc("match_book_chunks", {
        query_embedding: vec,
        match_count: limit,
        min_similarity: CHUNK_MIN_SIMILARITY,
      });

  const { data, error } = await rpc;
  if (error) {
    // A database without 0135 (or without chunks) lands here; the lexical leg
    // still carries the answer.
    console.error("[ai/retrieval] semantic chunks:", error.message);
    return [];
  }
  const out: RetrievedEvidence[] = [];
  for (const r of (data ?? []) as ChunkRow[]) {
    const type = r.source as EvidenceRecordType;
    if (!RECORD_TABLE[type]) continue;
    out.push({
      recordType: type,
      recordId: r.record_id,
      matchType: "semantic",
      title: r.title,
      author: r.author ?? "Unknown",
      url: urlFor(type, r.ref),
      page: Number(r.page_no) || 1,
      text: String(r.content ?? "").slice(0, PASSAGE_CHARS),
      similarity: Number(r.similarity ?? 0),
      score: 0,
    });
  }
  return out;
}

export interface RetrieveEvidenceInput {
  query: string;
  mode: RetrievalMode;
  /** Restrict retrieval to one record. Applied in SQL, never after the fact. */
  scope?: EvidenceScope;
  /** Overrides the mode's evidence cap. */
  limit?: number;
}

export interface EvidenceOutcome extends RetrievalOutcome {
  evidence: RetrievedEvidence[];
  /** Rows the two legs produced before fusion and diversity. */
  candidateCount: number;
  /** False when the resource has no embedded chunks — an honest "exact only". */
  semanticAvailable: boolean;
}

function emptyEvidence(): EvidenceOutcome {
  return { ...EMPTY_RETRIEVAL, evidence: [], candidateCount: 0, semanticAvailable: false };
}

function evidenceToResults(evidence: readonly RetrievedEvidence[]): SearchResult[] {
  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const e of evidence) {
    if (seen.has(e.url)) continue;
    seen.add(e.url);
    out.push({
      slug: e.url.split("/").pop() ?? "",
      title: e.title,
      author: e.author,
      coverUrl: null,
      url: e.url,
      type: KIND_FOR[e.recordType] ?? "book",
    });
  }
  return out;
}

/**
 * Hybrid evidence retrieval — the one entry point for grounded answers.
 *
 *   query (+ scope) → lexical pages ∥ semantic chunks → fuse → diversify
 *
 * The two legs run in parallel and are fused by reciprocal rank, so neither
 * can starve the other, and a page both agree on leads. Diversity is
 * directional: a scoped question keeps several pages of one document, an
 * unscoped one prefers several documents (see lib/ai/evidence.ts).
 *
 * The semantic leg is SKIPPED, not merely allowed to fail, when readiness says
 * the record has no embedded chunks — an embedding call that can only return
 * nothing is pure cost, and the caller needs to know the difference between
 * "no evidence" and "never indexed".
 */
export async function retrieveEvidence(input: RetrieveEvidenceInput): Promise<EvidenceOutcome> {
  const started = Date.now();
  const out = emptyEvidence();
  const query = sanitizeFilterTerm(input.query);
  const limits = EVIDENCE_LIMITS[input.mode];
  const limit = input.limit ?? limits.evidence;
  if (!query || limit <= 0) {
    out.retrievalMs = Date.now() - started;
    return out;
  }

  const scope = input.scope;
  const readiness = scope ? await getResourceReadiness(scope.recordType, scope.recordId) : null;
  const semanticAllowed = readiness ? readiness.semanticReady : Boolean(process.env.GEMINI_API_KEY);

  const key = cacheKey([
    "evidence",
    input.mode,
    scope?.recordType,
    scope?.recordId,
    normalizeQuery(query),
    limit,
  ]);

  const { value, hit } = await cached<{
    evidence: RetrievedEvidence[];
    candidateCount: number;
    dbQueries: number;
    embeddingMs: number;
    semanticAvailable: boolean;
    fallback?: RetrievalOutcome["fallback"];
  }>("retrieval", key, async () => {
    const db = createServiceClient();
    const [lexical, embedding] = await Promise.all([
      lexicalPages(db, query, scope, limits.candidates),
      semanticAllowed ? embedQuery(query) : Promise.resolve({ vector: null, ms: 0, cacheHit: false }),
    ]);

    let semantic: RetrievedEvidence[] = [];
    let dbQueries = 1;
    if (embedding.vector) {
      semantic = await semanticChunks(db, embedding.vector, scope, limits.candidates);
      dbQueries += 1;
    }

    const fused = fuseEvidence([lexical, semantic]);
    const evidence =
      input.mode === "summary"
        ? spreadPages(fused, limit)
        : diversify(fused, { limit, perResource: limits.perResource });

    return {
      evidence,
      candidateCount: lexical.length + semantic.length,
      dbQueries,
      embeddingMs: embedding.ms,
      semanticAvailable: semanticAllowed && Boolean(embedding.vector),
      fallback: !semanticAllowed && lexical.length > 0 ? ("keyword" as const) : undefined,
    };
  });

  out.evidence = value.evidence;
  out.passages = value.evidence;
  out.results = evidenceToResults(value.evidence);
  out.candidateCount = value.candidateCount;
  out.semanticAvailable = value.semanticAvailable;
  out.dbQueries = hit ? 0 : value.dbQueries;
  out.embeddingMs = hit ? 0 : value.embeddingMs;
  out.cacheHit = hit;
  out.fallback = hit ? "cache" : value.fallback;
  out.retrievalMs = Date.now() - started;
  return out;
}

/**
 * Evidence for a comparison: each document retrieved inside its own scope,
 * then balanced so neither side can crowd the other out of the prompt.
 */
export async function retrieveComparison(
  query: string,
  records: readonly ResolvedRecord[],
): Promise<EvidenceOutcome> {
  const started = Date.now();
  const out = emptyEvidence();
  if (records.length === 0) {
    out.retrievalMs = Date.now() - started;
    return out;
  }

  const limits = EVIDENCE_LIMITS.multi_document;
  const perDocument = await Promise.all(
    records.map((record) =>
      retrieveEvidence({
        query,
        mode: "multi_document",
        scope: { recordType: record.recordType, recordId: record.recordId },
        limit: limits.perResource,
      }),
    ),
  );

  out.evidence = balanceByDocument(
    records.map((record, i) => ({ label: record.title, evidence: perDocument[i].evidence })),
    limits,
  );
  out.passages = out.evidence;
  out.results = records.map((record) => ({
    slug: record.slug,
    title: record.title,
    author: record.author,
    coverUrl: null,
    url: record.url,
    type: KIND_FOR[record.recordType] ?? "book",
  }));
  out.works = records.map((record) => ({
    title: record.title,
    author: record.author,
    year: record.year ?? undefined,
  }));
  out.candidateCount = perDocument.reduce((sum, r) => sum + r.candidateCount, 0);
  out.semanticAvailable = perDocument.some((r) => r.semanticAvailable);
  out.dbQueries = perDocument.reduce((sum, r) => sum + r.dbQueries, 0);
  out.embeddingMs = perDocument.reduce((sum, r) => sum + r.embeddingMs, 0);
  out.cacheHit = perDocument.every((r) => r.cacheHit);
  out.retrievalMs = Date.now() - started;
  return out;
}

// ── Directory hubs (zero-LLM path) ────────────────────────────────────────────
// Author and subject questions resolve against the same fetchers the public
// /authors and /subjects pages use, so the assistant can only name a person or
// subject that has a page, and can only count what that page counts.

const HUB_KIND: Record<string, ResultKind> = {
  publication: "publication",
  thesis: "research",
  ebook: "book",
  book: "book",
  catalog: "catalog",
};

function slugOfHref(href: string): string {
  return href.split("?")[0].split("#")[0].split("/").filter(Boolean).pop() ?? href;
}

function authorWorkCard(w: AuthorWork, fallbackAuthor: string): { result: SearchResult; work: CompactWork } {
  const author = w.byline ?? fallbackAuthor;
  return {
    result: { slug: slugOfHref(w.href), title: w.title, author, coverUrl: w.coverUrl, url: w.href, type: HUB_KIND[w.type] ?? "book" },
    work: { title: w.title, author, kind: w.venue ?? undefined, summary: w.excerpt ?? undefined, year: w.year ?? undefined },
  };
}

function subjectItemCard(item: SubjectItem, subject: string): { result: SearchResult; work: CompactWork } {
  const author = item.author ?? "Unknown";
  return {
    result: { slug: slugOfHref(item.href), title: item.title, author, coverUrl: null, url: item.href, type: HUB_KIND[item.type] ?? "book" },
    work: { title: item.title, author, kind: subject, summary: item.excerpt ?? undefined },
  };
}

/**
 * The published work whose title contains the phrase, punctuation aside.
 * The database is asked with the phrase's words in order ("%research%design%
 * qualitative%"), which tolerates a missing Oxford comma; the row is then
 * confirmed on normalized text so "design" alone cannot claim a match.
 */
async function findWorkByTitle(
  db: Db,
  query: string,
  normalized: string,
): Promise<{ result: SearchResult; work: CompactWork; dbQueries: number } | null> {
  const words = sanitizeFilterTerm(query).split(/\s+/).filter((w) => w.length >= 3).slice(0, 6);
  if (!words.length) return null;
  const pattern = `%${words.join("%")}%`;
  const titled = (title: string) => normalizeSearchText(title).includes(normalized);

  const { data: books } = await db
    .from("books")
    .select("slug, title, cover_url, description, department, published_at, authors(name), categories(name)")
    .eq("is_published", true)
    .ilike("title", pattern)
    .order("download_count", { ascending: false })
    .limit(5);
  const book = ((books ?? []) as { title: string }[]).find((b) => titled(b.title));
  if (book) return { ...bookRow(book), dbQueries: 1 };

  const { data: theses } = await db
    .from("research_reports")
    .select("id, slug, title, cover_url, abstract, author_names, program, subject, academic_year")
    .eq("is_published", true)
    .ilike("title", pattern)
    .limit(5);
  const thesis = ((theses ?? []) as { title: string }[]).find((r) => titled(r.title));
  return thesis ? { ...thesisRow(thesis), dbQueries: 2 } : null;
}

/**
 * The person a question names, resolved through the public author directory.
 * Exact normalized name first (the same identity rule the upload gate uses),
 * then a name that contains the query. No match → the catalogue is searched
 * for the words instead, so a misread question still returns something real.
 */
export async function searchAuthors(rawQuery: string): Promise<RetrievalOutcome> {
  const started = Date.now();
  const out = emptyOutcome();
  const query = rawQuery.trim();
  if (!query) {
    out.retrievalMs = Date.now() - started;
    return out;
  }

  const wanted = personNameKey(query);
  const loose = normalizeSearchText(query);
  const authors = await getListedAuthors();
  out.dbQueries = 1;

  const exact = authors.filter((a) => personNameKey(a.name) === wanted || (a.nameKm && personNameKey(a.nameKm) === wanted));
  const partial = exact.length || loose.length < 3
    ? []
    : authors.filter((a) => {
        const name = normalizeSearchText(a.name);
        const nameKm = normalizeSearchText(a.nameKm);
        return name.includes(loose) || (nameKm !== "" && nameKm.includes(loose)) || (name.includes(" ") && loose.includes(name));
      });
  const pick = [...exact, ...partial].sort((a, b) => b.workCount - a.workCount)[0];

  if (!pick) {
    // "Who wrote <title>?" names a work, not a person: answer with the work
    // whose title contains the question, and its byline. Anything else is a
    // name the directory does not hold, and the honest answer is that.
    const titled = await findWorkByTitle(createServiceClient(), query, loose);
    out.dbQueries += titled ? titled.dbQueries : 2;
    if (titled) {
      out.results = [titled.result];
      out.works = [titled.work];
    }
    out.retrievalMs = Date.now() - started;
    return out;
  }

  const profile = await getAuthorProfile(pick.slug);
  out.dbQueries = 2;
  out.retrievalMs = Date.now() - started;
  if (!profile) return out;

  const cards = profile.works.slice(0, HUB_RESULT_LIMIT).map((w) => authorWorkCard(w, profile.name));
  out.hub = { kind: "author", name: profile.name, url: `/authors/${profile.slug}`, count: profile.works.length };
  out.results = cards.map((c) => c.result);
  out.works = cards.map((c) => c.work);
  return out;
}

/**
 * A subject by name → its hub and first resources; no name → the subject
 * index as one fact line; a name that is not a subject → a catalogue search.
 */
export async function searchSubjects(rawQuery: string): Promise<RetrievalOutcome> {
  const started = Date.now();
  const out = emptyOutcome();
  const subjects = await getIndexableSubjects();
  out.dbQueries = 1;

  const q = normalizeSearchText(rawQuery);
  if (!q) {
    out.facts = [
      [...subjects]
        .sort((a, b) => b.counts.total - a.counts.total || a.name.localeCompare(b.name))
        .slice(0, SUBJECT_OVERVIEW_LIMIT)
        .map((s) => `${s.name} (${s.counts.total})`)
        .join(" · "),
    ].filter(Boolean);
    out.retrievalMs = Date.now() - started;
    return out;
  }

  const match =
    subjects.find((s) => normalizeSearchText(s.name) === q) ??
    subjects.find((s) => {
      const name = normalizeSearchText(s.name);
      return name.includes(q) || (name.length >= 3 && q.includes(name));
    });

  if (!match) {
    const fallback = await searchWorks(rawQuery, { keywordOnly: true });
    fallback.dbQueries += out.dbQueries;
    fallback.retrievalMs = Date.now() - started;
    return fallback;
  }

  const detail = await getSubjectDetail(match.slug);
  out.dbQueries = 2;
  out.retrievalMs = Date.now() - started;
  if (!detail) return out;

  const cards = detail.items.slice(0, HUB_RESULT_LIMIT).map((item) => subjectItemCard(item, detail.name));
  out.hub = { kind: "subject", name: detail.name, url: `/subjects/${detail.slug}`, count: detail.counts.total };
  out.results = cards.map((c) => c.result);
  out.works = cards.map((c) => c.work);
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
