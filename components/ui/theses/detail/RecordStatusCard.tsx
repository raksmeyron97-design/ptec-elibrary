import { Link } from "@/i18n/navigation";
import { BadgeCheck, Download, Eye, ShieldQuestion } from "lucide-react";

// The sidebar's "Record status" card: how trustworthy this record is, and how
// much use it has had.
//
// It merges two things that used to be separate and both oversized — the
// verification warning (a full-width amber callout) and the usage figures (two
// large gradient stat tiles borrowed from the admin dashboard). Neither
// deserved that much of the page:
//
//   • Verification is important but not an ERROR. An unverified student thesis
//     is the normal state of a fresh deposit, not a fault in the record, so it
//     reads as an informational note with an action, not as an alarm.
//   • Views and downloads are context, not a headline. They are two numbers on
//     one line here rather than two tiles with icon plates and hover lifts.

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n || 0);
}

export default function RecordStatusCard({
  verifiedAt,
  publishedOn,
  views,
  downloads,
  reportTitle,
  heading = "Record status",
}: {
  verifiedAt?: string | null;
  publishedOn?: string | null;
  views: number;
  downloads: number;
  /** Used to pre-identify the record on the corrections form. */
  reportTitle: string;
  heading?: string;
}) {
  const verified = Boolean(verifiedAt);

  return (
    <section
      aria-labelledby="record-status-heading"
      className="rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm"
    >
      <h2
        id="record-status-heading"
        className="text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted"
      >
        {heading}
      </h2>

      <div
        className={`mt-4 flex items-start gap-2.5 rounded-xl px-3.5 py-3 ${
          verified
            ? "bg-success-soft text-success-text"
            : "bg-warning-soft text-warning-text"
        }`}
      >
        {verified ? (
          <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        ) : (
          <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">
            {verified ? "Verified by library staff" : "Not yet verified"}
          </p>
          <p className="mt-1 text-[12.5px] leading-[1.6] opacity-90">
            {verified
              ? "A librarian has checked this record's details against the deposited document."
              : "Please double-check the author, year and publisher before citing this record."}
          </p>
        </div>
      </div>

      <dl className="mt-4 divide-y divide-divider text-[13px]">
        {publishedOn && (
          <div className="flex items-baseline justify-between gap-3 py-2.5">
            <dt className="text-text-muted">Published</dt>
            <dd className="font-medium text-text-heading">{publishedOn}</dd>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-3 py-2.5">
          <dt className="inline-flex items-center gap-1.5 text-text-muted">
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            Views
          </dt>
          <dd className="font-medium tabular-nums text-text-heading">{formatCount(views)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 py-2.5">
          <dt className="inline-flex items-center gap-1.5 text-text-muted">
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Downloads
          </dt>
          <dd className="font-medium tabular-nums text-text-heading">{formatCount(downloads)}</dd>
        </div>
      </dl>

      {/* The corrections route is the action that belongs with a verification
          state, so it lives here rather than buried under the citation box
          where it used to sit. Subject is clamped to the contact form's max. */}
      <Link
        href={{
          pathname: "/contact",
          query: {
            subject: `Incorrect record details: ${reportTitle}`.slice(0, 200),
            category: "other",
          },
        }}
        className="mt-3 inline-block rounded-sm text-[12.5px] font-semibold text-brand underline decoration-brand/30 underline-offset-4 transition-colors hover:decoration-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
      >
        Report incorrect details
      </Link>
    </section>
  );
}
