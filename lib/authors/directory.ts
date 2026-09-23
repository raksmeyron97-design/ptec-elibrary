// lib/authors/directory.ts
//
// The author DIRECTORY — every person with public work in the library, with
// enough of a count to be worth a link. Backs /authors, and is the reason
// /authors/[slug] is no longer an orphan (docs/SEO-V2-AUDIT.md F-4).
//
// Distinct from lib/authors/profile.ts on purpose: that module resolves ONE
// person completely (works, biography, external identities). This one resolves
// EVERY person shallowly. Running the profile loader across the whole roster
// would be four queries per author.
//
// ── The two author tables ────────────────────────────────────────────────────
//
// `publication_authors` holds academic profiles (biography, ORCID, interests);
// `authors` holds e-book authors. A person can exist in one, the other, or
// both, and the slug is the join key — exactly the reconciliation
// app/sitemap.ts already performs to emit author URLs. That logic lives here
// now, and the sitemap keeps its own copy only until the two can be merged
// safely (both must survive the pre-0125 no-`slug`-column case).
//
// ── What is counted ──────────────────────────────────────────────────────────
//
// Books (via books.author_id) and publications (via publication_authorships)
// are exact foreign-key counts. Theses and physical catalog records associate
// by NAME — those tables store a byline string, not a link — so they are
// matched in memory against the same alias set lib/authors/profile.ts uses.
// A name-matched count is approximate by construction, which is why the hub
// shows a single "works" figure rather than a per-type breakdown it cannot
// stand behind.

import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { pagedScan, type PagedScanResult } from "@/lib/db/paged-scan";
import { addressableAuthorSlug } from "@/lib/authors/slug";
import { TAGS } from "@/lib/cache/revalidate";

import { parseAuthorNames } from "@/lib/resources/author-names";
import { assessContributorName } from "@/lib/resources/contributor-trust";

export type AuthorDirectoryEntry = {
  slug: string;
  name: string;
  nameKm: string | null;
  /** Public works attributable to this person. Always >= 1 for a listed entry. */
  workCount: number;
  /** True when an academic profile record backs this person (biography, ORCID,
   *  interests may exist). Used only to order the roster — never displayed as
   *  a claim about the person. */
  hasProfile: boolean;
  /**
   * False when the row's name provably does not identify anybody — an
   * operating-system account, a program's name, a placeholder, a telephone
   * number (lib/resources/contributor-trust.ts).
   *
   * Carried rather than filtered here, because the WHOLE roster is what an
   * audit and an admin repair queue need to see. `getListedAuthors()` is the
   * public read, and that is where the rule is applied.
   */
  identified: boolean;
};

/** Does a free-text byline string name any of this author's aliases? */
function isNamedIn(raw: string | null | undefined, names: string[]): boolean {
  if (!raw) return false;
  const listed = parseAuthorNames(raw).map((n) => n.toLowerCase());
  return names.some((n) => listed.includes(n));
}

/**
 * Ceiling on how far one of these scans will PAGE.
 *
 * NOT a limit one request can honour: PostgREST clips every response at 1000
 * rows whatever `.limit()` says, so the `.limit(5000)` and `.limit(10000)` this
 * loader used to carry were decoration. It read the first 1,000 of 1,956
 * published books and the first 1,000 canonical credits, which is why the hub
 * credited the Ministry of Education with 652 works against 1,037, and why 223
 * author pages answering `index, follow` were in no sitemap, on no hub and
 * linked from none of their own books (SEO corpus audit, 2026-09-23, F-A1).
 */
const DIRECTORY_SCAN_CAP = 100_000;

/** PostgREST / Postgres codes for "that table is not there". */
const MISSING_TABLE = new Set(["42P01", "PGRST205"]);

