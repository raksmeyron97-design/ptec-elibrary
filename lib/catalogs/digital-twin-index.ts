// lib/catalogs/digital-twin-index.ts
//
// The published e-books a catalogue record can be matched against (SEO Phase
// 2.7). One read for the whole library, cached under the `books` tag that
// every book save already fires — the same trade the learning-path
// membership index makes: ~2,000 short rows, read once an hour, instead of a
// query per catalogue page.

import "server-only";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { pagedScan } from "@/lib/db/paged-scan";
import { TAGS } from "@/lib/cache/revalidate";
import { buildTwinIndex, findDigitalTwin, type TwinCandidate, type TwinIndex } from "@/lib/catalogs/digital-twin";

const SCAN_CAP = 50_000;

async function loadTwinCandidates(): Promise<TwinCandidate[]> {
  const supabase = createServiceClient();
  const { data, error, truncated } = await pagedScan<{
    slug: string | null;
    title: string | null;
    isbn: string | null;
    authors: { name: string | null } | null;
  }>(
    (from, to) =>
      supabase
        .from("books")
        .select("id, slug, title, isbn, authors(name)")
        .eq("is_published", true)
        .order("id", { ascending: true })
        .range(from, to),
    SCAN_CAP,
  );
  // A failed or partial read THROWS, so it is not cached for an hour as "no
  // catalogue record has an e-book" — the caller shows no link this time.
  if (error || truncated) throw new Error(`digital twin index: ${error?.message ?? "truncated"}`);
  return data
    .filter((b) => b.slug && b.title)
    .map((b) => ({ slug: b.slug!, title: b.title!, isbn: b.isbn, authors: [b.authors?.name ?? null] }));
}

const cachedCandidates = unstable_cache(loadTwinCandidates, ["catalog-digital-twin-v1"], {
  revalidate: 3600,
  tags: [TAGS.books],
});

// Built once per cached array: the index is a pure function of it.
const built = new WeakMap<TwinCandidate[], TwinIndex>();

/** The slug of the e-book that is this record's work, or null (also when the
 *  index could not be read — a missing link is the safe failure). */
export async function digitalTwinSlug(record: {
  isbn?: string | null;
  title?: string | null;
  author?: string | null;
}): Promise<string | null> {
  try {
    const candidates = await cachedCandidates();
    let index = built.get(candidates);
    if (!index) {
      index = buildTwinIndex(candidates);
      built.set(candidates, index);
    }
    return findDigitalTwin(index, record);
  } catch {
    return null;
  }
}
