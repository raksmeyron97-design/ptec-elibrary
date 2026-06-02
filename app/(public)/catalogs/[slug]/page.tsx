// app/catalogs/[slug]/page.tsx
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
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

// ── Copy status display maps ───────────────────────────────────────────────────
const COPY_STATUS_LABEL: Record<string, string> = {
  available:   "Available",
  checked_out: "Checked Out",
  lost:        "Lost",
  damaged:     "Damaged",
  on_order:    "On Order",
};

const COPY_STATUS_COLOR: Record<string, string> = {
  available:   "text-emerald-700",
  checked_out: "text-amber-600",
  lost:        "text-red-500",
  damaged:     "text-orange-500",
  on_order:    "text-info",
};

const COPY_STATUS_BADGE: Record<string, string> = {
  available:   "bg-emerald-50 border-emerald-200 text-emerald-700",
  checked_out: "bg-amber-50 border-amber-200 text-amber-700",
  lost:        "bg-red-50 border-red-200 text-red-600",
  damaged:     "bg-orange-50 border-orange-200 text-orange-600",
  on_order:    "bg-brand/5 border-divider text-brand",
};

const COPY_STATUS_DOT: Record<string, string> = {
  available:   "bg-emerald-500",
  checked_out: "bg-amber-400",
  lost:        "bg-red-400",
  damaged:     "bg-orange-400",
  on_order:    "bg-info",
};

