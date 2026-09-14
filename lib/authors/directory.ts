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
import { addressableAuthorSlug } from "@/lib/authors/slug";
import { TAGS } from "@/lib/cache/revalidate";

import { parseAuthorNames } from "@/lib/resources/author-names";

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
};

/** Does a free-text byline string name any of this author's aliases? */
function isNamedIn(raw: string | null | undefined, names: string[]): boolean {
  if (!raw) return false;
  const listed = parseAuthorNames(raw).map((n) => n.toLowerCase());
  return names.some((n) => listed.includes(n));
}

async function loadAuthorDirectory(): Promise<AuthorDirectoryEntry[]> {
  const supabase = createServiceClient();

  const selectWithFallback = async <T,>(table: string, columns: string, fallback: string) => {
    const first = await supabase.from(table).select(columns).limit(5000);
    if (!first.error) return (first.data ?? []) as T[];
    const second = await supabase.from(table).select(fallback).limit(5000);
    return (second.data ?? []) as T[];
  };

  const [academics, bookAuthors, books, authorships, theses, catalog, contributors, credits] =
    await Promise.all([
      selectWithFallback<{ id: string; full_name: string; full_name_km: string | null; slug?: string | null }>(
        "publication_authors",
        "id, full_name, full_name_km, slug",
        "id, full_name, full_name_km",
      ),
      selectWithFallback<{ id: string; name: string; slug?: string | null }>(
        "authors",
        "id, name, slug",
        "id, name",
      ),
      supabase.from("books").select("id, author_id").eq("is_published", true),
      supabase.from("publication_authorships").select("author_id, publications!inner(is_published)"),
      supabase.from("research_reports").select("author_names").eq("is_published", true),
      supabase.from("catalog_books").select("author").eq("is_active", true),
      // Canonical credits. `books.author_id` is a SINGLE foreign key, so a book
      // with three authors can name only one of them there — every other
      // contributor's credit lives here, and counting only the FK is what left
      // 113 scholars with `workCount` 0, unlisted and unlinkable, while their
      // names were rendered on the book page (SEO 3.3 §7.2). Asked for
      // defensively: before 0105 the table does not exist and naming it would
      // fail the WHOLE directory rather than degrade it.
      supabase.from("contributors").select("id, legacy_author_id").limit(5000),
      supabase
        .from("resource_contributors")
        .select("contributor_id, resource_id, resource_type")
        .eq("resource_type", "book")
        .limit(10000),
    ]);

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

  const publishedBookIds = new Set(
    ((books.data ?? []) as { id?: string | null }[]).map((b) => b.id).filter(Boolean) as string[],
  );
  for (const b of (books.data ?? []) as { id?: string | null; author_id: string | null }[]) {
    if (!b.author_id) continue;
    if (b.id) creditBook(b.author_id, b.id);
    else bookCountByAuthorId.set(b.author_id, (bookCountByAuthorId.get(b.author_id) ?? 0) + 1);
  }

  // contributor → the authors row it denotes, so a canonical credit can be
  // attributed to the author URL the directory is built from.
  const authorIdByContributor = new Map<string, string>();
  for (const c of (contributors.data ?? []) as { id: string; legacy_author_id: string | null }[]) {
    if (c.legacy_author_id) authorIdByContributor.set(c.id, c.legacy_author_id);
  }
  for (const rc of (credits.data ?? []) as { contributor_id: string; resource_id: string }[]) {
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
  for (const a of (authorships.data ?? []) as {
    author_id: string | null;
    publications?: { is_published?: boolean } | null;
  }[]) {
    if (!a.author_id) continue;
    if (a.publications?.is_published === false) continue;
    pubCountByAuthorId.set(a.author_id, (pubCountByAuthorId.get(a.author_id) ?? 0) + 1);
  }

  const thesisBylines = ((theses.data ?? []) as { author_names: string | null }[]).map(
    (t) => t.author_names,
  );
  const catalogBylines = ((catalog.data ?? []) as { author: string | null }[]).map((c) => c.author);

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
  } catch {
    return [];
  }
});

/**
 * Authors who have at least one public work — the only ones worth linking.
 *
 * An author page with an empty works list is a soft-404 in the same way an
 * empty subject page is, so the hub does not send crawlers to one.
 */
export async function getListedAuthors(): Promise<AuthorDirectoryEntry[]> {
  return (await getAuthorDirectory()).filter((a) => a.workCount > 0);
}
