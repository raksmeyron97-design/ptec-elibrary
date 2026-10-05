"use server";
// app/admin/catalogs/isbn-actions.ts
// "Add by ISBN" — look an ISBN up, and nothing else. This action writes no
// catalogue record: the librarian reviews a candidate on the ordinary Add form
// and saves it there. Order follows docs/KOHA-ISBN-WORKFLOW.md:
//   validate → PTEC duplicate → Koha duplicate → cache → providers.

import { requirePermission } from "@/lib/auth/requireAdmin";
import { rateLimit } from "@/lib/rate-limit";
import { ratePolicy } from "@/lib/rate-limit-policy";
import { parseIsbnInput } from "@/lib/isbn/identity";
import { lookupIsbnMetadata } from "@/lib/isbn/resolver";
import { createSupabaseIsbnCache } from "@/lib/isbn/cache";
import { createOpenLibraryProvider } from "@/lib/isbn/providers/open-library";
import { createGoogleBooksProvider } from "@/lib/isbn/providers/google-books";
import type { IsbnCandidate, ProviderErrorKind, ProviderOutcome } from "@/lib/isbn/types";
import { fetchJson } from "@/lib/isbn/providers/fetch-json";
import { parseTitleSearch, titleSearchUrl, type TitleSearchResult } from "@/lib/isbn/title-search";
import { getKohaClient, getKohaConfig } from "@/lib/koha";
import { kohaCanRead } from "@/lib/koha/config";
import { findKohaBiblioIdsByIsbn } from "@/lib/koha/biblios";
import { KohaError } from "@/lib/koha/errors";

export type LocalIsbnMatch = {
  id: string;
  slug: string;
  title: string;
  author: string | null;
  isActive: boolean;
  copiesTotal: number;
};

export type KohaIsbnCheck =
  | { status: "not_connected" }
  | { status: "checked"; matches: { biblioId: number; title: string | null; author: string | null }[] }
  | { status: "error"; message: string };

export type IsbnLookupResponse =
  | { status: "invalid"; reason: "empty" | "not_an_isbn" | "bad_check_digit" }
  | { status: "rate_limited" }
  | { status: "error"; message: string }
  | {
      status: "ok";
      isbn13: string;
      isbn10: string | null;
      local: LocalIsbnMatch[];
      koha: KohaIsbnCheck;
      /** False when a PTEC record already has this ISBN and the librarian has not asked to look up anyway. */
      lookedUp: boolean;
      candidates: IsbnCandidate[];
      outcomes: ProviderOutcome[];
    };

// Providers are created once per server process so Google's quota pause
// outlives a single request. Neither holds a secret beyond the optional key.
const openLibrary = createOpenLibraryProvider({ fetch: (u, i) => fetch(u, i) });
const googleBooks = createGoogleBooksProvider({
  fetch: (u, i) => fetch(u, i),
  apiKey: process.env.GOOGLE_BOOKS_API_KEY?.trim() || null,
});

export async function lookupCatalogIsbn(
  raw: string,
  opts: { lookUpEvenIfCatalogued?: boolean } = {},
): Promise<IsbnLookupResponse> {
  const { supabase, userId } = await requirePermission("catalog", "write");

  const policy = ratePolicy("isbnLookup");
  const allowed = await rateLimit(`isbn-lookup:${userId}`, policy.limit, policy.windowMs);
  if (!allowed.success) return { status: "rate_limited" };

  const parsed = parseIsbnInput(typeof raw === "string" ? raw.slice(0, 40) : "");
  if (!parsed.ok) return { status: "invalid", reason: parsed.reason };
  const { isbn13, isbn10 } = parsed;

  // 1. Already in the PTEC catalogue? catalog_books.isbn is stored as digits
  //    (lib/catalog.ts normalizeIsbn), in either form.
  const { data: localRows, error: localError } = await supabase
    .from("catalog_books")
    .select("id, slug, title, author, is_active, copies_total")
    .in("isbn", isbn10 ? [isbn13, isbn10] : [isbn13])
    .limit(10);
  if (localError) return { status: "error", message: `Could not check the catalogue for this ISBN (${localError.message}).` };
  const local: LocalIsbnMatch[] = (localRows ?? []).map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    author: r.author,
    isActive: r.is_active,
    copiesTotal: r.copies_total ?? 0,
  }));

  // 2. Already in Koha? Only when the integration can read; otherwise say so.
  let koha: KohaIsbnCheck = { status: "not_connected" };
  if (kohaCanRead(getKohaConfig())) {
    try {
      const matches = await findKohaBiblioIdsByIsbn(getKohaClient(), isbn13, isbn10);
      koha = { status: "checked", matches: matches.map((b) => ({ biblioId: b.biblio_id, title: b.title, author: b.author })) };
    } catch (e) {
      koha = { status: "error", message: e instanceof KohaError ? e.message : "The Koha check failed." };
    }
  }

  // 3. A record we already hold is usually a reason to add copies, not a new
  //    record — so providers are not asked until the librarian says otherwise.
  if (local.length > 0 && !opts.lookUpEvenIfCatalogued) {
    return { status: "ok", isbn13, isbn10, local, koha, lookedUp: false, candidates: [], outcomes: [] };
  }

  // 4. Cache, then providers.
  const { candidates, outcomes } = await lookupIsbnMetadata(isbn13, isbn10, {
    providers: [
      { name: "open_library", lookup: openLibrary },
      { name: "google_books", lookup: googleBooks },
    ],
    cache: createSupabaseIsbnCache(supabase),
  });

  return { status: "ok", isbn13, isbn10, local, koha, lookedUp: true, candidates, outcomes };
}

