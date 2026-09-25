// app/catalogs/page.tsx
import { Link } from "@/i18n/navigation";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { CATALOG_SCAN_CAP, type CatalogBook, type CopyStatusRow } from "@/lib/catalog";
import { pagedScan } from "@/lib/db/paged-scan";
import CatalogCard from "@/components/ui/books/CatalogCard";
import CatalogSearchForm from "@/components/ui/search/CatalogSearchForm";
import BookRequestForm from "@/components/ui/books/BookRequestForm";
import LibraryVisitStrip from "@/components/ui/books/LibraryVisitStrip";
import CatalogAvailabilityNotice from "@/components/ui/books/CatalogAvailabilityNotice";
import { resolveLibraryStatus } from "@/lib/about/status";
import Pagination from "@/components/ui/core/Pagination";
import { ClientNavWrapper } from "@/components/ui/books/ClientNavWrapper";
import { PAGE_SIZE_OPTIONS, resolvePageSize } from "@/lib/pagination";
import { getTranslations } from 'next-intl/server';
import {
  buildListingMetadata,
  isPageOutOfRange,
  parsePageParam,
} from "@/lib/seo/listing-metadata";
import { getSiteConfig, getOrgIdentity } from "@/lib/system-settings/config";
import { getCollectionStats } from "@/lib/collection-stats";
import { chooseCountLabel } from "@/lib/listing-count";
import { catalogSearchLegs, parseSearchScope, type CatalogSearchScope } from "@/lib/catalogs/search-scope";
import {
  computeFacets,
  canonicalLanguage,
  facetPointOf,
  languageLabelKey,
  languageSpellings,
  matchesSelection,
  tabulateFacets,
  type FacetCell,
  type FacetSelection,
  type FacetSourceRow,
} from "@/lib/catalogs/facets";

export const revalidate = 3600;

type SearchParams = {
  q?:           string;
  /** "Search in" — which fields `q` is matched against (lib/catalogs/search-scope.ts). */
  in?:          string;
  category?:    string;
  language?:    string;
  availability?:string;   // "available" | "all"
  page?:        string;
  sort?:        string;
  size?:        string;
};

