// lib/learning-paths/membership.ts
//
// Which published learning paths contain a given book — the book→curriculum
// edge, derived from rows the schema already holds.
//
// PURE and dependency-free, like its siblings here: the join is three hops of
// in-memory bookkeeping over a tiny dataset (measured in production: 9 paths,
// 27 modules, 82 steps), so it is unit-testable offline and the server module
// beside it only has to fetch.
//
// ── Why this edge is worth building ──────────────────────────────────────────
//
// `learning_path_steps` is the only curriculum membership this library records,
// and until now it was readable in exactly one direction: a path page lists its
// books, a book page could not say it was taught anywhere. Measured on
// production, 29 of 296 published books (9.8%) sit in at least one published
// path and 25 of those sit in more than one — a real, curated relation with
// zero dangling references, going unexpressed.
//
// ── What it refuses to assert ────────────────────────────────────────────────
//
// A step is a FK-BY-CONVENTION (`resource_id` with no foreign key, because the
// column is polymorphic across books/research/catalog). So every hop is checked
// rather than assumed: a step whose module is missing, or whose path is not
// published, contributes nothing. An unpublished path is not a secret to be
// leaked by a book page, and a draft curriculum is not a claim about a book.

/** The subset of a `learning_paths` row this edge needs. */
export type PathRow = {
  id: string;
  slug: string;
  title: string;
  title_km?: string | null;
  /** `learning_path_status`; only 'published' produces a public edge. */
  status?: string | null;
  position?: number | null;
};

export type ModuleRow = { id: string; path_id: string };

export type StepRow = {
  module_id: string;
  resource_type: string;
  resource_id?: string | null;
};

/** A path as a book page names it. */
export type PathRef = {
  id: string;
  slug: string;
  title: string;
  titleKm: string | null;
};

export type MembershipIndex = ReadonlyMap<string, readonly PathRef[]>;

/**
 * Build `book id → the published paths that teach it`, for the whole library
 * at once.
 *
 * One index rather than a per-book query: the entire dataset is smaller than a
 * single book's page rows, and a detail page must not pay a round trip to
 * discover it belongs to nothing — which is the answer for 90% of books.
 *
 * Order is the order a reader meets the paths on /paths: `position`, then
 * title, so two books in the same curriculum list it identically.
 */
export function buildMembershipIndex(input: {
  paths: readonly PathRow[];
  modules: readonly ModuleRow[];
  steps: readonly StepRow[];
}): MembershipIndex {
  const published = new Map<string, PathRow>();
  for (const p of input.paths) {
    if (p.status === "published" && p.id && p.slug && p.title) published.set(p.id, p);
  }

  const pathOfModule = new Map<string, string>();
  for (const m of input.modules) {
    if (m.id && m.path_id && published.has(m.path_id)) pathOfModule.set(m.id, m.path_id);
  }

  // Sets, not arrays: a curriculum may legitimately use the same book in two
  // modules (a text read in week 1 and revisited in week 6), and that is one
  // membership, not two identical chips.
  const pathIdsByBook = new Map<string, Set<string>>();
  for (const s of input.steps) {
    if (s.resource_type !== "book" || !s.resource_id) continue;
    const pathId = pathOfModule.get(s.module_id);
    if (!pathId) continue;
    const set = pathIdsByBook.get(s.resource_id);
    if (set) set.add(pathId);
    else pathIdsByBook.set(s.resource_id, new Set([pathId]));
  }

  const order = (p: PathRow) => p.position ?? 0;
  const out = new Map<string, readonly PathRef[]>();
  for (const [bookId, ids] of pathIdsByBook) {
    const refs = [...ids]
      .map((id) => published.get(id))
      .filter((p): p is PathRow => Boolean(p))
      .sort((a, b) => order(a) - order(b) || a.title.localeCompare(b.title))
      .map((p) => ({ id: p.id, slug: p.slug, title: p.title, titleKm: p.title_km ?? null }));
    if (refs.length > 0) out.set(bookId, refs);
  }
  return out;
}

/** The paths teaching one book — `[]` when it is taught in none. */
export function pathsForBook(index: MembershipIndex, bookId: string | null | undefined): readonly PathRef[] {
  if (!bookId) return [];
  return index.get(bookId) ?? [];
}

/** The title to show for a locale, falling back to the one that exists. */
export function pathTitle(ref: PathRef, locale: string): string {
  return locale === "km" && ref.titleKm?.trim() ? ref.titleKm : ref.title;
}