// ── Fetch by ISBN on an existing record, in two honest steps (Slice 5) ─────────
//
// The edit form shows each step as it really finishes: first this catalogue
// and Koha, then the providers. One call could only show both as done at once,
// which is a progress bar pretending. Each step is its own request and is
// charged to the same per-user bucket as Add by ISBN, so a lookup costs two of
// the 60 per 10 minutes — enough for a librarian at the shelf, not for a loop.

export type IsbnIdentityResponse =
  | { status: "invalid"; reason: "empty" | "not_an_isbn" | "bad_check_digit" }
  | { status: "rate_limited" }
  | { status: "error"; message: string }
  | { status: "ok"; isbn13: string; isbn10: string | null; local: LocalIsbnMatch[]; koha: KohaIsbnCheck };

/** Step 1: is the ISBN valid, and who already holds it — this catalogue, Koha. Asks no provider. */
export async function checkIsbnIdentity(raw: string): Promise<IsbnIdentityResponse> {
  const { supabase, userId } = await requirePermission("catalog", "write");

  const policy = ratePolicy("isbnLookup");
  const allowed = await rateLimit(`isbn-lookup:${userId}`, policy.limit, policy.windowMs);
  if (!allowed.success) return { status: "rate_limited" };

  const parsed = parseIsbnInput(typeof raw === "string" ? raw.slice(0, 40) : "");
  if (!parsed.ok) return { status: "invalid", reason: parsed.reason };
  const { isbn13, isbn10 } = parsed;

  const { data: localRows, error: localError } = await supabase
    .from("catalog_books")
    .select("id, slug, title, author, is_active, copies_total")
    .in("isbn", isbn10 ? [isbn13, isbn10] : [isbn13])
    .limit(10);
  if (localError) return { status: "error", message: `Could not check the catalogue for this ISBN (${localError.message}).` };
  const local: LocalIsbnMatch[] = (localRows ?? []).map((r) => ({
    id: r.id, slug: r.slug, title: r.title, author: r.author, isActive: r.is_active, copiesTotal: r.copies_total ?? 0,
  }));

  let koha: KohaIsbnCheck = { status: "not_connected" };
  if (kohaCanRead(getKohaConfig())) {
    try {
      const matches = await findKohaBiblioIdsByIsbn(getKohaClient(), isbn13, isbn10);
      koha = { status: "checked", matches: matches.map((b) => ({ biblioId: b.biblio_id, title: b.title, author: b.author })) };
    } catch (e) {
      koha = { status: "error", message: e instanceof KohaError ? e.message : "The Koha check failed." };
    }
  }
  return { status: "ok", isbn13, isbn10, local, koha };
}

export type IsbnProvidersResponse =
  | { status: "invalid" }
  | { status: "rate_limited" }
  | { status: "ok"; candidates: IsbnCandidate[]; outcomes: ProviderOutcome[] };

/** Step 2: the cache, then Open Library and Google Books in parallel. The ISBN is re-validated here. */
export async function lookupIsbnProviders(isbn13: string): Promise<IsbnProvidersResponse> {
  const { supabase, userId } = await requirePermission("catalog", "write");
  const parsed = parseIsbnInput(typeof isbn13 === "string" ? isbn13.slice(0, 40) : "");
  if (!parsed.ok) return { status: "invalid" };

  const policy = ratePolicy("isbnLookup");
  const allowed = await rateLimit(`isbn-lookup:${userId}`, policy.limit, policy.windowMs);
  if (!allowed.success) return { status: "rate_limited" };

  const { candidates, outcomes } = await lookupIsbnMetadata(parsed.isbn13, parsed.isbn10, {
    providers: [
      { name: "open_library", lookup: openLibrary },
      { name: "google_books", lookup: googleBooks },
    ],
    cache: createSupabaseIsbnCache(supabase),
  });
  return { status: "ok", candidates, outcomes };
}

// ── Search by title and author (Slice 7) ──────────────────────────────────────

export type TitleSearchResponse =
  | { status: "invalid" }
  | { status: "rate_limited" }
  | { status: "error"; kind: ProviderErrorKind }
  | { status: "ok"; results: TitleSearchResult[] };

/**
 * For a book whose ISBN the librarian does not have: ask Open Library by title
 * and author. Returns SUGGESTIONS OF ISBNs only (lib/isbn/title-search.ts);
 * the record's details still come through Fetch by ISBN. Charged to the same
 * per-user bucket as the ISBN lookups; nothing is cached and nothing is written.
 */
export async function searchOpenLibraryByTitle(title: string, author: string | null): Promise<TitleSearchResponse> {
  const { userId } = await requirePermission("catalog", "write");
  const url = titleSearchUrl(typeof title === "string" ? title : "", typeof author === "string" ? author : null);
  if (!url) return { status: "invalid" };

  const policy = ratePolicy("isbnLookup");
  const allowed = await rateLimit(`isbn-lookup:${userId}`, policy.limit, policy.windowMs);
  if (!allowed.success) return { status: "rate_limited" };

  const answer = await fetchJson((u, i) => fetch(u, i), url, 8_000);
  if (!answer.ok) return { status: "error", kind: answer.kind };
  return { status: "ok", results: parseTitleSearch(answer.body) };
}