/**
 * A scan the roster is COUNTED from, so it must be complete.
 *
 * Throwing degrades the whole directory to empty, and that is the safe
 * direction here because empty is already a handled, honest answer: an empty
 * roster means UNKNOWN downstream — `lib/authors/sitemap-filter.ts` emits
 * author URLs unfiltered rather than concluding nobody has works. A PARTIAL
 * roster is the opposite: it reports work counts that are quietly too low, and
 * a count of zero is what removes an author from /authors, from the sitemap and
 * from their own books' bylines.
 */
function counted<T>(table: string, scan: PagedScanResult<T>): T[] {
  if (scan.error) {
    throw new Error(`[author-directory] ${table}: ${scan.error.message ?? "read failed"}`);
  }
  if (scan.truncated) {
    throw new Error(`[author-directory] ${table}: scan hit the ${DIRECTORY_SCAN_CAP}-row ceiling`);
  }
  return scan.data;
}

/**
 * The same, for a table that may not EXIST yet.
 *
 * `contributors` and `resource_contributors` arrive in 0105. Naming a table
 * that is not there fails the whole directory rather than degrading it, which
 * is why they were asked for defensively — but "the table is missing" is the
 * only failure that may pass quietly. Every other error, and every truncation,
 * is a credit count that would come out too low, so it is still fatal.
 */
function optional<T>(table: string, scan: PagedScanResult<T>): T[] {
  if (scan.error && MISSING_TABLE.has(scan.error.code ?? "")) return [];
  return counted(table, scan);
}

