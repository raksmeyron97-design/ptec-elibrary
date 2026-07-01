// app/catalogs/[slug]/page.tsx
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import JsonLd from "@/components/seo/JsonLd";
import { SITE_URL } from "@/lib/seo/site";
import type { CatalogBook } from "@/lib/catalog";
import {
  getAvailability,
  AVAILABILITY_LABEL,
  AVAILABILITY_COLOR,
  AVAILABILITY_BG,
  AVAILABILITY_DOT,
} from "@/lib/catalog";
import type { CatalogCopy } from "@/app/(admin)/admin/(protected)/catalogs/copy-actions";

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: book } = await supabase
    .from("catalog_books")
    .select("title, description, cover_url, author, isbn, year, language, is_active")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (!book) return { title: "Book not found" };

  const desc = book.description
    ? book.description.length > 157
      ? book.description.slice(0, 157) + "..."
      : book.description
    : `${book.title} by ${book.author ?? "Unknown"} — available in the PTEC Library physical collection.`;

  const canonicalUrl = `${SITE_URL}/catalogs/${slug}`;

  return {
    title: book.title,
    description: desc,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: book.title,
      description: desc,
      type: "book",
      url: canonicalUrl,
      images: book.cover_url
        ? [{ url: book.cover_url, alt: book.title }]
        : [],
    },
    twitter: {
      card: "summary_large_image",
      title: book.title,
      description: desc,
      images: book.cover_url ? [book.cover_url] : undefined,
    },
  };
}

// ── Copy status display maps ───────────────────────────────────────────────────
const COPY_STATUS_LABEL: Record<string, string> = {
  available:   "Available",
  checked_out: "Checked Out",
  lost:        "Lost",
  damaged:     "Damaged",
  on_order:    "On Order",
};

const COPY_STATUS_COLOR: Record<string, string> = {
  available:   "text-emerald-700 dark:text-emerald-400",
  checked_out: "text-amber-600 dark:text-amber-400",
  lost:        "text-red-500 dark:text-red-400",
  damaged:     "text-orange-500 dark:text-orange-400",
  on_order:    "text-info dark:text-info",
};

const COPY_STATUS_BADGE: Record<string, string> = {
  available:   "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400",
  checked_out: "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-400",
  lost:        "bg-red-50 border-red-200 text-red-600 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400",
  damaged:     "bg-orange-50 border-orange-200 text-orange-600 dark:bg-orange-500/10 dark:border-orange-500/20 dark:text-orange-400",
  on_order:    "bg-brand/5 border-divider text-brand dark:bg-brand/10 dark:text-brand",
};

const COPY_STATUS_CARD_BG: Record<string, string> = {
  available:   "bg-emerald-50/60 border-emerald-200 dark:bg-emerald-900/10 dark:border-emerald-800/40",
  checked_out: "bg-amber-50/60 border-amber-200 dark:bg-amber-900/10 dark:border-amber-800/40",
  lost:        "bg-red-50/60 border-red-200 dark:bg-red-900/10 dark:border-red-800/40",
  damaged:     "bg-orange-50/60 border-orange-200 dark:bg-orange-900/10 dark:border-orange-800/40",
  on_order:    "bg-brand/5 border-divider dark:bg-brand/5 dark:border-divider",
};


