import { Award, BadgeCheck, FileText, Hash, ShieldQuestion } from "lucide-react";

// The record's status line, as four badges with four different jobs.
//
// They used to be a row of same-weight outlined boxes, which meant the type
// ("Thesis" — true of every record on this route, so almost no information)
// shouted exactly as loudly as the verification state (the one thing a reader
// citing this record actually needs to notice). The tiers below are ordered by
// how much each one should be able to interrupt:
//
//   1. Type       — quiet. Ink on a tint; it is a label, not news.
//   2. Rank       — the gold accent, and ONLY here. The design system reserves
//                   gold for genuine distinction, so a badge that appears on
//                   every record may never use it.
//   3. Verified   — success tint when a librarian has checked the record,
//                   warning tint when they have not.
//   4. DOI        — a link when one exists, and a muted fact when not, because
//                   "no DOI" is normal for a student thesis, not a fault.
//
// Every badge pairs an icon with a word. None of them encodes its meaning in
// colour alone (WCAG 1.4.1), so the set still reads in monochrome.

const BASE =
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em]";

export default function ThesisBadges({
  typeLabel,
  rank,
  verifiedAt,
  doi,
}: {
  typeLabel: string;
  /** Global download rank when this thesis is in the protected Top N. */
  rank?: number | null;
  verifiedAt?: string | null;
  doi?: string | null;
}) {
  const doiHref = doi ? (doi.startsWith("http") ? doi : `https://doi.org/${doi}`) : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`${BASE} bg-surface-brand-soft text-brand`}>
        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
        {typeLabel}
      </span>

      {rank != null && (
        <span
          className={`${BASE} bg-accent/15 text-accent-text`}
          title={`Ranked #${rank} by downloads`}
        >
          <Award className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="sr-only">Ranked number {rank} most downloaded. </span>
          Top 10 · #{rank}
        </span>
      )}

      {verifiedAt ? (
        <span className={`${BASE} bg-success-soft text-success-text`}>
          <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Verified
        </span>
      ) : (
        <span className={`${BASE} bg-warning-soft text-warning-text`}>
          <ShieldQuestion className="h-3.5 w-3.5" aria-hidden="true" />
          Unverified
        </span>
      )}

      {doiHref ? (
        <a
          href={doiHref}
          target="_blank"
          rel="noopener noreferrer"
          className={`${BASE} border border-divider text-text-muted normal-case tracking-normal transition-colors hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50`}
        >
          <Hash className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="font-mono font-medium">
            {doi!.replace(/^https?:\/\/doi\.org\//, "")}
          </span>
        </a>
      ) : (
        <span className={`${BASE} text-text-muted normal-case tracking-normal font-medium`}>
          <Hash className="h-3.5 w-3.5" aria-hidden="true" />
          No DOI assigned
        </span>
      )}
    </div>
  );
}