export async function generateMetadata({
  searchParams,
  params: routeParams,
}: {
  searchParams: Promise<SearchParams>;
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  // Independent reads start together — the shape /journals already uses.
  // getCollectionStats() is cached under the "collection-stats" tag and is
  // already read by this page's body, so it costs no extra query and no extra
  // latency here.
  const [params, { locale }, stats, org] = await Promise.all([
    searchParams,
    routeParams,
    getCollectionStats(),
    getOrgIdentity(),
  ]);
  const page = parsePageParam(params.page);
  const t = await getTranslations({ locale, namespace: "catalogs" });
  return buildListingMetadata({
    org,
    path: "/catalogs",
    locale,
    title: t("metaTitle"),
    description: t("metaDescription"),
    page,
    // Unlike its siblings this listing does NOT clamp — it ranges past the
    // end and renders an empty grid, which was indexable and self-canonical
    // for every ?page=N (verified: /catalogs?page=50 listed 0 of 6 books).
    outOfRange: isPageOutOfRange(page, stats?.physicalCatalogs, resolvePageSize(params.size)),
    hasFilters: !!(
      params.q ||
      params.in ||
      params.category ||
      params.language ||
      params.availability ||
      params.sort ||
      params.size
    ),
  });
}

// ── Fetch ──────────────────────────────────────────────────────────────────────
type PublicCatalogBook = CatalogBook & { catalog_copies: CopyStatusRow[] };

type PublicClient = ReturnType<typeof createPublicClient>;
type CandidateRow = FacetSourceRow & { id: string; created_at: string | null; title: string };
type CatalogResult = {
  books: PublicCatalogBook[];
  total: number;
  page: number;
  /** A search's own facet cross-tab; null when browsing (the page reads the catalogue-wide one). */
  facetCells: FacetCell[] | null;
};

const SORTS = {
  newest:    { column: "created_at",       asc: false },
  oldest:    { column: "created_at",       asc: true  },
  title_asc: { column: "title",            asc: true  },
  available: { column: "copies_available", asc: false },
} as const;
type SortKey = keyof typeof SORTS;

const parseSort = (raw: string | undefined): SortKey =>
  raw && Object.hasOwn(SORTS, raw) ? (raw as SortKey) : "newest";

/**
 * The listing's inputs, normalised once. The cache below is keyed on this
 * object, so `?in=` and no `in` at all — the same search — share one entry.
 */
type ListingQuery = {
  q: string;
  scope: CatalogSearchScope;
  sel: FacetSelection;
  sortKey: SortKey;
  page: number;
  pageSize: number;
};

function listingQuery(params: SearchParams): ListingQuery {
  return {
    q: params.q?.trim() ?? "",
    scope: parseSearchScope(params.in),
    sel: {
      category: params.category || undefined,
      language: canonicalLanguage(params.language) ?? undefined,
      availableOnly: params.availability === "available",
    },
    sortKey: parseSort(params.sort),
    page: Math.max(1, Number(params.page) || 1),
    pageSize: resolvePageSize(params.size),
  };
}

const titleCollator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

function compareCandidates(sortKey: SortKey) {
  return (a: CandidateRow, b: CandidateRow): number => {
    let d: number;
    switch (sortKey) {
      case "oldest":    d = (a.created_at ?? "").localeCompare(b.created_at ?? ""); break;
      case "title_asc": d = titleCollator.compare(a.title, b.title); break;
      case "available": d = (b.copies_available ?? 0) - (a.copies_available ?? 0); break;
      default:          d = (b.created_at ?? "").localeCompare(a.created_at ?? "");
    }
    // Stable across pages: every sort ends in the record id.
    return d || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  };
}

/**
 * Search without putting the matches in the URL.
 *
 * DDC matches used to be collected by pre-query and spliced into the listing
 * query as `id.in.(…)`. DDC is matched as a substring, so with the PMB
 * catalogue a short query matches hundreds of records: measured against the
 * local stack (same Kong 2.8.1 / PostgREST v14.17 as production), "37" spliced
 * 497 ids into a 19,606-character URL and Kong answered 414 — whose error path
 * renders "No books found" — and "3" was clipped at 1,000 ids before it got
 * that far. Each leg is now read in full a page at a time, the union is sorted
 * here, and only the visible page's records are fetched by id.
 *
 * Which columns a query searches is `catalogSearchLegs()`'s decision
 * (lib/catalogs/search-scope.ts), including why keywords are not among them.
 *
 * The legs do NOT apply the category/language/availability filters: the
 * candidates are the query's whole answer, so they can also say how many of
 * them each facet would leave. The filters are applied here with
 * `matchesSelection()`, the same predicate the counts use — so a count can
 * never disagree with the result it links to.
 *
 * The first leg is the search; if it fails the search fails, loudly — a
 * thrown error reaches the error boundary instead of being cached for an hour
 * as "No books found". The legs after it widen the result, and their failure
 * narrows it rather than emptying it.
 */
async function searchCatalogBooks(supabase: PublicClient, o: ListingQuery): Promise<CatalogResult> {
  const legs = catalogSearchLegs(o.q, o.scope);
  // Nothing searchable in this scope (an ISBN search with no digits in it).
  if (legs.length === 0) return { books: [], total: 0, page: o.page, facetCells: [] };

  const results = await Promise.all(
    legs.map((leg) =>
      pagedScan<CandidateRow>((from, to) => {
        const base = supabase
          .from("catalog_books")
          .select("id, created_at, title, copies_available, category, language")
          .eq("is_active", true);
        const matched = leg.kind === "or" ? base.or(leg.filter) : base.ilike(leg.column, leg.pattern);
        return matched.order("id", { ascending: true }).range(from, to);
      }, CATALOG_SCAN_CAP),
    ),
  );

  const [primary] = results;
  if (primary.error || primary.truncated) {
    throw new Error(`[catalogs] search failed: ${primary.error?.message ?? "scan cap reached"}`);
  }
  const byId = new Map<string, CandidateRow>();
  for (const leg of results) {
    if (leg.error || leg.truncated) {
      console.error("[catalogs] search leg skipped:", leg.error?.message ?? "scan cap reached");
      continue;
    }
    for (const r of leg.data) byId.set(r.id, r);
  }

  const candidates = [...byId.values()];
  const ordered = candidates
    .filter((r) => matchesSelection(facetPointOf(r), o.sel))
    .sort(compareCandidates(o.sortKey));
  const from = (o.page - 1) * o.pageSize;
  const pageIds = ordered.slice(from, from + o.pageSize).map((r) => r.id);
  const facetCells = tabulateFacets(candidates);
  if (pageIds.length === 0) return { books: [], total: ordered.length, page: o.page, facetCells };

  const { data, error } = await supabase
    .from("catalog_books")
    .select("*, catalog_copies(status)")
    .in("id", pageIds);
  if (error) throw new Error(`[catalogs] search page read failed: ${error.message}`);
  const rank = new Map(pageIds.map((id, i) => [id, i]));
  const books = ((data ?? []) as PublicCatalogBook[]).sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  return { books, total: ordered.length, page: o.page, facetCells };
}

const fetchCatalogBooks = unstable_cache(
  async (o: ListingQuery): Promise<CatalogResult> => {
    const supabase = createPublicClient();
    if (o.q) return searchCatalogBooks(supabase, o);

    // Browsing: SQL filters, sorts and pages. Copy statuses ride along so
    // availability is computed from real copy rows, not the denormalised
    // counters. The id tie-break matters: the PMB import wrote its records
    // in batches, and rows inserted by one statement share `created_at`
    // exactly — without it "newest" could show a record on two pages and
    // another on none.
    const { column, asc } = SORTS[o.sortKey];
    const from = (o.page - 1) * o.pageSize;
    let query = supabase
      .from("catalog_books")
      .select("*, catalog_copies(status)", { count: "exact" })
      .eq("is_active", true)
      .order(column, { ascending: asc })
      .order("id", { ascending: true })
      .range(from, from + o.pageSize - 1);

    // The same question the facet counts ask (matchesSelection): category
    // exactly; language as any stored spelling of the code — each an
    // `ilike` with no wildcard, i.e. case-insensitive equality, from a fixed
    // list, never from the URL.
    if (o.sel.category) query = query.eq("category", o.sel.category);
    if (o.sel.language) {
      const spellings = languageSpellings(o.sel.language);
      query = spellings
        ? query.or(spellings.map((v) => `language.ilike.${v}`).join(","))
        : query.eq("language", o.sel.language);
    }
    if (o.sel.availableOnly) query = query.gt("copies_available", 0);

    const { data, error, count } = await query;
    if (error) throw new Error(`[catalogs] listing read failed: ${error.message}`);
    return { books: (data ?? []) as PublicCatalogBook[], total: count ?? 0, page: o.page, facetCells: null };
  },
  ["catalog-books-query-v2"],
  { revalidate: 3600, tags: ["catalog_books"] }
);

/**
 * Facet counts for the whole catalogue, as a cross-tab of a few dozen cells
 * (lib/catalogs/facets.ts). Paged: a one-shot select saw an arbitrary 1,000
 * records, so a category held only by records past them never became a chip.
 * A failed read THROWS so it is not cached; the page then renders no counts
 * rather than zeros.
 */
const fetchFacetCells = unstable_cache(
  async (): Promise<FacetCell[]> => {
    const supabase = createPublicClient();
    const scan = await pagedScan<FacetSourceRow>(
      (from, to) =>
        supabase
          .from("catalog_books")
          .select("category, language, copies_available")
          .eq("is_active", true)
          .order("id", { ascending: true })
          .range(from, to),
      CATALOG_SCAN_CAP,
    );
    if (scan.error || scan.truncated) {
      throw new Error(`[catalogs] facet read failed: ${scan.error?.message ?? "scan cap reached"}`);
    }
    return tabulateFacets(scan.data);
  },
  ["catalog-facet-cells"],
  { revalidate: 3600, tags: ["catalog_books"] }
);

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildHref(sp: SearchParams, overrides: Partial<SearchParams>) {
  const merged = { ...sp, ...overrides };
  const p = new URLSearchParams();
  Object.entries(merged).forEach(([k, v]) => { if (v) p.set(k, v); });
  const qs = p.toString();
  return `/catalogs${qs ? `?${qs}` : ""}`;
}

function pillClass(active: boolean) {
  return `inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold whitespace-nowrap transition-colors ${
    active
      ? "bg-brand border-brand text-brand-contrast shadow-sm"
      : "border-divider bg-bg-surface text-text-body hover:border-brand hover:text-brand"
  }`;
}

const NUMBER_FORMAT = { en: new Intl.NumberFormat("en"), km: new Intl.NumberFormat("km") } as const;

const CHIP_CLASS =
  "inline-flex items-center gap-1.5 rounded-full bg-brand/5 py-1 pl-3 pr-2 text-[12px] font-semibold text-brand transition hover:bg-brand/10";

function RemoveMark() {
  return <span aria-hidden className="flex h-4 w-4 items-center justify-center rounded-full bg-brand/15 text-[11px]">×</span>;
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default async function CatalogsPage({
  searchParams,
  params: routeParams,
}: {
  searchParams: Promise<SearchParams>;
  params: Promise<{ locale: string }>;
}) {
  const [t, params, { locale }] = await Promise.all([getTranslations('catalogs'), searchParams, routeParams]);
  const basePath = locale === "km" ? "/km/catalogs" : "/catalogs";
  const query = listingQuery(params);
  const [{ books, total, page, facetCells }, catalogueCells, cfg, stats] = await Promise.all([
    fetchCatalogBooks(query),
    // A search tabulates its own candidates; only browsing needs the whole catalogue's.
    query.q
      ? Promise.resolve(null)
      : fetchFacetCells().catch((e: unknown) => {
          console.error(e instanceof Error ? e.message : e);
          return null;
        }),
    getSiteConfig(),
    getCollectionStats(),
  ]);
  // null = the counts could not be read: render no numbers, never zeros.
  const cells = facetCells ?? catalogueCells;
  const facets = cells ? computeFacets(cells, query.sel) : null;

  const pageSize   = query.pageSize;
  const totalPages = Math.ceil(total / pageSize);
  const hasFilters = !!(query.q || params.category || params.language || params.availability);
  // The collection is still being catalogued: no records AND nothing filtered
  // out. Search/filter/sort controls are useless against zero rows, so the
  // header collapses to the title and the empty state carries the visit info.
  // As soon as the first record is added this reverts to the normal layout.
  const catalogEmpty = total === 0 && !hasFilters;

  // Physical catalog records are counted separately from digital resources
  // and are never folded into that total (lib/collection-stats.ts). The
  // denominator here is therefore stats.physicalCatalogs, never the digital
  // figure — mixing the two is the exact confusion this work removes.
  const countChoice = chooseCountLabel(total, stats?.physicalCatalogs ?? null, hasFilters);
  const countLabel =
    countChoice.kind === "none"
      ? null
      : countChoice.kind === "filtered"
        ? t("booksCountFiltered", { count: countChoice.count, total: countChoice.total })
        : t(countChoice.count === 1 ? "booksCount" : "booksCountPlural", { count: countChoice.count });

  const fmt = NUMBER_FORMAT[locale === "km" ? "km" : "en"];
  // Set apart by weight, not by fading: an opacity-75 count failed AA
  // contrast on every inactive pill (axe, 16 nodes on /catalogs).
  const count = (n: number) => <span className="tabular-nums font-normal">{fmt.format(n)}</span>;
  const langLabel = (value: string) => t(`detail.${languageLabelKey(value)}`);

  // The selected category stays reachable even when the other filters leave
  // it nothing to count, so it can still be seen — and cleared — in place.
  const categoryFacets = [...(facets?.categories ?? [])];
  if (params.category && !categoryFacets.some((c) => c.value === params.category)) {
    categoryFacets.push({ value: params.category, count: 0 });
  }
  const sortKey = query.sortKey;
  const searchedIn = query.scope === "all" ? null : t(`scope.${query.scope}`);

  return (
    <ClientNavWrapper>
    <div className="min-h-screen bg-paper">

      {/* ── Header ── */}
      <div className="border-b border-divider bg-bg-surface px-4 py-6 md:px-12">
        <div className="mx-auto max-w-[1400px] space-y-4">

          {/* Title row */}
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-khmer-serif text-2xl font-bold text-text-heading">{t('title')}</h1>
              <p className="mt-0.5 text-sm text-text-muted">
                {t('subtitle')}
              </p>
            </div>
            {/* "0 books" with no context reads as broken — the empty state
                below explains the situation instead. */}
            {!catalogEmpty && countLabel && (
              <p className="text-sm text-text-muted" aria-live="polite">
                {countLabel}
                {query.q && <> {t('resultsFor')} &ldquo;{query.q}&rdquo;</>}
              </p>
            )}
          </div>

          {catalogEmpty ? null : (
          <>
          {/* Can I go there now? — the empty state below carries the same
              facts at length, so this only shows once there are records. */}
          <LibraryVisitStrip
            initialStatus={resolveLibraryStatus(new Date(), cfg.hours.openingHoursSpec, cfg.hours.closures)}
            spec={[...cfg.hours.openingHoursSpec]}
            closures={cfg.hours.closures}
            locale={locale === "km" ? "km" : "en"}
            mapHref={cfg.links.mapPlace}
            directionsLabel={t("emptyVisitCta")}
          />

          {/* The copy counts on every card below are not live yet. */}
          <CatalogAvailabilityNotice text={t("availabilityNotice")} />

          <CatalogSearchForm
            action={basePath}
            q={query.q}
            scope={query.scope}
            keep={{
              category: params.category,
              language: params.language,
              availability: params.availability,
              sort: params.sort,
              size: params.size,
            }}
          />

          {/* Subject (category) facet */}
          {categoryFacets.length > 0 && (
            <div role="group" aria-label={t("facetSubject")} className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              <Link href={buildHref(params, { category: undefined, page: undefined })}
                 aria-current={!params.category ? "true" : undefined}
                 className={pillClass(!params.category)}>
                {t('all')}
                {facets && count(facets.anyCategory)}
              </Link>
              {categoryFacets.map(({ value, count: n }) => (
                <Link key={value}
                   href={buildHref(params, { category: value, page: undefined })}
                   aria-current={params.category === value ? "true" : undefined}
                   className={pillClass(params.category === value)}>
                  {value}
                  {facets && count(n)}
                </Link>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Language + availability */}
            <div role="group" aria-label={t("facetLanguage")} className="flex flex-wrap items-center gap-2">
              {facets && facets.languages.length > 1 && (
                <>
                  <Link href={buildHref(params, { language: undefined, page: undefined })}
                     aria-current={!query.sel.language ? "true" : undefined}
                     className={pillClass(!query.sel.language)}>
                    {t('allLanguages')}
                  </Link>
                  {facets.languages.map(({ value, count: n }) => (
                    <Link key={value}
                       href={buildHref(params, { language: value, page: undefined })}
                       aria-current={query.sel.language === value ? "true" : undefined}
                       className={pillClass(query.sel.language === value)}>
                      {langLabel(value)}
                      {count(n)}
                    </Link>
                  ))}
                </>
              )}

              {/* Available only — a toggle; green is the semantic "on the shelf". */}
              <Link
                href={buildHref(params, {
                  availability: params.availability === "available" ? undefined : "available",
                  page: undefined,
                })}
                aria-current={params.availability === "available" ? "true" : undefined}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold whitespace-nowrap transition-colors ${
                  params.availability === "available"
                    ? "border-success-line bg-success-soft text-success-text"
                    : "border-divider bg-bg-surface text-text-body hover:border-success-line hover:text-success-text"
                }`}
              >
                <span aria-hidden className="h-2 w-2 rounded-full bg-success" />
                {t('availableOnly')}
                {facets && count(facets.available)}
              </Link>
            </div>

            {/* Sort — links, so it works without JavaScript and on a phone. */}
            <div role="group" aria-label={t("sort")} className="flex flex-wrap items-center gap-2">
              <span aria-hidden className="text-[12px] font-medium text-text-muted">{t('sort')}</span>
              {([
                ["newest",    t('sortNewest')],
                ["title_asc", t('sortTitleAsc')],
                ["available", t('sortAvailable')],
              ] as const).map(([key, label]) => (
                <Link
                  key={key}
                  href={buildHref(params, { sort: key === "newest" ? undefined : key, page: undefined })}
                  aria-current={sortKey === key ? "true" : undefined}
                  className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                    sortKey === key
                      ? "bg-brand border-brand text-brand-contrast"
                      : "border-divider bg-bg-surface text-text-muted hover:border-brand hover:text-brand"
                  }`}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>

          {/* Active filter chips */}
          {hasFilters && (
            <div className="flex flex-wrap items-center gap-2">
              {query.q && (
                <Link href={buildHref(params, { q: undefined, in: undefined, page: undefined })}
                   aria-label={t('removeFilter', { filter: `${searchedIn ? `${searchedIn}: ` : ""}${query.q}` })}
                   className={CHIP_CLASS}>
                  {searchedIn && <span className="font-medium opacity-75">{searchedIn}:</span>}
                  &ldquo;{query.q}&rdquo;
                  <RemoveMark />
                </Link>
              )}
              {params.category && (
                <Link href={buildHref(params, { category: undefined, page: undefined })}
                   aria-label={t('removeFilter', { filter: params.category })}
                   className={CHIP_CLASS}>
                  {params.category}
                  <RemoveMark />
                </Link>
              )}
              {params.language && (
                <Link href={buildHref(params, { language: undefined, page: undefined })}
                   aria-label={t('removeFilter', { filter: langLabel(params.language) })}
                   className={CHIP_CLASS}>
                  {langLabel(params.language)}
                  <RemoveMark />
                </Link>
              )}
              {params.availability && (
                <Link href={buildHref(params, { availability: undefined, page: undefined })}
                   aria-label={t('removeFilter', { filter: t('availableOnly') })}
                   className={CHIP_CLASS}>
                  {t('availableOnly')}
                  <RemoveMark />
                </Link>
              )}
              <Link href="/catalogs" className="text-[12px] font-semibold text-text-muted underline decoration-dotted underline-offset-2 hover:text-brand">
                {t('clearFilters')}
              </Link>
            </div>
          )}
          </>
          )}
        </div>
      </div>

      {/* ── Grid ── */}
      <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-12">
        {books.length === 0 ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-divider bg-bg-surface p-10 text-center">
            <svg className="mb-4 h-12 w-12 text-text-muted/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
            {!hasFilters ? (
              /* Catalog genuinely empty — the collection is still being catalogued.
                 Turn the dead end into a useful "visit the library" page. */
              <>
                <h2 className="font-khmer-serif text-xl font-bold text-text-heading">{t('emptyPreparingTitle')}</h2>
                <p className="mt-2 max-w-md text-sm text-text-muted">{t('emptyPreparingBody')}</p>

                <div className="mt-6 grid w-full max-w-lg gap-3 text-left sm:grid-cols-2">
                  <div className="rounded-xl border border-divider bg-paper p-4">
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-text-muted">{t('emptyHoursLabel')}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-text-body" lang={locale}>
                      {locale === "km" ? cfg.hours.km : cfg.hours.en}
                    </p>
                  </div>
                  <div className="rounded-xl border border-divider bg-paper p-4">
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-text-muted">{t('emptyVisitLabel')}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-text-body" lang={locale}>
                      {locale === "km" ? cfg.address.km : cfg.address.en}
                    </p>
                    <a
                      href={cfg.links.mapPlace}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block text-sm font-semibold text-brand underline decoration-dotted underline-offset-2 transition-colors hover:text-brand-hover"
                    >
                      {t('emptyVisitCta')}
                    </a>
                  </div>
                </div>
                <p className="mt-3 max-w-lg text-sm text-text-muted">{t('emptyBorrowNote')}</p>

                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <Link href="/books" className="inline-flex h-11 items-center rounded-xl bg-brand px-6 text-sm font-semibold text-brand-contrast transition hover:bg-brand-hover">
                    {t('emptyPreparingCtaBooks')}
                  </Link>
                  <Link href="/contact" className="inline-flex h-11 items-center rounded-xl border border-divider px-6 text-sm font-semibold text-text-heading transition hover:bg-bg-muted">
                    {t('emptyPreparingCtaContact')}
                  </Link>
                </div>
              </>
            ) : (
              /* Nothing on the shelf matches. Three ways on: loosen the search,
                 look in the digital library, or ask the library to get it. */
              <>
                <h2 className="font-khmer-serif text-xl font-bold text-text-heading">{t('noBooksFound')}</h2>
                <p className="mt-2 max-w-sm text-sm text-text-muted">
                  {query.q ? t('emptyMatchQuery', { query: query.q }) : t('emptyHintFilters')}
                </p>
                {query.q && searchedIn && (
                  <p className="mt-1 max-w-sm text-sm text-text-muted">
                    {t('emptyScopedHint', { scope: searchedIn })}{" "}
                    <Link href={buildHref(params, { in: undefined, page: undefined })} className="font-semibold text-brand underline decoration-dotted underline-offset-2 hover:text-brand-hover">
                      {t('emptySearchAllFields')}
                    </Link>
                  </p>
                )}
                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <Link href="/catalogs" className="inline-flex h-10 items-center rounded-xl bg-brand px-6 text-sm font-semibold text-brand-contrast transition hover:bg-brand-hover">
                    {t('clearFilters')}
                  </Link>
                  {query.q && (
                    <Link
                      href={`/search?q=${encodeURIComponent(query.q)}`}
                      className="inline-flex h-10 items-center rounded-xl border border-divider px-5 text-sm font-semibold text-text-heading transition hover:bg-bg-muted"
                    >
                      {t('emptySearchDigital')}
                    </Link>
                  )}
                  <BookRequestForm />
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            {/* 2 → 3 → 4 → 5 → 6 cols */}
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-4">
              {books.map((book) => (
                <CatalogCard key={book.slug} book={book} />
              ))}
            </div>

            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={total}
              pageSize={pageSize}
              searchParams={params as Record<string, string | undefined>}
              basePath={basePath}
              pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
            />
          </>
        )}
      </div>
    </div>
    </ClientNavWrapper>
  );
}
