import type { ReactNode } from "react";
import {
  Building2,
  CalendarDays,
  GraduationCap,
  Languages,
  Layers,
  User,
  UserCheck,
} from "lucide-react";

// The at-a-glance metadata card that sits directly under the hero.
//
// It replaced a single full-width strip of six cells, which forced every value
// onto one line and turned long ones ("Bachelor of Education (12+4)") into
// two-line cells that broke the row's rhythm. This is a real grid: four
// columns on desktop, two on tablet, one on phones, with each field as a small
// labelled block rather than a table cell.
//
// ── Why this is not the same thing as <PublicationMetadata> ──
// It deliberately is not. This card carries the eight fields a reader scans to
// decide whether the record is the one they want. <PublicationMetadata>, down
// in the reading column, carries the CATALOGUING record — DOI, submitted and
// defended dates, licence, thesis type — the fields you consult once you have
// already decided. Splitting them that way is what keeps the page from
// printing the same eight facts twice, which the old layout did.
//
// A field with no value is not rendered at all rather than shown with an
// em-dash: an empty row still costs a reader a fixation to skip.

type Field = { icon: ReactNode; label: string; value: ReactNode | null | undefined };

function MetaItem({ icon, label, value }: Field) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">
        <span aria-hidden="true" className="text-text-muted/70">
          {icon}
        </span>
        {label}
      </div>
      <p className="mt-1 break-words text-[14px] font-medium leading-[1.5] text-text-heading">
        {value}
      </p>
    </div>
  );
}

export default function ThesisMetadata({
  authorNames,
  advisor,
  coAdvisor,
  program,
  faculty,
  department,
  academicYear,
  language,
  publishedOn,
  heading = "Thesis information",
}: {
  authorNames?: string | null;
  advisor?: string | null;
  coAdvisor?: string | null;
  program?: string | null;
  faculty?: string | null;
  department?: string | null;
  academicYear?: string | null;
  language?: string | null;
  publishedOn?: string | null;
  heading?: string;
}) {
  const fields: Field[] = [
    {
      icon: <User className="h-3.5 w-3.5" />,
      label: "Author",
      value: authorNames ? <span className="font-khmer-serif">{authorNames}</span> : null,
    },
    { icon: <UserCheck className="h-3.5 w-3.5" />, label: "Advisor", value: advisor },
    { icon: <UserCheck className="h-3.5 w-3.5" />, label: "Co-advisor", value: coAdvisor },
    { icon: <GraduationCap className="h-3.5 w-3.5" />, label: "Program", value: program },
    { icon: <Layers className="h-3.5 w-3.5" />, label: "Faculty", value: faculty },
    { icon: <Building2 className="h-3.5 w-3.5" />, label: "Department", value: department },
    { icon: <CalendarDays className="h-3.5 w-3.5" />, label: "Academic year", value: academicYear },
    { icon: <Languages className="h-3.5 w-3.5" />, label: "Language", value: language },
    { icon: <CalendarDays className="h-3.5 w-3.5" />, label: "Published", value: publishedOn },
  ].filter((f) => f.value != null && f.value !== "");

  if (fields.length === 0) return null;

  return (
    <section
      aria-labelledby="thesis-information-heading"
      className="rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm sm:p-6"
    >
      <h2
        id="thesis-information-heading"
        className="text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted"
      >
        {heading}
      </h2>
      <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
        {fields.map((f) => (
          <MetaItem key={f.label} {...f} />
        ))}
      </div>
    </section>
  );
}
