// lib/home/exclusions.ts
//
// The homepage's page-level exclusion set: the reason no resource can appear
// in two places on it.
//
// ── The problem ──────────────────────────────────────────────────────────────
// The homepage draws several shelves from one collection of ~114 items, each
// ranked by a different signal (downloads, views, recency). On a collection
// this size those rankings overlap heavily, so the same handful of titles
// surfaced in three sections at once and the page read as much smaller than
// the library actually is.
//
// Ranking sections by *different* signals was the previous mitigation. It is
// not a fix — it only makes collisions less likely, and it silently stops
// working as the collection's usage flattens out.
//
// ── The rule ─────────────────────────────────────────────────────────────────
// Sections are composed top-down through ONE set. Each section takes what it
// needs from its own ordering, skipping anything an earlier section already
// claimed, and backfills from further down its own list. First section to want
// an item wins it; later sections simply move on. That makes duplication
// structurally impossible rather than statistically unlikely.
//
// The set is keyed on `type:slug` rather than the database id, because the same
// underlying work can legitimately reach the page through two different
// fetchers (the "most viewed" query and the "recently added" one both return
// Book rows), and slugs are what the links are built from.
//
// This is a plain server-side object composed in lib/home/payload.ts. It is not
// React state and not a hook: the whole page is a Server Component, and the
// composition happens once per render.

/** Every resource kind the homepage can link to. */
export type HomeResourceType = "book" | "thesis" | "publication" | "post" | "path";

export type HomeResourceRef = {
  type: HomeResourceType;
  slug: string;
};

/** The identity two sections would have to agree on to be a duplicate. */
export function resourceKey(ref: HomeResourceRef): string {
  return `${ref.type}:${ref.slug}`;
}

export class HomeExclusions {
  readonly #claimed = new Set<string>();

  /** True when some earlier section already put this resource on the page. */
  has(ref: HomeResourceRef): boolean {
    return this.#claimed.has(resourceKey(ref));
  }

  /**
   * Mark items as shown without selecting them — for a section that decided
   * its own contents (the hero stack) but must still block later sections.
   * Returns the items unchanged so it can be used inline.
   */
  claim<T extends HomeResourceRef>(items: readonly T[]): T[] {
    for (const item of items) this.#claimed.add(resourceKey(item));
    return [...items];
  }

  /**
   * Take up to `limit` items from `candidates`, in the order given, skipping
   * anything already claimed — and claim what it takes.
   *
   * Passing a candidate list LONGER than `limit` is the point: the surplus is
   * the backfill that keeps a section full when an earlier one took its first
   * choices.
   */
  take<T extends HomeResourceRef>(candidates: readonly T[], limit: number): T[] {
    const taken: T[] = [];
    for (const item of candidates) {
      if (taken.length >= limit) break;
      if (this.has(item)) continue;
      // Guard against a duplicate WITHIN one candidate list too (two fetchers
      // merged into one array can each contribute the same row).
      this.#claimed.add(resourceKey(item));
      taken.push(item);
    }
    return taken;
  }

  /** Every key claimed so far — the assertion surface for the duplicate test. */
  keys(): string[] {
    return [...this.#claimed];
  }

  get size(): number {
    return this.#claimed.size;
  }
}