export default async function CatalogBookPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createServiceClient();

  // Fetch book first
  const { data: book, error } = await supabase
    .from("catalog_books")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (!book || error) notFound();

  const b = book as CatalogBook;

  // Fetch individual copies for this book
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

  // Available first, then the rest
  const sortedCopies = [
    ...copies.filter((c) => c.status === "available"),
    ...copies.filter((c) => c.status !== "available"),
  ];

  const stockPct = b.copies_total > 0
    ? Math.round((b.copies_available / b.copies_total) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-paper">

      {/* Breadcrumb */}
      <div className="border-b border-divider bg-bg-surface px-4 py-3 md:px-12">
        <div className="mx-auto flex max-w-[1100px] items-center gap-2 text-sm text-text-muted">
          <Link href="/home" className="transition hover:text-brand">Home</Link>
          <span className="text-divider">›</span>
          <Link href="/catalogs" className="transition hover:text-brand">Books In Library</Link>
          <span className="text-divider">›</span>
          <span className="max-w-[200px] truncate font-medium text-text-heading">{b.title}</span>
        </div>
      </div>

      {/* Main */}
      <div className="mx-auto max-w-[1100px] px-4 py-10 md:px-12">
        <div className="grid gap-8 md:grid-cols-[280px_1fr]">

          {/* ── Left column: Cover + status ── */}
          <div className="flex flex-col items-center gap-4">

            {/* Cover */}
            <div className="relative aspect-[3/4] w-full max-w-[280px] overflow-hidden rounded-2xl border border-divider/50 shadow-lg shadow-brand/10">
              {b.cover_url ? (
                <Image src={b.cover_url} alt={b.title} fill className="object-cover" />
              ) : (
                <div className={`absolute inset-0 ${b.cover_color} flex items-end p-5`}>
                  <div>
                    <p className="mb-1 text-xs font-bold uppercase tracking-widest text-white/60">{b.category}</p>
                    <p className="font-khmer-serif text-lg font-bold leading-tight text-white">{b.title}</p>
                    <p className="mt-1 text-sm text-white/70">{b.author}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Availability summary card */}
            <div className={`w-full max-w-[280px] rounded-xl border border-t-[3px] border-t-accent p-4 ${statusBg}`}>
              <div className="mb-2 flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${statusDot}`} />
                <span className={`text-sm font-bold ${statusTxt}`}>{AVAILABILITY_LABEL[status]}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-muted">Available</span>
                <span className={`font-bold ${statusTxt}`}>{b.copies_available} / {b.copies_total} copies</span>
              </div>
              {b.shelf_location && (
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-bg-surface/70 px-3 py-2">
                  <svg className="h-4 w-4 shrink-0 text-gold-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                  </svg>
                  <span className="text-xs text-text-body">
                    Shelf: <span className="font-mono font-bold text-text-heading">{b.shelf_location}</span>
                  </span>
                </div>
              )}
            </div>

            {/* Contact CTA */}
            <Link
              href="/contact"
              className="flex w-full max-w-[280px] items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-contrast shadow-sm transition hover:bg-brand-hover"
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              Contact Us
            </Link>
          </div>

          {/* ── Right column: Details ── */}
          <div className="space-y-6">

            {/* Title / Author */}
            <div>
              {b.category && (
                <span className="mb-3 inline-block rounded-full bg-brand/5 px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand">
                  {b.category}
                </span>
              )}
              <h1 className="font-khmer-serif text-2xl font-bold leading-tight text-text-heading md:text-3xl">{b.title}</h1>
              <p className="mt-1.5 text-base font-medium text-text-muted">{b.author}</p>
            </div>

            {/* Description */}
            {b.description && (
              <div className="rounded-xl border border-divider bg-bg-surface p-5 shadow-sm">
                <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-gold-700">Description</h2>
                <p className="text-sm leading-relaxed text-text-body">{b.description}</p>
              </div>
            )}

            {/* Metadata grid */}
            <div className="rounded-xl border border-divider bg-bg-surface p-5 shadow-sm">
              <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-gold-700">Book Details</h2>
              <dl className="grid grid-cols-2 gap-x-8 gap-y-3.5 text-sm">
                {[
                  { label: "Author",         value: b.author },
                  { label: "Language",       value: b.language === "km" ? "Khmer" : b.language === "en" ? "English" : b.language },
                  { label: "Year",           value: b.year },
                  { label: "ISBN",           value: b.isbn },
                  { label: "Department",     value: b.department },
                  { label: "Accession No.",  value: b.accession_number },
                  { label: "Shelf Location", value: b.shelf_location },
                  { label: "Total Copies",   value: b.copies_total },
                ].map(({ label, value }) =>
                  value ? (
                    <div key={label}>
                      <dt className="text-xs font-medium text-text-muted">{label}</dt>
                      <dd className="mt-0.5 font-semibold text-text-heading">{value}</dd>
                    </div>
                  ) : null
                )}
              </dl>
            </div>

            {/* ── Physical Copies ── */}
            <div className="rounded-xl border border-divider bg-bg-surface p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-widest text-gold-700">
                  Physical Copies
                  {copies.length > 0 && (
                    <span className="ml-2 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand">
                      {copies.length}
                    </span>
                  )}
                </h2>
                {copies.length > 0 && (
                  <span className={`flex items-center gap-1.5 text-xs font-semibold ${COPY_STATUS_COLOR["available"]}`}>
                    <span className={`h-2 w-2 rounded-full ${COPY_STATUS_DOT["available"]}`} />
                    {b.copies_available} available
                  </span>
                )}
              </div>

              {copies.length === 0 ? (
                <p className="text-sm text-text-muted">No individual copy records available.</p>
              ) : (
                <>
                  {/* Stock health bar */}
                  <div className="mb-5">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs text-text-muted">Stock Health</span>
                      <span className="text-xs font-semibold text-text-body">{stockPct}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-paper">
                      <div
                        className="h-full rounded-full bg-brand transition-all duration-500"
                        style={{ width: `${stockPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Copy cards */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {sortedCopies.map((copy) => (
                      <div
                        key={copy.id}
                        className={`relative rounded-xl border p-4 ${COPY_STATUS_BADGE[copy.status]?.split(" ").slice(0, 2).join(" ") ?? "bg-paper border-divider"}`}
                      >
                        {/* Status badge */}
                        <span className={`absolute right-3 top-3 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${COPY_STATUS_BADGE[copy.status] ?? "bg-paper border-divider text-text-muted"}`}>
                          {COPY_STATUS_LABEL[copy.status] ?? copy.status}
                        </span>

                        <div className="space-y-2.5 pr-24">
                          {/* Barcode */}
                          <div>
                            <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Barcode</p>
                            <p className={`mt-0.5 font-mono text-sm font-bold ${COPY_STATUS_COLOR[copy.status] ?? "text-text-heading"}`}>
                              {copy.barcode ?? <span className="font-normal text-text-muted">—</span>}
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            {/* Holding Library */}
                            <div>
                              <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Holding Library</p>
                              <p className="mt-0.5 text-xs font-semibold text-text-heading">{copy.holding_library}</p>
                            </div>

                            {/* Shelf Location — per-copy if set, else fall back to book */}
                            <div>
                              <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Shelf Location</p>
                              <p className="mt-0.5 font-mono text-xs font-semibold text-text-heading">
                                {copy.shelf_location ?? b.shelf_location ?? "—"}
                              </p>
                            </div>
                          </div>

                          {/* Call Number */}
                          {copy.call_number && (
                            <div>
                              <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Call Number</p>
                              <p className="mt-0.5 font-mono text-xs font-semibold text-text-body">{copy.call_number}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Back link */}
            <Link href="/catalogs" className="inline-flex items-center gap-2 text-sm font-semibold text-brand transition hover:text-brand-hover">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M19 12H5m0 0 7 7m-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Back to catalogue
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}