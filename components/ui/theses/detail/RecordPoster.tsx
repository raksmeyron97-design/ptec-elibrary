/* eslint-disable @typescript-eslint/no-explicit-any */

// The Modernist record header: a poster on the accent, then a spec strip.
//
// This replaces <PublicationHero>, which put the cover and the record side by
// side in a rounded, shadowed card. The design leads with the record itself —
// "relevance first" — so the title runs at display size across a field of the
// accent, and every fact a reader scans for (author, advisor, program,
// faculty, year, usage) sits directly under it in one row of equal cells.
//
// The poster runs on --ptec-brand, the PTEC blue. (The design deck put a
// near-mono red here; the library keeps its own palette — see the Modernist
// layer note in app/globals.css.) Two things that field forces, both
// deliberate:
//
//   • Everything inside it is drawn in --ptec-brand-contrast, not in the page
//     ink. That includes the breadcrumb and the badge outlines. The page's
//     own text tokens are tuned for the light ground and vanish here.
//   • The cover keeps a light border rather than the divider token, for the
//     same reason: --ptec-divider is a pale grey that disappears on the brand.
//
// The one exception is the rank badge, which is drawn in the PTEC gold: gold
// on brand blue is the house pairing for a distinction, and it clears 5:1.
//
// The spec strip below it is NOT inside the accent field. It is the first row
// of the page grid, and its cells are separated by rules, not gaps.

import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { GraduationCap } from "lucide-react";
import { getDoi, getThesisTypeLabel } from "@/lib/theses/report-fields";

/** One cell of the spec strip. */
function Spec({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // Rules on two edges, and the row/column ends trimmed by the grid: a
    // right rule between cells, a bottom rule between rows.
    <div className="border-b border-r border-divider px-5 py-4 last:border-r-0 [&:nth-child(2n)]:border-r-0 lg:[&:nth-child(2n)]:border-r lg:[&:nth-child(3n)]:border-r-0 xl:border-b-0 xl:[&:nth-child(2n)]:border-r xl:[&:nth-child(3n)]:border-r xl:last:border-r-0">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">{label}</div>
      <div className="mt-1 text-[15px] font-semibold text-text-heading">{children}</div>
    </div>
  );
}

export default function RecordPoster({
  report,
  rank = null,
  breadcrumb,
  specs,
  lead,
  views,
  downloads,
  editHref,
}: {
  report: any;
  /** Global Top-N rank when this thesis is protected; null otherwise. */
  rank?: number | null;
  breadcrumb: { home: string; theses: string };
  /** Resolved display labels — the page already looks programs/faculties up. */
  specs: { program?: string | null; faculty?: string | null; language?: string | null };
  /**
   * The one-line précis under the title. There is no `summary` column on
   * research_reports, so the page resolves this from the SEO description
   * override when a librarian has written one, and otherwise from the first
   * sentence of the abstract — never both, and never the whole abstract,
   * which lives in the reading column a screen below.
   */
  lead?: string | null;
  views: number;
  downloads: number;
  /** Admin-only edit link, or null for everyone else. */
  editHref?: string | null;
}) {
  const doi = getDoi(report);
  const cohortLine = [
    report.cohort ? `Cohort ${report.cohort}` : null,
    report.academic_year,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      {/* ── Poster ───────────────────────────────────────────────────── */}
      <header className="bg-brand px-5 py-6 text-brand-contrast sm:px-8 sm:py-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav
            aria-label="Breadcrumb"
            className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-contrast/85"
          >
            <Link href="/" className="text-brand-contrast/85 transition-colors hover:text-brand-contrast">
              {breadcrumb.home}
            </Link>
            <span aria-hidden>/</span>
            <Link href="/theses" className="text-brand-contrast/85 transition-colors hover:text-brand-contrast">
              {breadcrumb.theses}
            </Link>
            {cohortLine && (
              <>
                <span aria-hidden>/</span>
                <span>{cohortLine}</span>
              </>
            )}
          </nav>
          {editHref && (
            <a
              href={editHref}
              className="inline-flex h-[26px] items-center border border-brand-contrast/60 px-2.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-brand-contrast transition-colors hover:bg-brand-contrast/15"
            >
              Edit thesis
            </a>
          )}
        </div>

        <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-end">
          <div className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex h-[22px] items-center bg-brand-contrast px-2.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-text-heading">
                {getThesisTypeLabel(report)}
              </span>
              {rank != null && (
                <span
                  className="inline-flex h-[22px] items-center border border-accent px-2.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-accent"
                  title={`Ranked #${rank} by downloads — protected Top 10 thesis`}
                >
                  <span className="sr-only">Ranked number {rank} most downloaded. </span>
                  Top 10 · #{rank} downloaded
                </span>
              )}
              {!report.verified_at && (
                <span className="inline-flex h-[22px] items-center border border-brand-contrast/60 px-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-brand-contrast/90">
                  Unverified record
                </span>
              )}
              {doi ? (
                <a
                  href={doi.startsWith("http") ? doi : `https://doi.org/${doi}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[11px] text-brand-contrast/85 underline-offset-4 transition-colors hover:text-brand-contrast hover:underline"
                >
                  DOI: {doi.replace(/^https?:\/\/doi\.org\//, "")}
                </a>
              ) : (
                <span className="font-mono text-[11px] text-brand-contrast/70">No DOI assigned</span>
              )}
            </div>

            {/* max-w in ch, not px: the deck caps the title at ~22 characters
                per line, and a Khmer title's characters are far wider than a
                Latin one's. A px cap would set the two scripts differently. */}
            <h1 className="max-w-[22ch] font-khmer-serif text-[clamp(28px,4.4vw,46px)] font-extrabold leading-[1.28] tracking-[-0.01em]">
              {report.title}
            </h1>
            {lead && (
              <p className="mt-3.5 max-w-[60ch] text-[15px] leading-[1.6] text-brand-contrast/92 sm:text-[16px]">
                {lead}
              </p>
            )}
          </div>

          <div className="w-full max-w-[300px]">
            <div className="relative aspect-[3/2] w-full border border-brand-contrast/70 bg-parchment">
              {report.cover_url ? (
                <Image
                  src={report.cover_url}
                  alt=""
                  fill
                  priority
                  sizes="300px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-text-muted">
                  <GraduationCap className="h-10 w-10" strokeWidth={1.5} aria-hidden />
                  <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">No cover scan</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Spec strip ───────────────────────────────────────────────── */}
      {/* Two cells per row on a phone, as the mobile artboard sets it — one
          per row wastes a full band of screen on a two-word value. */}
      <div className="grid grid-cols-2 border-b-2 border-divider lg:grid-cols-3 xl:grid-cols-6">
        {report.author_names && (
          <Spec label="Author">
            <span className="font-khmer-serif">{report.author_names}</span>
          </Spec>
        )}
        {report.advisor_name && <Spec label="Advisor">{report.advisor_name}</Spec>}
        {specs.program && <Spec label="Program">{specs.program}</Spec>}
        {specs.faculty && <Spec label="Faculty">{specs.faculty}</Spec>}
        {(report.academic_year || specs.language) && (
          <Spec label={report.academic_year && specs.language ? "Year · Language" : report.academic_year ? "Year" : "Language"}>
            {[report.academic_year, specs.language].filter(Boolean).join(" · ")}
          </Spec>
        )}
        <Spec label="Usage">
          {views.toLocaleString()} views · <span className="text-brand">{downloads.toLocaleString()} downloads</span>
        </Spec>
      </div>
    </>
  );
}
