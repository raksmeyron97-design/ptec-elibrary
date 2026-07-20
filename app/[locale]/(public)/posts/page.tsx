import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import JsonLd from "@/components/seo/JsonLd";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { buildListingMetadata, parsePageParam } from "@/lib/seo/listing-metadata";
import { postsCollectionJsonLd, POSTS_FALLBACK_OG_IMAGE } from "@/lib/seo/posts-seo";
import {
  ClientNavWrapper,
  FilterLink,
  FilterSelect,
  SortSelect,
} from "@/components/ui/books/ClientNavWrapper";
import Pagination from "@/components/ui/core/Pagination";
import {
  getPostsPage,
  getFeaturedPost,
  getPostsFacets,
  resolvePostsPageSize,
  POSTS_PAGE_SIZE_OPTIONS,
  type PostsListParams,
} from "@/lib/posts-data";
import { deriveEventStatus } from "@/lib/posts/event-status";
import PostCard from "@/components/ui/posts/PostCard";
import FeaturedPost from "@/components/ui/posts/FeaturedPost";
import PostsSearch from "@/components/ui/posts/PostsSearch";
import CategoryFilters from "@/components/ui/posts/CategoryFilters";
import PostsMobileFilters from "@/components/ui/posts/PostsMobileFilters";
import PostsEmptyState from "@/components/ui/posts/PostsEmptyState";
import { CloseIcon } from "@/components/ui/posts/icons";

type SearchParams = {
  q?: string;
  category?: string;
  year?: string;
  when?: string;
  sort?: string;
  page?: string;
  size?: string;
};

function hasActiveFilters(p: SearchParams): boolean {
  return !!(p.q || (p.category && p.category !== "All") || p.year || p.when || p.sort);
}

