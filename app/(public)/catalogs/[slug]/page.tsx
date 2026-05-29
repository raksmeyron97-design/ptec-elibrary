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

export const dynamic = "force-dynamic";

export default async function CatalogBookPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createServiceClient();

  const { data: book, error } = await supabase
    .from("catalog_books")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (!book || error) notFound();

  const b = book as CatalogBook;
  const status    = getAvailability(b);
  const statusBg  = AVAILABILITY_BG[status];
  const statusTxt = AVAILABILITY_COLOR[status];
  const statusDot = AVAILABILITY_DOT[status];

  return (
    <div className="min-h-screen bg-[#F5F6FA]">

      {/* Breadcrumb */}
      <div className="bg-white border-b border-slate-100 px-4 py-3 md:px-12">
        <div className="mx-auto max-w-[1100px] flex items-center gap-2 text-sm text-slate-500">
          <Link href="/home" className="hover:text-[#007c91] transition">Home</Link>
          <span>›</span>
          <Link href="/catalogs" className="hover:text-[#007c91] transition">Books In Library</Link>
          <span>›</span>
          <span className="text-slate-800 font-medium truncate max-w-[200px]">{b.title}</span>
        </div>
      </div>

      {/* Main */}
      <div className="mx-auto max-w-[1100px] px-4 py-8 md:px-12">
        <div className="grid gap-8 md:grid-cols-[280px_1fr]">

          {/* ── Cover ── */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-full max-w-[280px] aspect-[3/4] overflow-hidden rounded-2xl shadow-lg">
              {b.cover_url ? (
                <Image src={b.cover_url} alt={b.title} fill className="object-cover" />
              ) : (
                <div className={`absolute inset-0 ${b.cover_color} flex items-end p-5`}>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-white/60 mb-1">{b.category}</p>
                    <p className="text-lg font-bold text-white leading-tight">{b.title}</p>
                    <p className="text-sm text-white/70 mt-1">{b.author}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Availability badge */}
            <div className={`w-full max-w-[280px] rounded-xl border p-4 ${statusBg}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`h-2.5 w-2.5 rounded-full ${statusDot}`} />
                <span className={`text-sm font-bold ${statusTxt}`}>
                  {AVAILABILITY_LABEL[status]}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Available</span>
                <span className={`font-bold ${statusTxt}`}>
                  {b.copies_available} / {b.copies_total} copies
                </span>
              </div>
              {b.shelf_location && (
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-white/60 px-3 py-2">
                  <svg className="h-4 w-4 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                  </svg>
                  <span className="text-xs text-slate-600">
                    Shelf: <span className="font-mono font-bold text-slate-800">{b.shelf_location}</span>
                  </span>
                </div>
              )}
            </div>

            {/* Contact link */}
            <Link
              href="/contact"
              className="flex w-full max-w-[280px] items-center justify-center gap-2 rounded-xl bg-[#0a1629] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#007c91]"
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              Contact Us
            </Link>
          </div>

          {/* ── Details ── */}
          <div className="space-y-6">

            {/* Title / Author */}
            <div>
              {b.category && (
                <span className="inline-block rounded-full bg-[#0a1629]/8 px-3 py-1 text-xs font-bold text-[#0a1629] uppercase tracking-wider mb-3">
                  {b.category}
                </span>
              )}
              <h1 className="text-2xl md:text-3xl font-bold text-[#0a1629] leading-tight">{b.title}</h1>
              <p className="mt-1.5 text-base text-slate-500">{b.author}</p>
            </div>

            {/* Description */}
            {b.description && (
              <div className="rounded-xl bg-white border border-slate-100 p-5 shadow-sm">
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Description</h2>
                <p className="text-sm text-slate-700 leading-relaxed">{b.description}</p>
              </div>
            )}

            {/* Metadata grid */}
            <div className="rounded-xl bg-white border border-slate-100 p-5 shadow-sm">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">Book Details</h2>
              <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                {[
                  { label: "Author",             value: b.author },
                  { label: "Language",           value: b.language === "km" ? "Khmer" : b.language === "en" ? "English" : b.language },
                  { label: "Year",               value: b.year },
                  { label: "ISBN",               value: b.isbn },
                  { label: "Department",         value: b.department },
                  { label: "Accession No.",      value: b.accession_number },
                  { label: "Shelf Location",     value: b.shelf_location },
                  { label: "Total Copies",       value: b.copies_total },
                ].map(({ label, value }) =>
                  value ? (
                    <div key={label}>
                      <dt className="text-xs text-slate-400 font-medium">{label}</dt>
                      <dd className="text-slate-800 font-semibold mt-0.5">{value}</dd>
                    </div>
                  ) : null
                )}
              </dl>
            </div>

            {/* Back link */}
            <Link
              href="/catalogs"
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#007c91] hover:underline"
            >
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