// ── Helpers ───────────────────────────────────────────────────────────────────
function hexOf(cover?: string | null) {
  return cover?.match(/#[0-9a-fA-F]{6}/)?.[0] ?? "#1E3A8A";
}

// Language display
function langLabel(lang?: string | null) {
  if (!lang) return null;
  if (lang === "km") return "Khmer";
  if (lang === "en") return "English";
  return lang;
}

export default async function CatalogBookPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: book, error } = await supabase
    .from("catalog_books")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (!book || error) notFound();

  const b = book as CatalogBook;

  const { data: copiesRaw } = await supabase
    .from("catalog_copies")
    .select("*")
    .eq("catalog_book_id", b.id)
    .order("created_at", { ascending: true });

  const copies = (copiesRaw ?? []) as CatalogCopy[];

  const status    = getAvailability(b);
  const statusBg  = AVAILABILITY_BG[status];
  const statusTxt = AVAILABILITY_COLOR[status];
  const statusDot = AVAILABILITY_DOT[status];

  const sortedCopies = [
    ...copies.filter((c) => c.status === "available"),
    ...copies.filter((c) => c.status !== "available"),
  ];

  const stockPct = b.copies_total > 0
    ? Math.round((b.copies_available / b.copies_total) * 100)
    : 0;

  const coverHex = hexOf(b.cover_color ?? b.cover_url);

  const bookSchema = {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: b.title,
    author: b.author ? { '@type': 'Person', name: b.author } : { '@type': 'Organization', name: 'Unknown Author' },
    isbn: b.isbn || undefined,
    inLanguage: b.language || "en",
    description: b.description || b.title,
    image: b.cover_url || `${SITE_URL}/og-image.jpg`,
    url: `${SITE_URL}/catalogs/${b.slug}`,
    publisher: {
      '@type': 'EducationalOrganization',
      name: 'Phnom Penh Teacher Education College',
    },
    bookFormat: 'https://schema.org/Hardcover',
  };

  // Stock health color
  const stockColor = stockPct >= 60
    ? "bg-emerald-500"
    : stockPct >= 30
    ? "bg-amber-400"
    : "bg-red-400";

  const metaFields = [
    { label: "Author",         value: b.author },
    { label: "Language",       value: langLabel(b.language) },
    { label: "Year",           value: b.year },
    { label: "ISBN",           value: b.isbn },
    { label: "Department",     value: b.department },
    { label: "Accession No.",  value: b.accession_number },
    { label: "Shelf",          value: b.shelf_location },
    { label: "Total Copies",   value: b.copies_total != null ? String(b.copies_total) : null },
  ].filter(f => f.value);

  return (
    <div className="min-h-screen bg-paper">
      <JsonLd data={bookSchema} />

      {/* ── Hero band ── */}
      <div
        className="relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${coverHex}22 0%, ${coverHex}08 100%)` }}
      >
        {/* Subtle dot pattern */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage: "radial-gradient(rgba(0,0,0,0.06) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
        {/* Color bleed accent line */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-[2px]"
          style={{ background: `linear-gradient(to right, transparent, ${coverHex}55, transparent)` }}
        />

        <div className="relative mx-auto max-w-[1100px] px-4 pb-6 pt-4 md:px-12">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-text-muted">
            <Link href="/home" className="transition-colors hover:text-brand">Home</Link>
            <svg className="h-3.5 w-3.5 shrink-0 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden><path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <Link href="/catalogs" className="transition-colors hover:text-brand">Library</Link>
            <svg className="h-3.5 w-3.5 shrink-0 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden><path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span className="max-w-[180px] truncate font-medium text-text-heading sm:max-w-xs">{b.title}</span>
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
              {/* Glow */}
              <div
                aria-hidden
                className="pointer-events-none absolute -inset-3 -z-10 rounded-2xl opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-60"
                style={{ background: coverHex }}
              />
              {/* Shadow stack (3D book effect) */}
              <div
                aria-hidden
                className="absolute -bottom-1.5 left-1.5 right-1.5 top-1.5 rounded-2xl"
                style={{ background: `${coverHex}55` }}
              />
              <div
                className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl border border-black/10 shadow-[0_16px_48px_rgba(0,0,0,0.18),0_4px_12px_rgba(0,0,0,0.1)] dark:border-white/10"
              >
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
                    {/* Book spine */}
                    <div aria-hidden className="absolute left-0 top-0 bottom-0 w-[7px] rounded-l-2xl" style={{ background: "rgba(0,0,0,0.20)" }} />
                    {/* Page edge */}
                    <div aria-hidden className="absolute inset-y-0 right-0 w-[5px] rounded-r-2xl" style={{ background: "rgba(255,255,255,0.12)" }} />
                    <div>
                      {b.category && (
                        <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-white/55">{b.category}</p>
                      )}
                      <p className="font-khmer-serif text-[15px] font-bold leading-snug text-white line-clamp-4">{b.title}</p>
                      {b.author && <p className="mt-1.5 text-xs text-white/70">{b.author}</p>}
                    </div>
                    {/* Sheen */}
                    <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-1/3 rounded-r-2xl" style={{ background: "linear-gradient(to left, rgba(255,255,255,0.08), transparent)" }} />
                  </div>
                )}
              </div>
            </div>

            {/* Availability card */}
            <div className={`w-full rounded-2xl border p-5 ${statusBg}`}>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${statusDot} ring-2 ring-white/40 ring-offset-1`} />
                  <span className={`text-sm font-bold ${statusTxt}`}>{AVAILABILITY_LABEL[status]}</span>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${statusTxt} bg-white/60 dark:bg-black/20`}>
                  {b.copies_available}/{b.copies_total}
                </span>
              </div>

              {/* Stock bar */}
              {b.copies_total > 0 && (
                <div className="mb-3">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${stockColor}`}
                      style={{ width: `${stockPct}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-text-muted">{b.copies_available} of {b.copies_total} copies available</p>
                </div>
              )}

              {b.shelf_location && (
                <div className="flex items-center gap-2 rounded-xl bg-white/60 px-3 py-2 dark:bg-black/15">
                  <svg className="h-3.5 w-3.5 shrink-0 text-gold-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                  </svg>
                  <span className="text-[12px] text-text-body">
                    Shelf: <span className="font-mono font-bold text-text-heading">{b.shelf_location}</span>
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
              Contact Librarian
            </Link>

            {/* Back link — sidebar on desktop */}
            <Link
              href="/catalogs"
              className="hidden cursor-pointer items-center gap-2 text-sm font-semibold text-text-muted transition-colors hover:text-brand lg:inline-flex"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M19 12H5m0 0 7 7m-7-7 7-7" />
              </svg>
              Back to catalogue
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
                  Description
                </h2>
                <p className="text-[14.5px] leading-[1.75] text-text-body">{b.description}</p>
              </div>
            )}

            {/* Book Details */}
            {metaFields.length > 0 && (
              <div className="rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm">
                <h2 className="mb-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-gold-700">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>
                  </svg>
                  Book Details
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
                  Physical Copies
                  {copies.length > 0 && (
                    <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand">
                      {copies.length}
                    </span>
                  )}
                </h2>
                {copies.length > 0 && (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    {b.copies_available} available
                  </span>
                )}
              </div>

              {copies.length === 0 ? (
                <div className="flex items-center gap-3 rounded-xl border border-dashed border-divider bg-paper/60 p-4 text-sm text-text-muted">
                  <svg className="h-8 w-8 shrink-0 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                  </svg>
                  <div>
                    <p className="font-semibold text-text-heading">No copy records</p>
                    <p className="text-xs">Individual copy data has not been added yet.</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Stock bar */}
                  <div className="mb-5 rounded-xl bg-paper/60 px-4 py-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-text-muted">Stock health</span>
                      <span className="text-xs font-bold text-text-body">{stockPct}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-paper">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${stockColor}`}
                        style={{ width: `${stockPct}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] text-text-muted">
                      {b.copies_available} of {b.copies_total} copies currently available
                    </p>
                  </div>

                  {/* Copy cards */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {sortedCopies.map((copy) => (
                      <div
                        key={copy.id}
                        className={`relative rounded-xl border p-4 transition-shadow hover:shadow-sm ${COPY_STATUS_CARD_BG[copy.status] ?? "bg-paper border-divider"}`}
                      >
                        {/* Status badge */}
                        <span className={`absolute right-3 top-3 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${COPY_STATUS_BADGE[copy.status] ?? "bg-paper border-divider text-text-muted"}`}>
                          {COPY_STATUS_LABEL[copy.status] ?? copy.status}
                        </span>

                        <div className="space-y-3 pr-24">
                          {/* Barcode */}
                          <div>
                            <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">Barcode</p>
                            <p className={`font-mono text-sm font-bold ${COPY_STATUS_COLOR[copy.status] ?? "text-text-heading"}`}>
                              {copy.barcode ?? <span className="font-normal text-text-muted">—</span>}
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">Library</p>
                              <p className="text-xs font-semibold text-text-heading">{copy.holding_library}</p>
                            </div>
                            <div>
                              <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">Shelf</p>
                              <p className="font-mono text-xs font-semibold text-text-heading">
                                {copy.shelf_location ?? b.shelf_location ?? "—"}
                              </p>
                            </div>
                          </div>

                          {copy.call_number && (
                            <div>
                              <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">Call Number</p>
                              <p className="font-mono text-xs font-semibold text-text-body">{copy.call_number}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Back link — inline on mobile */}
            <Link
              href="/catalogs"
              className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-text-muted transition-colors hover:text-brand lg:hidden"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M19 12H5m0 0 7 7m-7-7 7-7" />
              </svg>
              Back to catalogue
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
