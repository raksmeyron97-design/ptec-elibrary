// lib/home/payload.ts
//
// The homepage's ONE server-side query layer.
//
// Every section used to fetch for itself, which is how five separate book
// grids came to draw from one 114-item collection and show the same titles
// three times over. Composing here instead buys three things the per-section
// shape could not:
//
//   • One exclusion set (lib/home/exclusions.ts) threaded through the sections
//     in render order, so a resource shown above cannot be shown again below.
//   • One shape of card data, so the grids can share one <ResourceCard>.
//   • One place where counts come from getCollectionStats(), which is the
//     site-wide rule (lib/collection-stats.ts) and is enforced by
//     lib/resource-stats-consistency.test.ts.
//
// The fetchers themselves stay in lib/home-data.ts (unstable_cache, 5 min).
// This file only fans them out in parallel and decides who gets what. It reads
// no cookies and no headers, so the homepage keeps prerendering — see the note
// at the top of the route.
//
// composeHomePayload() is pure and exported on purpose: the composition rules
// are the interesting part, and they are unit-tested without a database.

import { getCollectionStats, type PublicCollectionStats } from "@/lib/collection-stats";
import { getPublishedPaths, type LearningPathSummary } from "@/app/actions/learning-paths";
import {
  getTrendingBooksCached,
  getTrendingTermsCached,
  getMostViewedBooksCached,
  getRecentlyAddedCached,
  getDepartmentCountsCached,
  getTrendingThesesCached,
  getFeaturedPublicationsCached,
  getLatestPostsCached,
  getRecentAdditions,
  type TrendingThesisRow,
  type FeaturedPubRow,
  type LatestPostRow,
  type RecentItem,
} from "@/lib/home-data";
import type { Book } from "@/lib/book-utils";
import { HomeExclusions, type HomeResourceRef } from "./exclusions";

// ── The one card shape ───────────────────────────────────────────────────────

/** Everything <ResourceCard> needs, for any of the three digital types. */
export type HomeResourceItem = HomeResourceRef & {
  title: string;
  author: string | null;
  /** Second metadata line: department, journal, cohort. At most one. */
  meta: string | null;
  coverUrl: string | null;
  /** Generated-cover seed colour, when the row carries one. */
  coverColor: string | null;
  views: number;
  downloads: number;
  /** ISO timestamp of when the item JOINED the library, not its pub. date. */
  addedAt: string | null;
};

/** Detail route per type — the single place a homepage link is built. */
const ROUTE: Record<HomeResourceItem["type"], string> = {
  book: "/books",
  thesis: "/theses",
  publication: "/publications",
  post: "/posts",
  path: "/paths",
};

export function hrefOf(ref: HomeResourceRef): string {
  return `${ROUTE[ref.type]}/${ref.slug}`;
}

// ── Row → card mappers ───────────────────────────────────────────────────────
//
// Rows without a slug are dropped rather than linked to an id: a homepage link
// that 404s is worse than one fewer card.

function bookToItem(b: Book): HomeResourceItem {
  return {
    type: "book",
    slug: b.slug,
    title: b.title,
    author: b.author || null,
    meta: b.department && b.department !== "General" ? b.department : b.category || null,
    coverUrl: b.coverUrl ?? null,
    coverColor: b.cover ?? null,
    views: b.viewCount ?? 0,
    downloads: b.downloadCount ?? 0,
    addedAt: b.createdAt ?? null,
  };
}

function thesisToItem(t: TrendingThesisRow): HomeResourceItem | null {
  if (!t.slug) return null;
  return {
    type: "thesis",
    slug: t.slug,
    title: t.title,
    author: t.author_names?.trim() || null,
    meta: t.cohort?.trim() || null,
    coverUrl: t.cover_url ?? null,
    coverColor: null,
    views: t.view_count ?? 0,
    downloads: t.download_count ?? 0,
    addedAt: null,
  };
}

function publicationToItem(p: FeaturedPubRow, locale: string): HomeResourceItem | null {
  if (!p.slug) return null;
  return {
    type: "publication",
    slug: p.slug,
    title: (locale === "km" && p.title_km) || p.title,
    author: p.author_names?.trim() || null,
    meta: p.journal_name?.trim() || null,
    // Publications carry no cover column — the generated cover is the design.
    coverUrl: null,
    coverColor: null,
    views: 0,
    downloads: 0,
    addedAt: null,
  };
}

function recentToItem(r: RecentItem): HomeResourceItem {
  return {
    type: r.type,
    slug: r.slug,
    title: r.title,
    author: r.author,
    meta: null,
    coverUrl: r.coverUrl,
    coverColor: null,
    views: 0,
    downloads: 0,
    addedAt: r.addedAt,
  };
}

// ── Payload ──────────────────────────────────────────────────────────────────

/** The slim hero stat strip. Physical copies are NOT here — they belong to the
 *  "visit us" section, which is the only place a reader can act on them. */
export type HomeStats = {
  digitalResources: number;
  subjects: number;
  physicalCatalogs: number;
};

