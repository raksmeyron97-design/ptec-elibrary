"use server";

/**
 * The upload form's duplicate gate and author picker, server-side.
 *
 * WHY THESE ARE SERVER ACTIONS AND NOT AN API ROUTE. Both read unpublished and
 * archived records — titles, ISBNs and author names that are deliberately not
 * public — so neither may exist as an anonymous endpoint. They carry the same
 * requirement as creating a book (`books: write`), because they are part of
 * creating one: a reader-visible "is this book already here?" service is a
 * different feature with a different threat model.
 *
 * NOTHING HERE IS AUTHORITATIVE. These answers make the form honest before a
 * 40 MB PDF is sent; the checks that actually prevent a duplicate row live at
 * commit time — the partial unique index on book_files.content_hash (0060) and
 * the re-check inside saveBookRecord. A client that skips this action gains
 * nothing.
 */

import { requirePermission } from "@/lib/auth/requireAdmin";
import { rateLimit } from "@/lib/rate-limit";
import {
  findBookDuplicates,
  searchCanonicalAuthors,
  type AuthorSuggestion,
} from "@/lib/books/duplicate-detection/service";
import { validateIsbn, type IsbnStatus } from "@/lib/books/duplicate-detection/normalize";
import type { DuplicateMatch } from "@/lib/books/duplicate-detection/signals";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/i;

/** Field caps. A duplicate check is not a place to accept unbounded text. */
const MAX_TITLE = 400;
const MAX_NAME = 200;
const MAX_ISBN = 40;

export type DuplicateCheckInput = {
  title?: string;
  author?: string;
  isbn?: string;
  publisher?: string;
  year?: number | string | null;
  /** sha256 of the chosen PDF, computed in the browser before upload. */
  contentHash?: string;
  /** Set only when editing an existing record, so it cannot match itself. */
  excludeBookId?: string;
};

export type DuplicateCheckResult =
  | {
      ok: true;
      matches: DuplicateMatch[];
      top: DuplicateMatch | null;
      blocked: boolean;
      truncated: boolean;
      isbn: { status: IsbnStatus; canonical: string | null };
      /** True when the input carried nothing worth matching on. */
      skipped: boolean;
    }
  | { ok: false; error: string };

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function yearOf(value: unknown): number | null {
  const year = Number(value);
  if (!Number.isInteger(year)) return null;
  return year >= 1000 && year <= 3000 ? year : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Forbidden";
}

/**
 * Score the record being drafted against the collection.
 *
 * Called on a debounce while the librarian types, so it is rate-limited per
 * user rather than per request: a stuck client cannot turn the form into a
 * catalogue scanner. The limit is generous enough that normal typing never
 * reaches it.
 */
export async function checkBookDuplicates(
  input: DuplicateCheckInput,
): Promise<DuplicateCheckResult> {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("books", "write");
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
  const { supabase, user } = admin;

  const { success } = await rateLimit(`book-dup-check:${user.id}`, 120, 60_000);
  if (!success) {
    return { ok: false, error: "Too many duplicate checks — pause for a moment." };
  }

  const title = text(input.title, MAX_TITLE);
  const author = text(input.author, MAX_NAME);
  const isbnRaw = text(input.isbn, MAX_ISBN);
  const publisher = text(input.publisher, MAX_NAME);
  const contentHashRaw = text(input.contentHash, 64);
  const contentHash = SHA256_RE.test(contentHashRaw) ? contentHashRaw.toLowerCase() : null;
  const excludeBookId = UUID_RE.test(text(input.excludeBookId, 36))
    ? text(input.excludeBookId, 36)
    : null;

  const isbn = validateIsbn(isbnRaw);

  try {
    const assessment = await findBookDuplicates(supabase, {
      title,
      author: author || null,
      isbn: isbnRaw || null,
      publisher: publisher || null,
      year: yearOf(input.year),
      contentHash,
      excludeBookId,
    });

    return {
      ok: true,
      matches: assessment.matches,
      top: assessment.top,
      blocked: assessment.blocked,
      truncated: assessment.truncated,
      isbn: { status: isbn.status, canonical: isbn.canonical },
      skipped: assessment.examined === 0 && !title && !isbnRaw && !contentHash,
    };
  } catch (error) {
    // A failed lookup is reported as a failure, never as "no duplicates
    // found" — the difference is the whole point of the gate.
    return { ok: false, error: errorMessage(error) };
  }
}

export type AuthorSearchResult =
  | { ok: true; authors: AuthorSuggestion[] }
  | { ok: false; error: string };

/**
 * Existing authors matching what the librarian has typed.
 *
 * The picker offers them; it never picks. Two records whose names merely look
 * alike stay two records until a human says otherwise — see
 * app/actions/authors.ts for why merging is the only safe way to remove one.
 */
export async function searchBookAuthors(query: string): Promise<AuthorSearchResult> {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("books", "write");
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
  const { supabase, user } = admin;

  const needle = text(query, MAX_NAME);
  if (needle.length < 1) return { ok: true, authors: [] };

  const { success } = await rateLimit(`book-author-search:${user.id}`, 180, 60_000);
  if (!success) return { ok: false, error: "Too many lookups — pause for a moment." };

  try {
    return { ok: true, authors: await searchCanonicalAuthors(supabase, needle) };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}
