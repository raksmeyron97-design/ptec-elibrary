import type { ReactNode } from "react";
import { User, UserCheck, GraduationCap, Building2, Layers, CalendarDays, Hash, Languages, FileCheck2 } from "lucide-react";
import {
  getDepartment,
  formatPublicationDate,
  getDoi,
  getLanguageLabel,
  getCoAdvisor,
  getDefenseDate,
  getSubmittedDate,
  type ResearchReport,
} from "@/lib/theses/report-fields";
import { getThesisPrograms, getThesisFaculties } from "@/app/actions/theses";

function Row({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/8 text-brand">
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-[11px] font-bold uppercase tracking-wider text-text-muted">{label}</dt>
        <dd className="mt-0.5 text-[13.5px] font-medium text-text-heading break-words">{value}</dd>
      </div>
    </div>
  );
}

/**
 * A conditional metadata grid — every row only renders when the underlying
 * data exists. Theses have no ISBN/page-count columns (those belong to the
 * books table); language/thesis-type/co-advisor/defense+submitted dates
 * exist since migration 0076 and render only for rows that set them —
 * legacy theses uploaded before that migration just skip these rows.
 */
export default async function PublicationMetadata({ report }: { report: ResearchReport }) {
  const publishedOn = formatPublicationDate(report);
  const doi = getDoi(report);
  const language = getLanguageLabel(report);
  const coAdvisor = getCoAdvisor(report);
  const defendedOn = getDefenseDate(report);
  const submittedOn = getSubmittedDate(report);
  const { data: programs } = await getThesisPrograms();
  const { data: faculties } = await getThesisFaculties();
  const program = programs?.find((p) => p.code === report.program);
  const faculty = faculties?.find((f) => f.program_code === report.program && f.code === report.faculty);

  // getDepartment() falls back to the resolved faculty label when there's no
  // distinct department record — skip the row entirely rather than repeating
  // the Faculty row's value under a different heading.
  const department = getDepartment(report);
  const showDepartment = department && department !== faculty?.name_en;

  return (
    <div className="gradient-top-border overflow-hidden rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm sm:p-5">
      <h3 className="mb-1 text-[13px] font-bold uppercase tracking-wider text-text-heading">
        Publication Details
      </h3>
      <dl className="divide-y divide-divider/60">
        {report.author_names && <Row icon={<User className="h-4 w-4" />} label="Author(s)" value={report.author_names} />}
        {report.advisor_name && <Row icon={<UserCheck className="h-4 w-4" />} label="Advisor" value={report.advisor_name} />}
        {coAdvisor && <Row icon={<UserCheck className="h-4 w-4" />} label="Co-Advisor" value={coAdvisor} />}
        {program && <Row icon={<GraduationCap className="h-4 w-4" />} label="Program" value={program.name_en} />}
        {faculty && <Row icon={<Layers className="h-4 w-4" />} label="Faculty" value={faculty.name_en} />}
        {showDepartment && <Row icon={<Building2 className="h-4 w-4" />} label="Department" value={department} />}
        {report.academic_year && <Row icon={<CalendarDays className="h-4 w-4" />} label="Academic Year" value={report.academic_year} />}
        {language && <Row icon={<Languages className="h-4 w-4" />} label="Language" value={language} />}
        {publishedOn && <Row icon={<CalendarDays className="h-4 w-4" />} label="Published" value={publishedOn} />}
        {submittedOn && <Row icon={<FileCheck2 className="h-4 w-4" />} label="Submitted" value={submittedOn} />}
        {defendedOn && <Row icon={<FileCheck2 className="h-4 w-4" />} label="Defended" value={defendedOn} />}
        {doi && (
          <Row
            icon={<Hash className="h-4 w-4" />}
            label="DOI"
            value={
              <a
                href={doi.startsWith("http") ? doi : `https://doi.org/${doi}`}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all font-mono text-brand transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 rounded-sm"
              >
                {doi.replace(/^https?:\/\/doi\.org\//, "")}
              </a>
            }
          />
        )}
      </dl>
    </div>
  );
}
