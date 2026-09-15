import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { mapRowToPublication, type Publication } from "@/lib/publications";
import { mapRowToBook, type Book } from "@/lib/books";
import { authorList } from "@/lib/citations";

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

/** A related article, reduced to what a scholarly list row prints. */
export interface ScholarshipItem {
  id: string;
  slug: string;
  title: string;
  titleKm: string | null;
  /** Byline, in order. Empty when the query did not carry one. */
  authors: string[];
  journal: string | null;
  /** The article's own date (never the import timestamp). */
  date: string | null;
}

function toItem(pub: Publication): ScholarshipItem {
  return {
    id: pub.id,
    slug: pub.slug,
    title: pub.title,
    titleKm: pub.title_km,
    // The library's one byline splitter (via authorList → citationNames): a
    // comma is also how a single name is inverted.
    authors: authorList(pub),
    journal: pub.journal_name,
    date: pub.publication_date,
  };
}

/** Rows of the related-articles cascade, as list items with their reason. */
export function relatedToItems(items: RelatedPublication[]): (ScholarshipItem & { reason: RelatedReason })[] {
  return items.map(({ publication, reason }) => ({ ...toItem(publication), reason }));
}

/**
 * Other published articles in the same journal, newest first.
 *
 * Moved here from the MoreFromJournal component (same query, same limit) so
 * the page can de-duplicate it against the other related blocks before any of
 * them renders. Matched on the canonical journal (0148) when the article is
 * mapped, and on the legacy journal name otherwise.
 */
export async function getJournalSiblings({
  currentId,
  journalId,
  journalName,
}: {
  currentId: string;
  journalId: string | null;
  journalName: string | null;
}): Promise<ScholarshipItem[]> {
  if (!journalId && !journalName) return [];
  const supabase = createServiceClient();
  const base = supabase.from("publications_with_stats").select("*").eq("is_published", true);
  const { data } = await (journalId ? base.eq("journal_id", journalId) : base.eq("journal_name", journalName as string))
    .neq("id", currentId)
    .order("publication_date", { ascending: false, nullsFirst: false })
    .limit(10);
  return (data ?? []).map(mapRowToPublication).map(toItem);
}

/**
 * The primary author's other published articles, newest first.
 *
 * Moved here from the MoreFromAuthor component: matched relationally through
 * publication_authorships (an FK, not a byline string), published only.
 */
export async function getAuthorOtherWorks({
  currentId,
  authorId,
}: {
  currentId: string;
  authorId: string | null;
}): Promise<ScholarshipItem[]> {
  if (!authorId) return [];
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("publication_authorships")
    .select("publication_id, publications!inner(id, slug, title, title_km, is_published, publication_date, journal_name)")
    .eq("author_id", authorId)
    .eq("publications.is_published", true)
    .neq("publication_id", currentId)
    .limit(12);
  type Row = {
    publications: Pick<Publication, "id" | "slug" | "title" | "title_km" | "publication_date" | "journal_name"> | null;
  };
  return ((data ?? []) as unknown as Row[])
    .map((r) => r.publications)
    .filter((p): p is NonNullable<Row["publications"]> => !!p)
    .sort((a, b) => (b.publication_date ?? "").localeCompare(a.publication_date ?? "") || a.id.localeCompare(b.id))
    .slice(0, 6)
    .map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      titleKm: p.title_km,
      // The byline is the author this block is named for; the row does not
      // repeat it.
      authors: [],
      journal: p.journal_name,
      date: p.publication_date,
    }));
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
