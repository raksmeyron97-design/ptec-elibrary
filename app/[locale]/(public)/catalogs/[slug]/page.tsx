// app/catalogs/[slug]/page.tsx
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createPublicClient } from "@/lib/supabase/public";
import { TAGS } from "@/lib/cache/revalidate";
import JsonLd from "@/components/seo/JsonLd";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { SITE_URL } from "@/lib/seo/site";
import { localeAlternates } from "@/lib/seo/alternates";
import type { CatalogBook } from "@/lib/catalog";
import {
  computeCopyStats,
  getCatalogAvailability,
  normalizeCopyStatus,
  formatIsbn,
  AVAILABILITY_KEY,
  AVAILABILITY_TONE,
  COPY_STATUS,
  TONE_BADGE,
  TONE_DOT,
  type CopyStatus,
} from "@/lib/catalog";

export const revalidate = 300;

// ── Cached data access (public client → safe inside unstable_cache) ───────────

type PublicCopy = {
  id: string;
  barcode: string | null;
  call_number: string | null;
  shelf_location: string | null;
  holding_library: string | null;
  status: string | null;
  copy_number?: number | null;
  created_at: string;
};

const fetchCatalogRecord = (slug: string) =>
  unstable_cache(
    async () => {
      const supabase = createPublicClient();
      const { data: book } = await supabase
        .from("catalog_books")
        .select("*")
        .eq("slug", slug)
        .eq("is_active", true)
        .single();
      if (!book) return null;

      const { data: copies } = await supabase
        .from("catalog_copies")
        .select("*")
        .eq("catalog_book_id", book.id)
        .order("created_at", { ascending: true });

      return { book: book as CatalogBook, copies: (copies ?? []) as PublicCopy[] };
    },
    [`catalog-record-${slug}`],
    { revalidate: 300, tags: [TAGS.catalogBooks, TAGS.catalogBook(slug)] },
  )();