export type HomePayload = {
  /** Ranked by downloads — the hero stack and the mobile strip. */
  heroBooks: Book[];
  trendingTerms: string[];
  /** null when the stats service is unavailable; render no figures, never a 0. */
  stats: HomeStats | null;
  paths: LearningPathSummary[];
  featured: HomeResourceItem[];
  subjects: { name: string; count: number }[];
  posts: LatestPostRow[];
  arrivals: HomeResourceItem[];
};

export const HERO_BOOKS = 8;
export const FEATURED_ITEMS = 8;
export const ARRIVAL_ITEMS = 4;
/** Slots the featured grid holds back so the rarer types are reachable. */
export const FEATURED_NON_BOOK_SLOTS = { thesis: 1, publication: 1 } as const;

export type RawHomeData = {
  trendingBooks: Book[];
  mostViewedBooks: Book[];
  recentBooks: Book[];
  theses: TrendingThesisRow[];
  publications: FeaturedPubRow[];
  posts: LatestPostRow[];
  recentAdditions: RecentItem[];
  departments: { name: string; count: number }[];
  trendingTerms: string[];
  paths: LearningPathSummary[];
  stats: PublicCollectionStats | null;
  locale: string;
};

/**
 * Distribute the fetched data across the page, top-down, through one exclusion
 * set. Pure — no I/O, no framework.
 *
 * Order matters and mirrors the rendered order:
 *
 *   1. Hero        claims the download-ranked books it shows.
 *   2. Featured    takes view-ranked books, backfilling from the recency
 *                  ranking, plus a reserved slot each for the newest thesis and
 *                  publication. Without those reserved slots the two rarest
 *                  types on the site are invisible on its busiest page — and
 *                  the alternative, a headline stat reading "1 theses", is the
 *                  weak-signal number this redesign set out to remove.
 *   3. Arrivals    takes whatever is genuinely newest and not yet shown.
 *
 * A section that comes up short renders fewer cards. It never repeats one, and
 * it never pads with an item the reader has already seen.
 */
export function composeHomePayload(raw: RawHomeData): HomePayload {
  const exclusions = new HomeExclusions();

  // 1. Hero.
  const heroBooks = raw.trendingBooks.slice(0, HERO_BOOKS);
  exclusions.claim(heroBooks.map((b) => ({ type: "book" as const, slug: b.slug })));

  // 2. Featured — reserved non-book slots first, so a long book ranking can
  //    never crowd them out.
  const thesisPicks = exclusions.take(
    raw.theses.map(thesisToItem).filter((i): i is HomeResourceItem => i !== null),
    FEATURED_NON_BOOK_SLOTS.thesis,
  );
  const publicationPicks = exclusions.take(
    raw.publications
      .map((p) => publicationToItem(p, raw.locale))
      .filter((i): i is HomeResourceItem => i !== null),
    FEATURED_NON_BOOK_SLOTS.publication,
  );
  const bookSlots = FEATURED_ITEMS - thesisPicks.length - publicationPicks.length;
  const featuredBooks = exclusions.take(
    // View-ranked first, then the recency ranking as backfill: on a small
    // collection the view ranking alone is shorter than the grid.
    [...raw.mostViewedBooks, ...raw.recentBooks].map(bookToItem),
    bookSlots,
  );
  // Books lead (they are what most readers came for), then the thesis, then the
  // publication. Deliberately NOT re-sorted by activity: a publication carries
  // no view count, so an activity sort would present "least read last" under a
  // heading that makes no ranking claim.
  const featured = [...featuredBooks, ...thesisPicks, ...publicationPicks];

  // 3. New arrivals.
  const arrivals = exclusions.take(raw.recentAdditions.map(recentToItem), ARRIVAL_ITEMS);

  return {
    heroBooks,
    trendingTerms: raw.trendingTerms,
    stats:
      raw.stats === null
        ? null
        : {
            digitalResources: raw.stats.totalDigitalResources,
            // The subject figure is the taxonomy the reader can actually click
            // in section 4 — not a separate count query. Same list, same number.
            subjects: raw.departments.length,
            physicalCatalogs: raw.stats.physicalCatalogs,
          },
    paths: raw.paths,
    featured,
    subjects: raw.departments,
    posts: raw.posts,
    arrivals,
  };
}

/** Fetch everything the homepage needs, in parallel, then compose it. */
export async function getHomePayload(locale: string): Promise<HomePayload> {
  const [
    trendingBooks,
    mostViewedBooks,
    recentBooks,
    theses,
    publications,
    posts,
    recentAdditions,
    departments,
    trendingTerms,
    paths,
    stats,
  ] = await Promise.all([
    getTrendingBooksCached(),
    getMostViewedBooksCached(),
    getRecentlyAddedCached(),
    getTrendingThesesCached(),
    getFeaturedPublicationsCached(),
    getLatestPostsCached(3),
    // Over-fetch: the arrivals grid shows 4, but the ones it wants may already
    // be in the hero or the featured grid, and then it needs somewhere to go.
    getRecentAdditions(12),
    getDepartmentCountsCached(),
    getTrendingTermsCached(),
    getPublishedPaths(),
    getCollectionStats(),
  ]);

  return composeHomePayload({
    trendingBooks,
    mostViewedBooks,
    recentBooks,
    theses,
    publications,
    posts,
    recentAdditions,
    departments,
    trendingTerms,
    paths,
    stats,
    locale,
  });
}
