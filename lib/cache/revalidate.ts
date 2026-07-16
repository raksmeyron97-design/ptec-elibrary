import { revalidatePath, revalidateTag } from "next/cache";
// Next 16's revalidateTag takes a cache-life profile as its second argument;
// "max" expires the entry everywhere rather than only in this region.
import { routing } from "@/i18n/routing";

// ─────────────────────────────────────────────────────────────────────────────
// Invalidating PUBLIC pages.
//
// THE TRAP: public routes live under app/[locale]/(public), so their prerender
// cache keys are "/en/books/foo" and "/km/books/foo" — not "/books/foo". The
// English URL has no visible prefix (middleware rewrites it to /en internally),
// which makes `revalidatePath("/books/foo")` look right and do NOTHING. It
// silently matched no cache entry.
//
// That was harmless while every page was `no-store`. Now that public pages are
// prerendered and CDN-cached, a missed invalidation means an admin edit stays
// invisible until the ISR window lapses (up to an hour on detail pages). Always
// go through the helpers here.
//
// Verify with: node -e "console.log(Object.keys(require('./.next/prerender-manifest.json').routes))"
// ─────────────────────────────────────────────────────────────────────────────

/** Revalidate a public page in every locale. `path` is the locale-less,
 *  leading-slash path as it appears in the UI — e.g. "/books/my-slug". */
export function revalidatePublicPath(path: string) {
  for (const locale of routing.locales) {
    revalidatePath(`/${locale}${path}`);
  }
}

/**
 * Drop-in replacement for next/cache's `revalidatePath`, locale-aware.
 *
 * Admin and auth routes are not locale-prefixed, so they pass straight through.
 * Everything else is a public route living under /[locale], so it is expanded to
 * one call per locale. Import this instead of the Next built-in anywhere a
 * mutation might touch a public page:
 *
 *   import { revalidateLocalizedPath as revalidatePath } from "@/lib/cache/revalidate";
 *
 * Call sites then need no changes, and cannot silently miss the /km copy.
 */
export function revalidateLocalizedPath(
  path: string,
  type?: "layout" | "page",
) {
  if (path.startsWith("/admin") || path.startsWith("/auth")) {
    if (type) revalidatePath(path, type);
    else revalidatePath(path);
    return;
  }

  for (const locale of routing.locales) {
    // "/" is the locale root itself — /en, /km — not "/en/".
    const target = path === "/" ? `/${locale}` : `/${locale}${path}`;
    if (type) revalidatePath(target, type);
    else revalidatePath(target);
  }
}

/** Tag names, in one place so producers (unstable_cache) and consumers
 *  (admin mutations) cannot drift apart. */
export const TAGS = {
  books: "books",
  book: (slug: string) => `book:${slug}`,
  catalogBooks: "catalog_books",
  catalogBook: (slug: string) => `catalog-book:${slug}`,
  theses: "research_reports",
  thesis: (slug: string) => `thesis:${slug}`,
  publications: "publications",
  publication: (slug: string) => `publication:${slug}`,
  posts: "posts",
  post: (slug: string) => `post:${slug}`,
  paths: "paths",
  path: (slug: string) => `path:${slug}`,
  team: "team",
  categories: "categories",
  departments: "departments",
  /** Homepage shelves. Separate from `books` so a routine metadata edit on an
   *  obscure title doesn't churn the homepage cache. */
  homeBooks: "home-books",
  homeTheses: "home-theses",
  homePublications: "home-publications",
  homePosts: "home-posts",
  /** Shared public counters (lib/collection-stats.ts) — the only sanctioned
   *  source for "how many resources" figures. */
  collectionStats: "collection-stats",
  /** Global site configuration (lib/system-settings/config.ts): names,
   *  contacts, hours, links, SEO defaults. */
  siteConfig: "site-config",
} as const;

/**
 * Published site settings changed (publish or rollback in
 * /admin/system-settings). The navbar and footer render contact details on
 * EVERY public page, so this is one of the few justified layout-wide
 * invalidations: the site-config tag plus both locale trees.
 */
export function revalidateSiteConfig() {
  revalidateTag(TAGS.siteConfig, "max");
  revalidateLocalizedPath("/", "layout");
}

