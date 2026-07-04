import Link from "next/link";
import type { Metadata } from "next";
import { getPublications } from "@/app/actions/publications";
import type { Publication } from "@/lib/publications";
import { citationYear } from "@/lib/citations";
import PublicationCard from "@/components/ui/publications/PublicationCard";
import PublicationFilters from "@/components/ui/publications/PublicationFilters";
import Icon from "@/components/ui/core/Icon";
import Pagination from "@/components/ui/core/Pagination";
import { ClientNavWrapper } from "@/components/ui/books/ClientNavWrapper";
import { PAGE_SIZE_OPTIONS, resolvePageSize } from "@/lib/pagination";
import { getTranslations } from "next-intl/server";
import { SITE_URL } from "@/lib/seo/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Publications | PTEC Library",
  description:
    "Browse academic journal articles published through the Phnom Penh Teacher Education College (PTEC). Search by journal, year, keywords, and article type.",
  alternates: { canonical: `${SITE_URL}/publications` },
  openGraph: {
    title: "Publications | PTEC Library",
    description:
      "Browse academic journal articles from PTEC. Search by journal, year, and keywords.",
    url: `${SITE_URL}/publications`,
    type: "website",
  },
};

type SP = {
  q?: string;
  keyword?: string;
  type?: string;
  journal?: string;
  year?: string;
  language?: string;
  page?: string;
  size?: string;
};

function matchesQ(pub: Publication, q: string): boolean {
  const needle = q.toLowerCase();
  return [pub.title, pub.title_km, pub.abstract, pub.author_names, pub.journal_name]
    .some((field) => field?.toLowerCase().includes(needle));
}

export default async function PublicationsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const t = await getTranslations("publications");
  const params = await searchParams;

  // Fetch every published article once, then facet/filter in-page —
  // same approach as the theses listing (dataset is institutional-scale).
  const { data } = await getPublications({});
  const all = data ?? [];

  const publications = all.filter((pub) => {
    if (params.q && !matchesQ(pub, params.q)) return false;
    if (params.keyword && !pub.keywords.some((k) => k.toLowerCase() === params.keyword!.toLowerCase())) return false;
    if (params.type && pub.article_type !== params.type) return false;
    if (params.journal && pub.journal_name !== params.journal) return false;
    if (params.year && citationYear(pub) !== params.year) return false;
    if (params.language && pub.language !== params.language) return false;
    return true;
  });

  // Facet options derived from the full published set
  const journals = [...new Set(all.map((p) => p.journal_name).filter(Boolean))] as string[];
  const years = [...new Set(all.map((p) => citationYear(p)).filter(Boolean))].sort().reverse() as string[];

  const total = publications.length;
  const pageSize = resolvePageSize(params.size);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Number(params.page) || 1), totalPages);
  const paged = publications.slice((page - 1) * pageSize, page * pageSize);

  const hasFilters = !!(params.q || params.keyword || params.type || params.journal || params.year || params.language);

  return (
    <ClientNavWrapper>
      <div className="min-h-screen bg-bg-body">
        <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-10 md:py-8">
          {/* ── Page header ── */}
          <div className="mb-6">
            <h1 className="font-khmer-serif text-2xl font-bold text-text-heading sm:text-3xl">
              {t("title")}
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-text-muted">
              {t("subtitle")}
            </p>
          </div>

          <div className="space-y-4">
            <PublicationFilters
              filters={{
                q: params.q ?? "",
                type: params.type ?? "",
                journal: params.journal ?? "",
                year: params.year ?? "",
                language: params.language ?? "",
                keyword: params.keyword ?? "",
              }}
              journals={journals}
              years={years}
              labels={{
                searchPlaceholder: t("searchPlaceholder"),
                allTypes: t("allTypes"),
                allJournals: t("allJournals"),
                allYears: t("allYears"),
                allLanguages: t("allLanguages"),
                clear: t("clearFilters"),
                types: {
                  article: t("typeArticle"),
                  review: t("typeReview"),
                  account: t("typeAccount"),
                  editorial: t("typeEditorial"),
                },
              }}
            />

            {/* Active keyword chip */}
            {params.keyword && (
              <p className="text-[13px] text-text-muted">
                {t("filteredByKeyword")}{" "}
                <Link
                  href="/publications"
                  className="inline-flex items-center gap-1 rounded-full border border-brand/20 bg-brand/5 px-3 py-1 font-medium text-brand transition-colors hover:bg-brand/10"
                >
                  {params.keyword} ✕
                </Link>
              </p>
            )}

            {/* Result count */}
            <p className="text-[13px] text-text-muted">
              {total > 0 ? t("resultCount", { count: total }) : t("noResults")}
              {params.q && <> {t("resultsFor", { q: params.q })}</>}
            </p>

            {/* Results */}
            {publications.length === 0 ? (
              <div className="flex min-h-[280px] sm:min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-divider bg-bg-surface p-6 sm:p-10 text-center">
                <Icon name="search-off" className="mb-3 text-4xl sm:text-5xl text-text-muted" />
                <h2 className="text-lg sm:text-xl font-bold text-text-body">{t("noResults")}</h2>
                <p className="mt-2 max-w-sm text-sm leading-6 text-text-muted">
                  {hasFilters ? t("noResultsFiltered") : t("noResultsEmpty")}
                </p>
                {hasFilters && (
                  <Link
                    href="/publications"
                    className="mt-5 inline-flex h-10 items-center rounded-full bg-brand px-6 text-sm font-semibold text-brand-contrast transition hover:bg-brand-hover"
                  >
                    {t("clearFilters")}
                  </Link>
                )}
              </div>
            ) : (
              <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 sm:gap-5">
                {paged.map((pub) => (
                  <PublicationCard key={pub.id} publication={pub} />
                ))}
              </div>
            )}

            {publications.length > 0 && (
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={total}
                pageSize={pageSize}
                searchParams={params as Record<string, string | undefined>}
                basePath="/publications"
                pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
              />
            )}
          </div>
        </div>
      </div>
    </ClientNavWrapper>
  );
}
