// lib/theses/browse.ts
//
// Browse pages for the research collection (SEO Phase 3.5): /theses/year/<yyyy>
// and /theses/program/<program>. A crawler reaches a thesis today only
// through the paginated /theses listing; a browse page is a short, stable,
// indexable path to every work of one year or one programme, so each work is
// a few links from the home page however large the collection grows.
//
// A page exists only once it holds BROWSE_MIN_WORKS works: a year with two
// theses is a thin page that says less than the listing already does. Pure,
// so the sitemap, the hub's links and the pages share one rule.

export const DEFAULT_BROWSE_MIN_WORKS = 5;

/** THESIS_BROWSE_MIN_WORKS as a whole number ≥ 1, else the default. */
export function parseBrowseMinWorks(raw: string | undefined): number {
  const n = Number(raw?.trim());
  return Number.isInteger(n) && n >= 1 ? n : DEFAULT_BROWSE_MIN_WORKS;
}

export type BrowseThesisRow = {
  id: string;
  slug: string | null;
  title: string;
  author_names?: string | null;
  academic_year?: string | null;
  published_at?: string | null;
  program?: string | null;
};

/**
 * The year a thesis belongs to: its publication year when recorded, else the
 * year its academic year ENDS ("2023-2024" → 2024, the year it was defended).
 * Null when neither says anything — such a thesis is on no year page.
 */
export function thesisYear(row: Pick<BrowseThesisRow, "published_at" | "academic_year">): number | null {
  const published = row.published_at?.match(/^(\d{4})/);
  if (published) return Number(published[1]);
  const years = row.academic_year?.match(/\d{4}/g);
  return years && years.length > 0 ? Number(years[years.length - 1]) : null;
}

/** A programme code as a URL segment: "b_ed_12_4" → "b-ed-12-4". */
export function programSegment(code: string): string {
  return code.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export type BrowseGroup<K> = { key: K; count: number; rows: BrowseThesisRow[] };

function group<K>(rows: readonly BrowseThesisRow[], keyOf: (r: BrowseThesisRow) => K | null, min: number): BrowseGroup<K>[] {
  const map = new Map<K, BrowseThesisRow[]>();
  for (const row of rows) {
    if (!row.slug) continue;
    const key = keyOf(row);
    if (key === null) continue;
    map.set(key, [...(map.get(key) ?? []), row]);
  }
  return [...map.entries()]
    .filter(([, list]) => list.length >= min)
    .map(([key, list]) => ({ key, count: list.length, rows: [...list].sort((a, b) => a.title.localeCompare(b.title)) }));
}

/** Years with enough works for a page, newest first. */
export function yearGroups(rows: readonly BrowseThesisRow[], min = DEFAULT_BROWSE_MIN_WORKS): BrowseGroup<number>[] {
  return group(rows, thesisYear, min).sort((a, b) => b.key - a.key);
}

/** Programmes with enough works for a page, keyed by URL segment, largest first. */
export function programGroups(rows: readonly BrowseThesisRow[], min = DEFAULT_BROWSE_MIN_WORKS): BrowseGroup<string>[] {
  return group(rows, (r) => (r.program?.trim() ? programSegment(r.program) : null), min).sort(
    (a, b) => b.count - a.count || a.key.localeCompare(b.key),
  );
}