// ── Metadata ────────────────────────────────────────────────────────────────
export async function generateMetadata({
  searchParams,
  params: routeParams,
}: {
  searchParams: Promise<SearchParams>;
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const { locale } = await routeParams;
  const t = await getTranslations({ locale, namespace: "posts" });
  const page = parsePageParam(sp.page);
  const filters = hasActiveFilters(sp);

  // Out-of-range detection only matters for the clean, indexable listing.
  let outOfRange = false;
  if (!filters && page > 1) {
    const { items } = await getPostsPage({}, page, resolvePostsPageSize(sp.size));
    outOfRange = items.length === 0;
  }

  return buildListingMetadata({
    path: "/posts",
    locale,
    title: t("title"),
    description: t("metaDescription"),
    page,
    hasFilters: filters,
    image: POSTS_FALLBACK_OG_IMAGE,
    imageAlt: t("title"),
    pageLabel: t("pageLabel"),
    outOfRange,
  });
}

// ── Page ────────────────────────────────────────────────────────────────────
export default async function PostsPage({
  searchParams,
  params: routeParams,
}: {
  searchParams: Promise<SearchParams>;
  params: Promise<{ locale: string }>;
}) {
  const sp = await searchParams;
  const { locale } = await routeParams;
  const t = await getTranslations({ locale, namespace: "posts" });
  const tNav = await getTranslations({ locale, namespace: "nav" });

  const basePath = locale === "km" ? "/km/posts" : "/posts";
  const requestedPage = Math.max(1, Number(sp.page) || 1);
  const pageSize = resolvePostsPageSize(sp.size);
  const filters = hasActiveFilters(sp);
  const cleanView = !filters;

  const facets = await getPostsFacets();
  const featured = cleanView ? await getFeaturedPost() : null;
  const showFeatured = cleanView && requestedPage === 1 && !!featured;

  // Fixed key order → stable unstable_cache key.
  const listParams: PostsListParams = {
    q: sp.q,
    category: sp.category,
    year: sp.year,
    when: sp.when,
    sort: sp.sort,
    // Keep the featured story out of the grid across every clean-view page so
    // totals stay consistent as the reader pages through.
    excludeId: cleanView && featured ? featured.id : undefined,
  };

  const { items, total } = await getPostsPage(listParams, requestedPage, pageSize);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Fresh request-time status derivation (outside the cached data layer).
  const now = new Date();
  const featuredStatus = featured?.event ? deriveEventStatus(featured.event, now) : null;

  const hasEvents = facets.categories.some((c) => c.key === "Event");

  const sortOptions = [
    { value: "newest", label: t("sortNewest") },
    { value: "oldest", label: t("sortOldest") },
    { value: "most-viewed", label: t("sortMostViewed") },
  ];

  // Structured data only for the clean, in-range listing (schema URL must equal
  // the canonical URL; filtered/empty variants are noindex anyway).
  const showSchema = cleanView && items.length > 0 && requestedPage <= totalPages;
  const collectionSchema = showSchema
    ? postsCollectionJsonLd({
        locale,
        page: requestedPage,
        pageSize,
        total: total + (showFeatured ? 1 : 0),
        name: t("title"),
        description: t("metaDescription"),
        items: [
          ...(showFeatured && featured ? [{ slug: featured.slug, title: featured.title }] : []),
          ...items.map((i) => ({ slug: i.slug, title: i.title })),
        ],
      })
    : null;

  const listingBreadcrumb = breadcrumbSchema([
    { name: tNav("home"), path: "/" },
    { name: t("title") },
  ]);

  // Active-filter chips (server-built removable links).
  const activeChips = buildActiveChips(sp, {
    category: sp.category && sp.category !== "All"
      ? t(`category${sp.category}` as never)
      : null,
    q: sp.q ?? null,
    year: sp.year ?? null,
    when: sp.when === "upcoming"
      ? t("eventWhenUpcoming")
      : sp.when === "past"
        ? t("eventWhenPast")
        : null,
  }, basePath);

  return (
    <ClientNavWrapper>
      <JsonLd data={listingBreadcrumb} />
      {collectionSchema && <JsonLd data={collectionSchema} />}

      <div className="min-h-screen bg-bg-app">
        {/* ── Compact header ── */}
        <header className="border-b border-divider bg-bg-surface">
          <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">
            <nav aria-label={t("breadcrumbAria")} className="mb-3 flex items-center gap-2 text-sm text-text-muted">
              <Link href="/" className="transition-colors hover:text-brand">
                {tNav("home")}
              </Link>
              <span aria-hidden="true" className="opacity-50">›</span>
              <span className="font-semibold text-text-heading" aria-current="page">{t("title")}</span>
            </nav>

            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <h1 className="m-0 font-khmer-serif text-[clamp(24px,3.4vw,34px)] font-bold leading-tight text-text-heading">
                  {t("title")}
                </h1>
                <p className="mt-2 text-[15px] leading-relaxed text-text-body">
                  {t("pageDescription")}
                </p>
              </div>
              <div className="w-full lg:max-w-sm">
                <PostsSearch
                  basePath={basePath}
                  placeholder={t("searchPlaceholder")}
                  label={t("searchLabel")}
                  clearLabel={t("clearSearch")}
                />
              </div>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
          {/* ── Featured ── */}
          {showFeatured && featured && (
            <section aria-label={t("featuredBadge")} className="mb-8">
              <FeaturedPost post={featured} eventStatus={featuredStatus} locale={locale} />
            </section>
          )}

          {/* ── Category chips ── */}
          <div className="mb-4">
            <CategoryFilters
              basePath={basePath}
              activeCategory={sp.category}
              categories={facets.categories}
              totalCount={facets.total}
            />
          </div>

          {/* ── Toolbar ── */}
          <PostsMobileFilters
            basePath={basePath}
            total={total}
            year={sp.year}
            when={sp.when}
            sort={sp.sort}
            years={facets.years}
            hasEvents={hasEvents}
            sortOptions={sortOptions}
          />

          <div className="mb-5 hidden flex-wrap items-center justify-between gap-3 md:flex">
            <div className="flex flex-wrap items-center gap-2">
              {hasEvents && (
                <SortSelect
                  value={sp.when || ""}
                  options={[
                    { value: "upcoming", label: t("eventWhenUpcoming") },
                    { value: "past", label: t("eventWhenPast") },
                  ]}
                  defaultLabel={t("eventWhenAll")}
                  paramKey="when"
                  basePath={basePath}
                />
              )}
              {facets.years.length > 0 && (
                <FilterSelect
                  value={sp.year || ""}
                  options={facets.years.map(String)}
                  defaultLabel={t("yearAll")}
                  paramKey="year"
                  basePath={basePath}
                />
              )}
              <SortSelect
                value={sp.sort || "newest"}
                options={sortOptions}
                defaultLabel={t("sortLabel")}
                paramKey="sort"
                basePath={basePath}
              />
            </div>
            <p aria-live="polite" className="shrink-0 text-sm text-text-muted tabular-nums">
              {total === 0 ? t("noResults") : t("resultCount", { count: total })}
            </p>
          </div>

          {/* ── Active filter chips ── */}
          {activeChips.length > 0 && (
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                {t("activeFilters")}
              </span>
              {activeChips.map((chip) => (
                <FilterLink
                  key={chip.key}
                  href={chip.href}
                  aria-label={t("removeFilter", { label: chip.label })}
                  className="inline-flex items-center gap-1.5 rounded-full border border-divider bg-bg-surface px-3 py-1 text-[13px] font-medium text-text-body transition-colors hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                >
                  {chip.label}
                  <CloseIcon className="h-3 w-3" />
                </FilterLink>
              ))}
              <FilterLink
                href={basePath}
                className="text-[13px] font-semibold text-brand underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                {t("clearAll")}
              </FilterLink>
            </div>
          )}

          {/* ── Results ── */}
          {items.length > 0 ? (
            <ul className="grid list-none grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((post, i) => (
                <li key={post.id} className="min-w-0">
                  <PostCard
                    post={post}
                    eventStatus={post.event ? deriveEventStatus(post.event, now) : null}
                    locale={locale}
                    priority={i < 3}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <PostsEmptyState basePath={basePath} filtered={filters} query={sp.q} />
          )}

          {/* ── Pagination ── */}
          <Pagination
            currentPage={requestedPage}
            totalPages={totalPages}
            totalItems={total}
            pageSize={pageSize}
            searchParams={sp as Record<string, string | undefined>}
            basePath={basePath}
            pageSizeOptions={[...POSTS_PAGE_SIZE_OPTIONS]}
          />
        </div>
      </div>
    </ClientNavWrapper>
  );
}

type ActiveChip = { key: string; label: string; href: string };

function buildActiveChips(
  sp: SearchParams,
  labels: { category: string | null; q: string | null; year: string | null; when: string | null },
  basePath: string,
): ActiveChip[] {
  const chips: ActiveChip[] = [];
  const hrefWithout = (key: string) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (v && k !== key && k !== "page") p.set(k, String(v));
    }
    const qs = p.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  };
  if (labels.q) chips.push({ key: "q", label: `“${labels.q}”`, href: hrefWithout("q") });
  if (labels.category) chips.push({ key: "category", label: labels.category, href: hrefWithout("category") });
  if (labels.when) chips.push({ key: "when", label: labels.when, href: hrefWithout("when") });
  if (labels.year) chips.push({ key: "year", label: labels.year, href: hrefWithout("year") });
  return chips;
}
