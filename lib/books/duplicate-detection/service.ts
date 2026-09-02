import "server-only";

/**
 * The server half of duplicate detection: fetch a bounded candidate set, then
 * hand it to the pure scorer.
 *
 * Nothing here decides anything. Every rule lives in ./signals.ts, which has no
 * database import and is unit-tested offline — so a change to what counts as a
 * duplicate can never hide inside a query, and this file can never disagree
 * with what /admin/books/duplicates shows.
 *
 * The Supabase client is passed IN rather than created here: every caller has
 * already been through requirePermission("books", "write") and holds the
 * client that guard returned. A module that mints its own service-role client
 * is a module that can be called without a guard.
 */

import { createServiceClient } from "@/lib/supabase/server";
import { assessDuplicates, type DuplicateAssessment, type DuplicateCandidate, type DuplicateQuery } from "./signals";
import { isbnMatchKeys, isMeaningfulAuthor, normalizeTitle } from "./normalize";

type Db = ReturnType<typeof createServiceClient>;

/** Cap on rows the candidate query may return. The RPC clamps this too. */
export const CANDIDATE_LIMIT = 40;

type CandidateRow = {
  id: string;
  slug: string | null;
  title: string | null;
  author: string | null;
  isbn: string | null;
  publisher: string | null;
  year: number | null;
  content_hash: string | null;
  status: string | null;
  is_published: boolean | null;
  cover_url: string | null;
  match_source: string | null;
};

function toCandidate(row: CandidateRow): DuplicateCandidate {
  return {
    id: row.id,
    slug: row.slug ?? "",
    title: row.title ?? "",
    author: row.author,
    isbn: row.isbn,
    year: row.year ?? null,
    publisher: row.publisher,
    contentHash: row.content_hash,
    status: row.status,
    isPublished: Boolean(row.is_published),
    coverUrl: row.cover_url,
  };
}

/** A missing RPC (migration 0130 not yet applied) must degrade, not explode. */
function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /find_book_duplicate_candidates|search_book_authors/.test(error.message ?? "")
  );
}

/**
 * Fallback candidate query for a database that has not applied 0130 yet.
 *
 * Deliberately narrow — exact title, ISBN prefix-free equality is impossible
 * without the expression index, so it matches on the raw column and accepts
 * that a hyphenated row will be missed here. The point is that the FORM keeps
 * working and the authoritative checks at save time (content-hash unique index
 * + the ISBN re-check) still hold; it is not a second detector.
 */
async function fallbackCandidates(db: Db, query: DuplicateQuery): Promise<DuplicateCandidate[]> {
  const title = query.title?.trim();
  if (!title) return [];
  const { data } = await db
    .from("books")
    .select("id, slug, title, isbn, publisher, published_at, status, is_published, cover_url, authors(name), book_files(content_hash)")
    .ilike("title", `${title.slice(0, 60)}%`)
    .limit(CANDIDATE_LIMIT);

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    slug: row.slug ?? "",
    title: row.title ?? "",
    author: row.authors?.name ?? null,
    isbn: row.isbn ?? null,
    year: row.published_at ? new Date(row.published_at).getUTCFullYear() : null,
    publisher: row.publisher ?? null,
    contentHash: row.book_files?.[0]?.content_hash ?? null,
    status: row.status ?? null,
    isPublished: Boolean(row.is_published),
    coverUrl: row.cover_url ?? null,
  }));
}

/**
 * Every book that could be the one being saved, scored and ranked.
 *
 * Returns an empty assessment rather than throwing when the query carries
 * nothing to match on — an upload form with three characters typed must not
 * produce "no duplicates found", which reads as a clean bill of health.
 */
export async function findBookDuplicates(
  db: Db,
  query: DuplicateQuery,
): Promise<DuplicateAssessment> {
  const title = query.title?.trim() ?? "";
  const isbnKeys = isbnMatchKeys(query.isbn);
  const hash = query.contentHash?.trim() || null;
  const author = isMeaningfulAuthor(query.author) ? (query.author ?? "").trim() : null;

  // Nothing identifiable to match on. Not an error, not a clean result.
  if (!normalizeTitle(title) && isbnKeys.length === 0 && !hash) {
    return { matches: [], top: null, blocked: false, examined: 0, truncated: false };
  }

  const { data, error } = await db.rpc("find_book_duplicate_candidates", {
    p_title: title || null,
    p_isbn_keys: isbnKeys.length > 0 ? isbnKeys : null,
    p_author: author,
    p_content_hash: hash,
    p_exclude_id: query.excludeBookId ?? null,
    p_limit: CANDIDATE_LIMIT,
  });

  let candidates: DuplicateCandidate[];
  if (error) {
    if (!isMissingFunction(error)) {
      // A broken lookup must never silently read as "no duplicates". The
      // caller surfaces this as an unknown result, not a pass.
      throw new Error(`Duplicate check failed: ${error.message}`);
    }
    console.warn("[duplicate-detection] 0130 not applied; using the reduced fallback query.");
    candidates = await fallbackCandidates(db, query);
  } else {
    candidates = ((data ?? []) as CandidateRow[]).map(toCandidate);
  }

  return assessDuplicates(query, candidates, { truncated: candidates.length >= CANDIDATE_LIMIT });
}

/* ── Canonical authors ─────────────────────────────────────────────────── */

export type AuthorSuggestion = {
  id: string;
  name: string;
  bookCount: number;
  /** How the row was reached: an exact name, a prefix, a substring, a
   *  trigram near-miss. The picker shows exact differently from fuzzy, so a
   *  librarian is never told two people are one. */
  matchKind: "exact" | "prefix" | "contains" | "fuzzy";
};

const MATCH_KINDS = new Set(["exact", "prefix", "contains", "fuzzy"]);

/** Existing authors that could be who the librarian is typing. */
export async function searchCanonicalAuthors(
  db: Db,
  query: string,
  limit = 8,
): Promise<AuthorSuggestion[]> {
  const needle = query.trim();
  if (!needle) return [];

  const { data, error } = await db.rpc("search_book_authors", {
    p_query: needle,
    p_limit: limit,
  });

  if (error) {
    if (!isMissingFunction(error)) throw new Error(`Author lookup failed: ${error.message}`);
    const { data: rows } = await db
      .from("authors")
      .select("id, name")
      .ilike("name", `%${needle.replace(/[%_\\]/g, "\\$&")}%`)
      .order("name")
      .limit(limit);
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    return ((rows ?? []) as any[]).map((row) => ({
      id: row.id,
      name: row.name,
      bookCount: 0,
      matchKind: "contains" as const,
    }));
  }

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  return ((data ?? []) as any[]).map((row) => ({
    id: row.id as string,
    name: (row.name as string) ?? "",
    bookCount: Number(row.book_count ?? 0),
    matchKind: (MATCH_KINDS.has(row.match_kind) ? row.match_kind : "fuzzy") as AuthorSuggestion["matchKind"],
  }));
}
