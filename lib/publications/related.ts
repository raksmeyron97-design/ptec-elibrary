import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { mapRowToPublication, type Publication } from "@/lib/publications";
import { mapRowToBook, type Book } from "@/lib/books";

/**
 * Related-content fetching for the publication detail page.
 *
 * These queries used to live inside the rendering components, which meant the
 * page could not know whether the "Related" region would have anything in it
 * until after it had already emitted a nav anchor pointing at it. Fetching
 * here lets the page build its section nav from what actually rendered.
 */

export type RelatedReason = "journal" | "keywords" | "author" | "popular";

export interface RelatedPublication {
  publication: Publication;
  reason: RelatedReason;
}

const TARGET = 6;

/**
 * Cascades through relatedness signals, strongest first, until TARGET items
 * are collected: same journal → shared keywords → same first author →
 * most-viewed fallback. Each item keeps the reason it was chosen so the card
 * can say why it is being shown.
 */
export async function getRelatedPublications({
  currentId,
  journalName,
  keywords,
  firstAuthorId,
}: {
  currentId: string;
  journalName: string | null;
  keywords: string[];
  firstAuthorId: string | null;
}): Promise<RelatedPublication[]> {
  const supabase = createServiceClient();
  const seen = new Set<string>([currentId]);
  const collected: RelatedPublication[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const absorb = (rows: any[] | null, reason: RelatedReason) => {
    for (const row of rows ?? []) {
      if (collected.length >= TARGET) return;
      if (!row || seen.has(row.id)) continue;
      seen.add(row.id);
      collected.push({ publication: mapRowToPublication(row), reason });
    }
  };

  if (journalName) {
    const { data } = await supabase
      .from("publications_with_stats")
      .select("*")
      .eq("is_published", true)
      .eq("journal_name", journalName)
      .neq("id", currentId)
      .order("publication_date", { ascending: false, nullsFirst: false })
      .limit(12);
    absorb(data, "journal");
  }

  if (collected.length < TARGET && keywords.length > 0) {
    const { data } = await supabase
      .from("publications_with_stats")
      .select("*")
      .eq("is_published", true)
      .neq("id", currentId)
      .overlaps("keywords", keywords)
      .order("publication_date", { ascending: false, nullsFirst: false })
      .limit(12);
    absorb(data, "keywords");
  }

  if (collected.length < TARGET && firstAuthorId) {
    const { data } = await supabase
      .from("publication_authorships")
      .select("publications!inner(*)")
      .eq("author_id", firstAuthorId)
      .eq("publications.is_published", true)
      .neq("publication_id", currentId)
      .limit(12);
    type Row = { publications: Record<string, unknown> & { id: string } };
    absorb(
      ((data ?? []) as unknown as Row[]).map((r) => r.publications).filter(Boolean),
      "author",
    );
  }

  if (collected.length < TARGET) {
    const { data } = await supabase
      .from("publications_with_stats")
      .select("*")
      .eq("is_published", true)
      .neq("id", currentId)
      .order("view_count", { ascending: false })
      .limit(12);
    absorb(data, "popular");
  }

  return collected;
}

const BOOK_SELECT = `
  id, title, slug, description,
  cover_color, cover_url,
  language, department, pages, published_at, isbn, rating, tags,
  download_count, view_count, created_at,
  authors ( name, bio ),
  categories ( name ),
  book_files ( id, format, file_url, file_size_kb )
` as const;

/**
 * Library books to offer once related *publications* run out.
 *
 * Ranked by real signal — books whose tags overlap this article's subjects and
 * keywords come first — and only then topped up with the collection's most
 * downloaded titles. The heading the caller renders says "More from the
 * library" rather than "Similar", because the top-up tier is honestly just
 * popular, not similar.
 */
export async function getLibraryFallbackBooks({
  keywords,
  subjects,
}: {
  keywords: string[];
  subjects: string[];
}): Promise<{ books: Book[]; matchedOnTopic: boolean }> {
  const supabase = createServiceClient();
  const terms = [...new Set([...subjects, ...keywords].map((s) => s.trim()).filter(Boolean))];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = [];
  const seen = new Set<string>();
  let matchedOnTopic = false;

  if (terms.length > 0) {
    const { data } = await supabase
      .from("books")
      .select(BOOK_SELECT)
      .eq("is_published", true)
      .overlaps("tags", terms)
      .order("view_count", { ascending: false })
      .limit(TARGET);
    for (const row of data ?? []) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
    }
    matchedOnTopic = rows.length > 0;
  }

  if (rows.length < TARGET) {
    const { data } = await supabase
      .from("books")
      .select(BOOK_SELECT)
      .eq("is_published", true)
      .order("download_count", { ascending: false })
      .limit(TARGET * 2);
    for (const row of data ?? []) {
      if (rows.length >= TARGET) break;
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
    }
  }

  return { books: rows.map((row) => mapRowToBook(row)), matchedOnTopic };
}
