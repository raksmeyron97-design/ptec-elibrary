import type { ReactNode } from "react";
import {
  formatPublicationDate,
  getDoi,
  getLanguageLabel,
  getDefenseDate,
  getSubmittedDate,
  getThesisTypeLabel,
  type ResearchReport,
} from "@/lib/theses/report-fields";

// Publication details — the CATALOGUING record.
//
// ── Why this no longer repeats the metadata card ──
// It used to list author, advisor, program, faculty, department, academic
// year, language and published date. <ThesisMetadata>, directly under the
// hero, now lists exactly those, so the page printed the same eight facts
// twice — once as a strip and once as a table — and a reader scrolling for
// something new found the same thing again.
//
// Cohort is not here either, for the same reason: the hero byline already
// carries "Cohort 3 · 2021–2025" at the top of the page.
//
// The split is by WHEN you need a field. The card up top carries what you scan
// to decide whether this is the record you want. This section carries what you
// consult once you have decided: the identifiers, the lifecycle dates and the
// licence. Language and published date are repeated deliberately and are the
// only two that are — a citation needs both, and this is the section a reader
// is looking at when they build one.
//
// No card wrapper: this renders inside the content card, and a bordered box
// inside a bordered box is exactly the nesting this redesign removes.
//
// Every row is conditional. A thesis deposited before migration 0076 has no
// defence or submission date, and a row reading "Defended —" is worse than no
// row: it is a fixation spent on nothing.

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    // dt/dd must be DIRECT children of a <div> that is itself a direct child of
    // the <dl> (axe: definition-list / dlitem), which is why the label/value
    // pair is a grid rather than nested wrappers. The label column is fixed at
    // 180px on desktop and stacks below `sm`, where 180px of label against a
    // 320px viewport would leave nothing for the value.
    <div className="grid grid-cols-1 gap-x-6 border-b border-divider py-3 last:border-b-0 sm:grid-cols-[180px_minmax(0,1fr)]">
      <dt className="text-[12px] font-semibold uppercase tracking-[0.08em] text-text-muted">
        {label}
      </dt>
      <dd className="mt-1 break-words text-[14px] text-text-heading sm:mt-0">{value}</dd>
    </div>
  );
}

export default function PublicationMetadata({ report }: { report: ResearchReport }) {
  const publishedOn = formatPublicationDate(report);
  const doi = getDoi(report);
  const language = getLanguageLabel(report);
  const defendedOn = getDefenseDate(report);
  const submittedOn = getSubmittedDate(report);
  const typeLabel = getThesisTypeLabel(report);
  // "unknown" / "none" are the placeholders the importer writes when a deposit
  // arrives without a licence. Printing one as if it were a licence is worse
  // than printing nothing: a reader deciding whether they may reuse the work
  // reads "unknown" as a stated answer rather than as a missing field.
  const rawLicence = (report.license ?? "").trim();
  const licence = /^(unknown|none|n\/a|-{1,2})$/i.test(rawLicence) ? null : rawLicence || null;

  const rows: Array<{ label: string; value: ReactNode } | null> = [
    typeLabel ? { label: "Record type", value: typeLabel } : null,
    language ? { label: "Language", value: language } : null,
    submittedOn ? { label: "Submitted", value: submittedOn } : null,
    defendedOn ? { label: "Defended", value: defendedOn } : null,
    publishedOn ? { label: "Published", value: publishedOn } : null,
    licence ? { label: "Licence", value: licence } : null,
    doi
      ? {
          label: "DOI",
          value: (
            <a
              href={doi.startsWith("http") ? doi : `https://doi.org/${doi}`}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all rounded-sm font-mono text-brand underline decoration-brand/30 underline-offset-2 transition-colors hover:decoration-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
            >
              {doi.replace(/^https?:\/\/doi\.org\//, "")}
            </a>
          ),
        }
      : null,
  ];
  const visible = rows.filter((r): r is { label: string; value: ReactNode } => r != null);

  if (visible.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-divider px-4 py-5 text-[13.5px] text-text-muted">
        No additional publication details have been recorded for this thesis.
      </p>
    );
  }

  return (
    <dl>
      {visible.map((r) => (
        <Row key={r.label} label={r.label} value={r.value} />
      ))}
    </dl>
  );
}
