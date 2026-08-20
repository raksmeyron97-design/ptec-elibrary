/* eslint-disable @typescript-eslint/no-explicit-any */

// The record header.
//
// Everything a reader needs in the first five seconds — what this is, what it
// is called, who wrote it, and how to open it — and deliberately nothing else.
// The problem it solves is that the previous header put a breadcrumb, four
// badges, a display title, a description, a cover AND a full metadata strip in
// one block, so nothing in it was dominant. Here:
//
//   • The TITLE is the only display-size element on the page. Nothing else
//     competes with it, and its measure is capped so a long Khmer title breaks
//     into readable lines instead of running the full column width.
//   • The byline carries only the three facts that identify a thesis socially
//     — author, advisor, cohort/year. Everything else moved down into
//     <ThesisMetadata>, which is built to be scanned rather than read.
//   • Actions are two tiers, not six equals. Preview and Download are solid
//     and side by side; bookmark/share/copy/cite are quiet text buttons on the
//     line below.
//
// Responsive order is set with `order-*` rather than by duplicating markup, so
// there is exactly one H1 in the DOM at every breakpoint. Mobile runs
// badges → title → description → cover → actions (the cover earns its place
// above the fold on a phone because it is how a reader recognises a record
// they have seen in a list); desktop puts the cover in a right-hand column.

import Image from "next/image";
import { GraduationCap } from "lucide-react";
import ThesisBadges from "./ThesisBadges";

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-[15px] font-semibold text-text-heading">{value}</dd>
    </div>
  );
}

export default function ThesisHero({
  report,
  typeLabel,
  rank = null,
  lead,
  cohortLine,
  primaryActions,
  secondaryActions,
}: {
  report: any;
  typeLabel: string;
  rank?: number | null;
  /** One-sentence précis; never the whole abstract. */
  lead?: string | null;
  /** e.g. "Cohort 12 · 2021–2025" — omitted when the record has neither. */
  cohortLine?: string | null;
  primaryActions: React.ReactNode;
  secondaryActions: React.ReactNode;
}) {
  return (
    <header className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-12">
      <div className="flex min-w-0 flex-col">
        <div className="order-1">
          <ThesisBadges
            typeLabel={typeLabel}
            rank={rank}
            verifiedAt={report.verified_at}
            doi={report.doi ?? null}
          />
        </div>

        {/* The measure is capped in `ch` rather than px because a Khmer
            character is far wider than a Latin one — a px cap would set the
            two scripts to different line lengths. `text-balance` keeps the
            last line from stranding a single word. */}
        <h1 className="order-2 mt-5 max-w-[24ch] text-balance font-khmer-serif text-[clamp(28px,3.2vw,48px)] font-bold leading-[1.22] tracking-[-0.01em] text-text-heading">
          {report.title}
        </h1>

        {lead && (
          <p className="order-3 mt-4 max-w-[62ch] text-[15px] leading-[1.65] text-text-body sm:text-[16px]">
            {lead}
          </p>
        )}

        {/* Cover, on mobile only — see the note at the top of this file. */}
        <div className="order-4 mt-7 lg:hidden">
          <ThesisCover report={report} className="max-w-[220px]" />
        </div>

        <dl className="order-5 mt-7 grid grid-cols-1 gap-x-8 gap-y-4 border-t border-divider pt-6 sm:grid-cols-3">
          {report.author_names && (
            <Fact label="Author" value={<span className="font-khmer-serif">{report.author_names}</span>} />
          )}
          {report.advisor_name && <Fact label="Advisor" value={report.advisor_name} />}
          {cohortLine && <Fact label="Cohort" value={cohortLine} />}
        </dl>

        <div className="order-6 mt-7 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">{primaryActions}</div>
          <div className="flex flex-wrap items-center gap-1">{secondaryActions}</div>
        </div>
      </div>

      {/* Cover, desktop. Hidden from assistive tech rather than duplicated in
          the accessibility tree: the mobile copy above already carries the
          alternative text, and only one of the two is ever visible. */}
      <div className="hidden lg:block" aria-hidden="true">
        <ThesisCover report={report} />
      </div>
    </header>
  );
}

function ThesisCover({ report, className = "" }: { report: any; className?: string }) {
  return (
    <div
      className={`group relative aspect-[3/4] w-full overflow-hidden rounded-2xl border border-divider bg-paper shadow-md ${className}`}
    >
      {report.cover_url ? (
        <Image
          src={report.cover_url}
          alt={`Cover of ${report.title}`}
          fill
          priority
          // The cover is the page's LCP candidate on mobile. Two sizes, not a
          // single number: at ≥1024px it is the fixed 300px rail, below that
          // it is capped at 220px by the wrapper.
          sizes="(min-width: 1024px) 300px, 220px"
          className="object-cover transition-transform duration-200 ease-out group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-text-muted">
          <GraduationCap className="h-10 w-10" strokeWidth={1.5} aria-hidden="true" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em]">No cover</span>
        </div>
      )}
    </div>
  );
}