const fetchRelated = (bookId: string, category: string | null, author: string | null) =>
  unstable_cache(
    async () => {
      if (!category && !author) return [];
      const supabase = createPublicClient();
      const ors: string[] = [];
      const safe = (v: string) => v.replace(/[,()%.\\]/g, " ").replace(/\s+/g, " ").trim();
      if (category) ors.push(`category.eq.${safe(category)}`);
      if (author) ors.push(`author.ilike.%${safe(author)}%`);
      const { data } = await supabase
        .from("catalog_books")
        .select("id, title, slug, author, year, cover_url, cover_color, category")
        .eq("is_active", true)
        .neq("id", bookId)
        .or(ors.join(","))
        .order("created_at", { ascending: false })
        .limit(6);
      return data ?? [];
    },
    [`catalog-related-${bookId}`],
    { revalidate: 3600, tags: [TAGS.catalogBooks] },
  )();

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}): Promise<Metadata> {
  const { slug, locale } = await params;
  const record = await fetchCatalogRecord(slug);
  if (!record) return { title: "Book not found", robots: { index: false } };
  const { book } = record;

  const title = book.author ? `${book.title} by ${book.author}` : book.title;
  const desc = book.description
    ? book.description.length > 157
      ? book.description.slice(0, 157) + "..."
      : book.description
    : `Find ${book.title}${book.author ? ` by ${book.author}` : ""} at PTEC Library. View publication details, ISBN, call number, shelf location and current availability of physical copies.`;

  const alternates = localeAlternates(`/catalogs/${slug}`, locale);
  const canonicalUrl = alternates.canonical;

  return {
    title,
    description: desc,
    alternates,
    openGraph: {
      title,
      description: desc,
      type: "book",
      url: canonicalUrl,
      images: book.cover_url
        ? [{ url: book.cover_url, alt: book.title }]
        : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: desc,
      images: book.cover_url ? [book.cover_url] : undefined,
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexOf(cover?: string | null) {
  return cover?.match(/#[0-9a-fA-F]{6}/)?.[0] ?? "#1E3A8A";
}

const TONE_TEXT: Record<string, string> = {
  positive: "text-emerald-700 dark:text-emerald-400",
  warning:  "text-amber-600 dark:text-amber-400",
  danger:   "text-red-500 dark:text-red-400",
  info:     "text-sky-700 dark:text-sky-400",
  neutral:  "text-text-muted",
};

const TONE_SURFACE: Record<string, string> = {
  positive: "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800",
  warning:  "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800",
  danger:   "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800",
  info:     "bg-sky-50 border-sky-200 dark:bg-sky-900/20 dark:border-sky-800",
  neutral:  "bg-paper border-divider",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CatalogBookPage({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug } = await params;
  const [record, t] = await Promise.all([
    fetchCatalogRecord(slug),
    getTranslations("catalogs"),
  ]);

  if (!record) notFound();
  const { book: b, copies: allCopies } = record;

  // Withdrawn copies are internal history — never shown to readers.
  const copies = allCopies
    .filter((c) => normalizeCopyStatus(c.status) !== "withdrawn")
    .sort((a, c) => (a.copy_number ?? 1e9) - (c.copy_number ?? 1e9));

  const stats = computeCopyStats(copies);
  const availability = getCatalogAvailability(stats);
  const tone = AVAILABILITY_TONE[availability];

  const sortedCopies = [
    ...copies.filter((c) => normalizeCopyStatus(c.status) === "available"),
    ...copies.filter((c) => normalizeCopyStatus(c.status) !== "available"),
  ];

  const related = await fetchRelated(b.id, b.category, b.author);

  const coverHex = hexOf(b.cover_color ?? b.cover_url);

  const langLabel = (lang?: string | null) => {
    if (!lang) return null;
    const key = ({ km: "langKm", en: "langEn", fr: "langFr", zh: "langZh" } as Record<string, string>)[lang] ?? "langOther";
    return t(`detail.${key}`);
  };

  // JSON-LD: only factual values from the record. PTEC is the holding library,
  // never the publisher — publisher appears only when the record has one.
  const bookSchema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Book",
    name: b.title,
    url: `${SITE_URL}/catalogs/${b.slug}`,
    inLanguage: b.language || undefined,
    author: b.author ? { "@type": "Person", name: b.author } : undefined,
    isbn: b.isbn || undefined,
    datePublished: b.year ? String(b.year) : undefined,
    description: b.description || undefined,
    image: b.cover_url || undefined,
    publisher: b.publisher ? { "@type": "Organization", name: b.publisher } : undefined,
  };
  Object.keys(bookSchema).forEach((k) => bookSchema[k] === undefined && delete bookSchema[k]);

  const metaFields = [
    { label: t("detail.author"),      value: b.author },
    { label: t("detail.language"),    value: langLabel(b.language) },
    { label: t("detail.year"),        value: b.year },
    { label: t("detail.isbn"),        value: formatIsbn(b.isbn) },
    { label: t("detail.publisher"),   value: b.publisher },
    { label: t("detail.category"),    value: b.category },
    { label: t("detail.department"),  value: b.department },
    { label: t("detail.totalCopies"), value: stats.total > 0 ? String(stats.total) : null },
  ].filter((f) => f.value);

  const catalogBreadcrumbSchema = breadcrumbSchema([
    { name: "Home", path: "/home" },
    { name: "Books In Library", path: "/catalogs" },
    { name: b.title },
  ]);

  return (
    <div className="min-h-screen bg-paper">
      <JsonLd data={bookSchema} />
      <JsonLd data={catalogBreadcrumbSchema} />

      {/* ── Hero band ── */}
      <div
        className="relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${coverHex}22 0%, ${coverHex}08 100%)` }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage: "radial-gradient(rgba(0,0,0,0.06) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-[2px]"
          style={{ background: `linear-gradient(to right, transparent, ${coverHex}55, transparent)` }}
        />

        <div className="relative mx-auto max-w-[1100px] px-4 pb-6 pt-4 md:px-12">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-text-muted">
            <Link href="/home" className="transition-colors hover:text-brand">{t("detail.home")}</Link>
            <svg className="h-3.5 w-3.5 shrink-0 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden><path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <Link href="/catalogs" className="transition-colors hover:text-brand">{t("detail.library")}</Link>
            <svg className="h-3.5 w-3.5 shrink-0 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden><path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span className="max-w-[180px] truncate font-medium text-text-heading sm:max-w-xs" aria-current="page">{b.title}</span>
          </nav>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="mx-auto max-w-[1100px] px-4 py-8 md:px-12 md:py-10">
        <div className="grid gap-8 lg:grid-cols-[260px_1fr] lg:gap-10">

          {/* ══ LEFT SIDEBAR ══ */}
          <aside className="flex flex-col items-center gap-5 lg:items-stretch">

            {/* Book cover */}
            <div className="group relative mx-auto w-full max-w-[220px] lg:max-w-none">
              <div
                aria-hidden
                className="absolute -bottom-1.5 left-1.5 right-1.5 top-1.5 rounded-2xl"
                style={{ background: `${coverHex}55` }}
              />
              <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl border border-black/10 shadow-[0_16px_48px_rgba(0,0,0,0.18),0_4px_12px_rgba(0,0,0,0.1)] dark:border-white/10">
                {b.cover_url ? (
                  <Image
                    src={b.cover_url}
                    alt={b.title}
                    fill
                    sizes="(max-width: 768px) 200px, 260px"
                    className="object-cover"
                    priority
                    unoptimized={true}
                  />
                ) : (
                  <div
                    className="flex h-full w-full flex-col justify-end p-5"
                    style={{ background: `linear-gradient(150deg, ${coverHex} 0%, ${coverHex}cc 100%)` }}
                  >
                    <div aria-hidden className="absolute bottom-0 left-0 top-0 w-[7px] rounded-l-2xl" style={{ background: "rgba(0,0,0,0.20)" }} />
                    <div aria-hidden className="absolute inset-y-0 right-0 w-[5px] rounded-r-2xl" style={{ background: "rgba(255,255,255,0.12)" }} />
                    <div>
                      {b.category && (
                        <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-white/55">{b.category}</p>
                      )}
                      <p className="font-khmer-serif line-clamp-4 text-[15px] font-bold leading-snug text-white">{b.title}</p>
                      {b.author && <p className="mt-1.5 text-xs text-white/70">{b.author}</p>}
                    </div>
                    <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-1/3 rounded-r-2xl" style={{ background: "linear-gradient(to left, rgba(255,255,255,0.08), transparent)" }} />
                  </div>
                )}
              </div>
            </div>

            {/* Availability card */}
            <div className={`w-full rounded-2xl border p-5 ${TONE_SURFACE[tone]}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${TONE_DOT[tone]} ring-2 ring-white/40 ring-offset-1`} />
                  <span className={`text-sm font-bold ${TONE_TEXT[tone]}`}>
                    {t(`avail.${AVAILABILITY_KEY[availability]}`)}
                  </span>
                </div>
                {stats.total > 0 && (
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${TONE_TEXT[tone]} bg-white/60 dark:bg-black/20`}>
                    {stats.available}/{stats.total}
                  </span>
                )}
              </div>

              {stats.total > 0 && (
                <p className="mt-2 text-[12px] text-text-body">
                  {t("detail.copiesSummary", { available: stats.available, total: stats.total })}
                </p>
              )}

              {b.shelf_location && (
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/60 px-3 py-2 dark:bg-black/15">
                  <svg className="h-3.5 w-3.5 shrink-0 text-gold-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                  </svg>
                  <span className="text-[12px] text-text-body">
                    {t("detail.shelf")}: <span className="font-mono font-bold text-text-heading">{b.shelf_location}</span>
                  </span>
                </div>
              )}
            </div>

            {/* Contact CTA */}
            <Link
              href="/contact"
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-brand-contrast shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-hover hover:shadow-md"
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              {t("detail.contactLibrarian")}
            </Link>

            {/* Back link — sidebar on desktop */}
            <Link
              href="/catalogs"
              className="hidden cursor-pointer items-center gap-2 text-sm font-semibold text-text-muted transition-colors hover:text-brand lg:inline-flex"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M19 12H5m0 0 7 7m-7-7 7-7" />
              </svg>
              {t("detail.back")}
            </Link>
          </aside>

          {/* ══ RIGHT CONTENT ══ */}
          <div className="min-w-0 space-y-5">

            {/* Title / Category / Author */}
            <div className="border-b border-divider/60 pb-5">
              {b.category && (
                <span
                  className="mb-3 inline-block rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider"
                  style={{ background: `${coverHex}15`, color: coverHex }}
                >
                  {b.category}
                </span>
              )}
              <h1 className="font-khmer-serif text-2xl font-bold leading-tight text-text-heading md:text-[28px]">
                {b.title}
              </h1>
              {b.author && (
                <p className="mt-2 flex items-center gap-1.5 text-base font-medium text-text-muted">
                  <svg className="h-4 w-4 shrink-0 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                  {b.author}
                  {b.year ? <span className="text-text-muted">· {b.year}</span> : null}
                </p>
              )}
            </div>

            {/* Description */}
            {b.description && (
              <div className="rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm">
                <h2 className="mb-2.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-gold-700">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                  </svg>
                  {t("detail.descriptionHeading")}
                </h2>
                <p className="whitespace-pre-line text-[14.5px] leading-[1.75] text-text-body">{b.description}</p>
              </div>
            )}

            {/* Book Details */}
            {metaFields.length > 0 && (
              <div className="rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm">
                <h2 className="mb-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-gold-700">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>
                  </svg>
                  {t("detail.detailsHeading")}
                </h2>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
                  {metaFields.map(({ label, value }) => (
                    <div key={label} className="space-y-0.5">
                      <dt className="text-[11px] font-medium uppercase tracking-wider text-text-muted">{label}</dt>
                      <dd className="font-semibold text-text-heading">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {/* Physical Copies */}
            <div className="rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-gold-700">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                  </svg>
                  {t("detail.copiesHeading")}
                  {copies.length > 0 && (
                    <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand">
                      {copies.length}
                    </span>
                  )}
                </h2>
                {copies.length > 0 && stats.available > 0 && (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    <span aria-hidden className="h-2 w-2 rounded-full bg-emerald-500" />
                    {t("detail.availableCount", { available: stats.available })}
                  </span>
                )}
              </div>

              {copies.length === 0 ? (
                <div className="flex items-center gap-3 rounded-xl border border-dashed border-divider bg-paper/60 p-4 text-sm text-text-muted">
                  <svg className="h-8 w-8 shrink-0 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                  </svg>
                  <div>
                    <p className="font-semibold text-text-heading">{t("detail.noCopiesTitle")}</p>
                    <p className="text-xs">{t("detail.noCopiesBody")}</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden overflow-x-auto sm:block">
                    <table className="w-full text-sm">
                      <caption className="sr-only">{t("detail.copiesHeading")}</caption>
                      <thead>
                        <tr className="border-b border-divider text-left">
                          {[
                            "",
                            t("detail.barcode"),
                            t("detail.callNumber"),
                            t("detail.shelf"),
                            t("detail.holdingLibrary"),
                            t("detail.status"),
                          ].map((h, i) => (
                            <th key={i} scope="col" className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-divider/50">
                        {sortedCopies.map((copy, idx) => {
                          const s = normalizeCopyStatus(copy.status);
                          const meta = COPY_STATUS[s];
                          return (
                            <tr key={copy.id}>
                              <th scope="row" className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-bold text-text-heading">
                                {t("detail.copyNumber", { number: copy.copy_number ?? idx + 1 })}
                              </th>
                              <td className="px-3 py-2.5 font-mono text-xs">
                                {copy.barcode ?? <span aria-hidden className="text-text-muted">—</span>}
                              </td>
                              <td className="px-3 py-2.5 font-mono text-xs">
                                {copy.call_number ?? <span aria-hidden className="text-text-muted">—</span>}
                              </td>
                              <td className="px-3 py-2.5 font-mono text-xs">
                                {copy.shelf_location ?? b.shelf_location ?? <span aria-hidden className="text-text-muted">—</span>}
                              </td>
                              <td className="px-3 py-2.5 text-xs">{copy.holding_library ?? "PTEC Library"}</td>
                              <td className="px-3 py-2.5">
                                <CopyStatusBadge status={s} label={t(`copyStatus.${meta.publicKey}`)} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <ul className="grid gap-3 sm:hidden">
                    {sortedCopies.map((copy, idx) => {
                      const s = normalizeCopyStatus(copy.status);
                      const meta = COPY_STATUS[s];
                      return (
                        <li key={copy.id} className="rounded-xl border border-divider bg-paper/50 p-4">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-text-heading">
                              {t("detail.copyNumber", { number: copy.copy_number ?? idx + 1 })}
                            </span>
                            <CopyStatusBadge status={s} label={t(`copyStatus.${meta.publicKey}`)} />
                          </div>
                          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                            {copy.barcode && (
                              <div>
                                <dt className="font-medium uppercase tracking-wider text-text-muted">{t("detail.barcode")}</dt>
                                <dd className="font-mono font-semibold text-text-heading">{copy.barcode}</dd>
                              </div>
                            )}
                            {copy.call_number && (
                              <div>
                                <dt className="font-medium uppercase tracking-wider text-text-muted">{t("detail.callNumber")}</dt>
                                <dd className="font-mono font-semibold text-text-heading">{copy.call_number}</dd>
                              </div>
                            )}
                            {(copy.shelf_location ?? b.shelf_location) && (
                              <div>
                                <dt className="font-medium uppercase tracking-wider text-text-muted">{t("detail.shelf")}</dt>
                                <dd className="font-mono font-semibold text-text-heading">{copy.shelf_location ?? b.shelf_location}</dd>
                              </div>
                            )}
                            <div>
                              <dt className="font-medium uppercase tracking-wider text-text-muted">{t("detail.holdingLibrary")}</dt>
                              <dd className="font-semibold text-text-heading">{copy.holding_library ?? "PTEC Library"}</dd>
                            </div>
                          </dl>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>

            {/* Related records */}
            {related.length > 0 && (
              <div className="rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm">
                <h2 className="mb-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-gold-700">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                  </svg>
                  {t("detail.relatedHeading")}
                </h2>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {related.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/catalogs/${r.slug}`}
                        className="group flex gap-3 rounded-xl border border-divider bg-paper/40 p-3 transition hover:border-brand/40 hover:shadow-sm"
                      >
                        <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded-md border border-black/5">
                          {r.cover_url ? (
                            <Image src={r.cover_url} alt="" fill sizes="44px" className="object-cover" unoptimized />
                          ) : (
                            <div className={`h-full w-full ${r.cover_color ?? "bg-brand"}`} />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-khmer-serif line-clamp-2 text-xs font-bold leading-snug text-text-heading group-hover:text-brand">
                            {r.title}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-text-muted">
                            {r.author}{r.year ? ` · ${r.year}` : ""}
                          </p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Back link — inline on mobile */}
            <Link
              href="/catalogs"
              className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-text-muted transition-colors hover:text-brand lg:hidden"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M19 12H5m0 0 7 7m-7-7 7-7" />
              </svg>
              {t("detail.back")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// Status is always text + colored dot — never color alone.
function CopyStatusBadge({ status, label }: { status: CopyStatus; label: string }) {
  const tone = COPY_STATUS[status].tone;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${TONE_BADGE[tone]}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} />
      {label}
    </span>
  );
}