async function loadAuthorDirectory(): Promise<AuthorDirectoryEntry[]> {
  const supabase = createServiceClient();

  /**
   * A paged scan that falls back to a narrower projection.
   *
   * The fallback is the pre-0125 "no `slug` column" case: PostgREST answers
   * 42703 for the whole request, so the retry re-runs the WHOLE scan rather
   * than resuming — a scan that changed its column list mid-way would hand the
   * mapper two row shapes.
   */
  const scanWithFallback = async <T,>(table: string, columns: string, fallback: string) => {
    const run = (cols: string) =>
      pagedScan<T>(
        (from, to) =>
          supabase.from(table).select(cols).order("id", { ascending: true }).range(from, to),
        DIRECTORY_SCAN_CAP,
      );
    const first = await run(columns);
    if (!first.error) return counted(table, first);
    return counted(table, await run(fallback));
  };

  // Every sweep orders on a UNIQUE key before it pages: two LIMIT/OFFSET
  // windows over an unordered query may hand the same row to both or to
  // neither, and an author whose row falls in the gap reads as an author with
  // no works.
  const [academics, bookAuthors, bookScan, authorshipScan, thesisScan, catalogScan, contributorScan, creditScan] =
    await Promise.all([
      scanWithFallback<{ id: string; full_name: string; full_name_km: string | null; slug?: string | null }>(
        "publication_authors",
        "id, full_name, full_name_km, slug",
        "id, full_name, full_name_km",
      ),
      scanWithFallback<{ id: string; name: string; slug?: string | null }>(
        "authors",
        "id, name, slug",
        "id, name",
      ),
      pagedScan<{ id?: string | null; author_id: string | null }>(
        (from, to) =>
          supabase
            .from("books")
            .select("id, author_id")
            .eq("is_published", true)
            .order("id", { ascending: true })
            .range(from, to),
        DIRECTORY_SCAN_CAP,
      ),
      // `publication_authorships` has no `id`; its primary key is
      // (publication_id, author_id), so the sweep orders on both.
      pagedScan<{ author_id: string | null; publications?: { is_published?: boolean } | null }>(
        (from, to) =>
          supabase
            .from("publication_authorships")
            .select("publication_id, author_id, publications!inner(is_published)")
            .order("publication_id", { ascending: true })
            .order("author_id", { ascending: true })
            .range(from, to),
        DIRECTORY_SCAN_CAP,
      ),
      pagedScan<{ author_names: string | null }>(
        (from, to) =>
          supabase
            .from("research_reports")
            .select("id, author_names")
            .eq("is_published", true)
            .order("id", { ascending: true })
            .range(from, to),
        DIRECTORY_SCAN_CAP,
      ),
      pagedScan<{ author: string | null }>(
        (from, to) =>
          supabase
            .from("catalog_books")
            .select("id, author")
            .eq("is_active", true)
            .order("id", { ascending: true })
            .range(from, to),
        DIRECTORY_SCAN_CAP,
      ),
      pagedScan<{ id: string; legacy_author_id: string | null }>(
        (from, to) =>
          supabase
            .from("contributors")
            .select("id, legacy_author_id")
            .order("id", { ascending: true })
            .range(from, to),
        DIRECTORY_SCAN_CAP,
      ),
      // Canonical credits. `books.author_id` is a SINGLE foreign key, so a book
      // with three authors can name only one of them there — every other
      // contributor's credit lives here, and counting only the FK is what left
      // 113 scholars with `workCount` 0, unlisted and unlinkable, while their
      // names were rendered on the book page (SEO 3.3 §7.2).
      pagedScan<{ contributor_id: string; resource_id: string }>(
        (from, to) =>
          supabase
            .from("resource_contributors")
            .select("id, contributor_id, resource_id, resource_type")
            .eq("resource_type", "book")
            .order("id", { ascending: true })
            .range(from, to),
        DIRECTORY_SCAN_CAP,
      ),
    ]);

  const books = counted("books", bookScan);
  const authorships = counted("publication_authorships", authorshipScan);
  const theses = counted("research_reports", thesisScan);
  const catalog = counted("catalog_books", catalogScan);
  const contributors = optional("contributors", contributorScan);
  const credits = optional("resource_contributors", creditScan);

  const bookCountByAuthorId = new Map<string, number>();
  const countedBooks = new Map<string, Set<string>>();
  const creditBook = (authorId: string, bookId: string) => {
    // A SET per author, not a counter: the legacy FK and the canonical credit
    // describe the same book for a single-author title, and adding both would
    // report every ordinary author as having written each of their books
    // twice.
    const seen = countedBooks.get(authorId) ?? new Set<string>();
    seen.add(bookId);
    countedBooks.set(authorId, seen);
  };

  const publishedBookIds = new Set(books.map((b) => b.id).filter(Boolean) as string[]);
  for (const b of books) {
    if (!b.author_id) continue;
    if (b.id) creditBook(b.author_id, b.id);
    else bookCountByAuthorId.set(b.author_id, (bookCountByAuthorId.get(b.author_id) ?? 0) + 1);
  }

  // contributor → the authors row it denotes, so a canonical credit can be
  // attributed to the author URL the directory is built from.
  const authorIdByContributor = new Map<string, string>();
  for (const c of contributors) {
    if (c.legacy_author_id) authorIdByContributor.set(c.id, c.legacy_author_id);
  }
  for (const rc of credits) {
    const authorId = authorIdByContributor.get(rc.contributor_id);
    // Only PUBLISHED books count, exactly as the legacy leg does — a credit on
    // an unpublished book is not a public work.
    if (!authorId || !publishedBookIds.has(rc.resource_id)) continue;
    creditBook(authorId, rc.resource_id);
  }

  for (const [authorId, seen] of countedBooks) {
    bookCountByAuthorId.set(authorId, (bookCountByAuthorId.get(authorId) ?? 0) + seen.size);
  }

  const pubCountByAuthorId = new Map<string, number>();
  for (const a of authorships) {
    if (!a.author_id) continue;
    if (a.publications?.is_published === false) continue;
    pubCountByAuthorId.set(a.author_id, (pubCountByAuthorId.get(a.author_id) ?? 0) + 1);
  }

  const thesisBylines = theses.map((t) => t.author_names);
  const catalogBylines = catalog.map((c) => c.author);

  // slug → entry. Academic profiles are merged first so their richer identity
  // (Khmer name, profile flag) wins over a bare e-book author row of the same
  // person.
  const bySlug = new Map<string, AuthorDirectoryEntry>();

  const add = (
    rawSlug: string | null | undefined,
    name: string | null | undefined,
    opts: { nameKm?: string | null; hasProfile: boolean; count: number; aliases: string[] },
  ) => {
    const cleanName = name?.replace(/\s+/g, " ").trim();
    if (!cleanName) return;
    const slug = addressableAuthorSlug(rawSlug, cleanName);
    if (!slug) return;

    const byName = opts.aliases.length > 0 ? opts.aliases : [cleanName.toLowerCase()];
    const nameMatched =
      thesisBylines.filter((b) => isNamedIn(b, byName)).length +
      catalogBylines.filter((b) => isNamedIn(b, byName)).length;

    const existing = bySlug.get(slug);
    if (existing) {
      existing.workCount += opts.count;
      existing.hasProfile = existing.hasProfile || opts.hasProfile;
      existing.nameKm = existing.nameKm ?? opts.nameKm ?? null;
      return;
    }
    bySlug.set(slug, {
      slug,
      name: cleanName,
      nameKm: opts.nameKm ?? null,
      workCount: opts.count + nameMatched,
      hasProfile: opts.hasProfile,
      identified: assessContributorName(cleanName).trust !== "invalid",
    });
  };

  for (const a of academics) {
    const aliases = [a.full_name, a.full_name_km]
      .map((n) => n?.trim().toLowerCase())
      .filter((n): n is string => !!n && n.length >= 2);
    add(a.slug, a.full_name, {
      nameKm: a.full_name_km?.trim() || null,
      hasProfile: true,
      count: pubCountByAuthorId.get(a.id) ?? 0,
      aliases,
    });
  }
  for (const a of bookAuthors) {
    add(a.slug, a.name, {
      hasProfile: false,
      count: bookCountByAuthorId.get(a.id) ?? 0,
      aliases: [a.name.trim().toLowerCase()].filter((k) => k.length >= 2),
    });
  }

  return [...bySlug.values()].sort(
    (a, b) => b.workCount - a.workCount || a.name.localeCompare(b.name),
  );
}

