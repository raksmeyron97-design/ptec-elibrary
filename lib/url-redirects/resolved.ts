import "server-only";

// "Does this retired path already resolve some other way?" — shared by the
// retired-URL admin page and its bulk "Ignore resolved" action (0170).
//
// A queued path resolves elsewhere when it is a live record again, a
// book_slug_redirects alias whose target is published (the book gate answers
// it first), or already a url_redirects row.
//
// Lookups are `.in()` lists of slugs, and a Khmer letter is nine characters
// once percent-encoded: forty Khmer slugs in one request line passes the
// 8 KB Kong refuses with 414 (lib/db/postgrest-url.ts). So every list is cut
// into chunks under a byte budget — every value is asked about, none dropped.

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseTarget, type TargetCollection } from "@/lib/url-redirects/queue";

/** Encoded bytes per `.in()` list; well under Kong's 8 KB request line. */
const IN_LIST_BUDGET = 3_000;

export function chunkByEncodedLength(values: readonly string[], budget: number = IN_LIST_BUDGET): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let used = 0;
  for (const value of values) {
    // encodeURIComponent plus the quotes and comma PostgREST adds per value.
    const cost = encodeURIComponent(value).length + 3;
    if (current.length > 0 && used + cost > budget) {
      chunks.push(current);
      current = [];
      used = 0;
    }
    current.push(value);
    used += cost;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

type Row = Record<string, unknown>;
type Read = PromiseLike<{ data: unknown; error: unknown }>;

async function readAll(values: string[], read: (chunk: string[]) => Read): Promise<Row[] | null> {
  if (values.length === 0) return [];
  const results = await Promise.all(chunkByEncodedLength(values).map((chunk) => read(chunk)));
  if (results.some((r) => r.error)) return null;
  return results.flatMap((r) => (r.data ?? []) as Row[]);
}

/**
 * The subset of `paths` that already resolves without the queue. `null` when
 * any read failed — the caller must not act on a partial answer.
 */
export async function resolvedElsewhere(supabase: SupabaseClient, paths: readonly string[]): Promise<Set<string> | null> {
  const wanted = new Set(paths);
  const slugsOf = (collection: TargetCollection) =>
    paths
      .map((p) => parseTarget(p))
      .filter((t): t is NonNullable<typeof t> => t?.collection === collection)
      .map((t) => t.slug);
  const books = slugsOf("books");
  const theses = slugsOf("theses");
  const subjects = slugsOf("subjects");

  const [liveBooks, aliases, liveTheses, liveSubjects, redirects] = await Promise.all([
    readAll(books, (c) => supabase.from("books").select("slug").eq("is_published", true).in("slug", c)),
    readAll(books, (c) =>
      supabase.from("book_slug_redirects").select("old_slug, books!inner(slug)").eq("books.is_published", true).in("old_slug", c),
    ),
    readAll(theses, (c) => supabase.from("research_reports").select("slug").eq("is_published", true).in("slug", c)),
    readAll(subjects, (c) => supabase.from("categories").select("slug").in("slug", c)),
    readAll([...paths], (c) => supabase.from("url_redirects").select("old_path").in("old_path", c)),
  ]);
  if (!liveBooks || !aliases || !liveTheses || !liveSubjects || !redirects) return null;

  const found = [
    ...liveBooks.map((r) => `/books/${r.slug}`),
    ...aliases.map((r) => `/books/${r.old_slug}`),
    ...liveTheses.map((r) => `/theses/${r.slug}`),
    ...liveSubjects.map((r) => `/subjects/${r.slug}`),
    ...redirects.map((r) => String(r.old_path)),
  ];
  return new Set(found.filter((p) => wanted.has(p)));
}
