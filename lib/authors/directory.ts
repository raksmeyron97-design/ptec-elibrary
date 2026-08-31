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
import { slugify } from "@/lib/books";
import { TAGS } from "@/lib/cache/revalidate";

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

/** Comparison key for a byline match — case-folded, whitespace-collapsed. */
function nameKey(value: string | null | undefined): string {
  return (value ?? "").normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Does a byline string name this person? Bylines are free text
 *  ("Sok Dara; Chan Vuthy"), so this is a containment test on the whole
 *  string — the same shape lib/authors/profile.ts uses for thesis matching. */
function bylineNames(byline: string | null | undefined, keys: string[]): boolean {
  const hay = nameKey(byline);
  if (!hay) return false;
  return keys.some((k) => k.length >= 3 && hay.includes(k));
}

async function loadAuthorDirectory(): Promise<AuthorDirectoryEntry[]> {
  const supabase = createServiceClient();

  // `slug` does not exist before migration 0125. Naming a missing column makes
  // PostgREST fail the WHOLE query, which would empty the directory rather
  // than degrade it — so both author reads fall back to a name-derived slug,
  // matching what app/sitemap.ts has always done.
  const selectWithFallback = async <T,>(table: string, columns: string, fallback: string) => {
    const first = await supabase.from(table).select(columns).limit(5000);
    if (!first.error) return (first.data ?? []) as T[];
    const second = await supabase.from(table).select(fallback).limit(5000);
    return (second.data ?? []) as T[];
  };

  const [academics, bookAuthors, books, authorships, theses, catalog] = await Promise.all([
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
    supabase.from("books").select("author_id").eq("is_published", true),
    supabase.from("publication_authorships").select("author_id, publications!inner(is_published)"),
    supabase.from("research_reports").select("author_names").eq("is_published", true),
    supabase.from("catalog_books").select("author").eq("is_active", true),
  ]);

  const bookCountByAuthorId = new Map<string, number>();
  for (const b of (books.data ?? []) as { author_id: string | null }[]) {
    if (!b.author_id) continue;
    bookCountByAuthorId.set(b.author_id, (bookCountByAuthorId.get(b.author_id) ?? 0) + 1);
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
    const slug = rawSlug || slugify(cleanName);
    if (!slug) return;

    const byName = opts.aliases.length > 0 ? opts.aliases : [nameKey(cleanName)];
    const nameMatched =
      thesisBylines.filter((b) => bylineNames(b, byName)).length +
      catalogBylines.filter((b) => bylineNames(b, byName)).length;

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
    const aliases = [nameKey(a.full_name), nameKey(a.full_name_km)].filter((k) => k.length >= 3);
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
      aliases: [nameKey(a.name)].filter((k) => k.length >= 3),
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