const cachedAuthorDirectory = unstable_cache(loadAuthorDirectory, ["author-directory-v1"], {
  revalidate: 3600,
  tags: [TAGS.books, TAGS.publications, TAGS.theses, TAGS.catalogBooks],
});

/** The whole roster, including people with no public works yet. */
export const getAuthorDirectory = cache(async (): Promise<AuthorDirectoryEntry[]> => {
  try {
    return await cachedAuthorDirectory();
  } catch (err) {
    // Empty is the honest degraded answer and downstream reads it as UNKNOWN
    // (lib/authors/sitemap-filter.ts). A PARTIAL roster would not be: it under-
    // counts works, and an author whose count reaches zero is dropped from
    // /authors, from the sitemap and from their own books — which is why the
    // scans above throw rather than return what they managed to fetch.
    console.error("[author-directory] read failed:", err instanceof Error ? err.message : err);
    return [];
  }
});

/**
 * Authors who have at least one public work AND a name that identifies
 * somebody — the only ones worth linking.
 *
 * Two rules, one predicate, because they fail the same way. An author page
 * with an empty works list is a soft-404 in the same way an empty subject page
 * is. An author page whose name is an operating-system account is worse than a
 * soft-404: it is a `Person` this library invented, and it was in production —
 * `/authors/windows-user`, `/authors/user`, `/authors/pptxgenjs` and
 * `/authors/channa-0977-33-61-62` all answered 200 with `index, follow`, the
 * last of them credited with 621 books (docs/DATA-QUALITY-2026-09.md §2).
 *
 * The rows are NOT deleted and the books keep the byline they were catalogued
 * with. What stops is the recommendation: this list backs /authors, the
 * sitemap and the AI's author vocabulary, and none of those should carry a
 * name the library cannot stand behind.
 */
export async function getListedAuthors(): Promise<AuthorDirectoryEntry[]> {
  return (await getAuthorDirectory()).filter((a) => a.workCount > 0 && a.identified);
}