/**
 * Public collection counts changed (create / delete / publish / unpublish /
 * archive / restore of any counted entity). Busts the shared stats cache and
 * the /home page, which renders the "digital resources" figure. Called from
 * every entity helper below — a routine metadata edit re-counts too, which is
 * deliberately accepted: the entry is one tiny row and a wrong count on the
 * busiest page is worse than an extra recount.
 */
export function revalidateCollectionStats() {
  revalidateTag(TAGS.collectionStats, "max");
  revalidatePublicPath("/home");
}

/**
 * A book changed. Invalidates its own detail page, the listings it appears in,
 * and — only when it could plausibly surface there — the homepage shelves.
 *
 * `affectsHome` should be false for routine metadata edits. The homepage shelves
 * are ranked by download/view counts, so an edit to a low-traffic title cannot
 * change them; busting `home-books` anyway would just throw away a cache entry
 * that serves the site's busiest route.
 */
export function revalidateBook(
  slug: string | null | undefined,
  { affectsHome = false }: { affectsHome?: boolean } = {},
) {
  revalidateTag(TAGS.books, "max");
  if (slug) {
    revalidateTag(TAGS.book(slug), "max");
    revalidatePublicPath(`/books/${slug}`);
  }
  revalidatePublicPath("/books");
  revalidateCollectionStats();
  if (affectsHome) {
    revalidateTag(TAGS.homeBooks, "max");
    revalidatePublicPath("/home");
  }
}

/** A book's slug changed. BOTH the old and the new page must be invalidated —
 *  leaving the old one cached would keep serving a page that should now 301. */
export function revalidateBookSlugChange(oldSlug: string, newSlug: string) {
  revalidateBook(oldSlug);
  revalidateBook(newSlug);
}

/**
 * A physical-catalog record or one of its copies changed. The /catalogs
 * listing caches its queries with unstable_cache under TAGS.catalogBooks —
 * revalidatePath alone does NOT purge those entries, which is exactly how a
 * record used to stay invisible on the listing (with a stale count) for up to
 * an hour while its detail page was already live. Always call this helper.
 */
export function revalidateCatalogBook(slug?: string | null) {
  revalidateTag(TAGS.catalogBooks, "max");
  if (slug) {
    revalidateTag(TAGS.catalogBook(slug), "max");
    revalidatePublicPath(`/catalogs/${slug}`);
  }
  revalidatePublicPath("/catalogs");
  revalidateCollectionStats();
}

export function revalidateThesis(slug?: string | null) {
  revalidateTag(TAGS.theses, "max");
  if (slug) {
    revalidateTag(TAGS.thesis(slug), "max");
    revalidatePublicPath(`/theses/${slug}`);
  }
  revalidatePublicPath("/theses");
  revalidateTag(TAGS.homeTheses, "max");
  revalidateCollectionStats();
}

export function revalidatePublication(slug?: string | null) {
  revalidateTag(TAGS.publications, "max");
  if (slug) {
    revalidateTag(TAGS.publication(slug), "max");
    revalidatePublicPath(`/publications/${slug}`);
  }
  revalidatePublicPath("/publications");
  revalidateTag(TAGS.homePublications, "max");
  revalidateCollectionStats();
}

export function revalidatePost(slug?: string | null) {
  revalidateTag(TAGS.posts, "max");
  if (slug) {
    revalidateTag(TAGS.post(slug), "max");
    revalidatePublicPath(`/posts/${slug}`);
  }
  revalidatePublicPath("/posts");
  revalidateTag(TAGS.homePosts, "max");
}

export function revalidateLearningPath(slug?: string | null) {
  revalidateTag(TAGS.paths, "max");
  if (slug) {
    revalidateTag(TAGS.path(slug), "max");
    revalidatePublicPath(`/paths/${slug}`);
  }
  revalidatePublicPath("/paths");
  revalidatePublicPath("/home"); // paths are rendered in ThisWeekAtPtec
  revalidateCollectionStats();
}

export function revalidateTeam() {
  revalidateTag(TAGS.team, "max");
  revalidatePublicPath("/about/team");
}

export function revalidateTaxonomy() {
  revalidateTag(TAGS.categories, "max");
  revalidateTag(TAGS.departments, "max");
  revalidatePublicPath("/home");
  revalidatePublicPath("/books");
  revalidatePublicPath("/catalogs");
}
