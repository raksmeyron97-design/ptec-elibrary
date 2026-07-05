/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Single source of truth for reading "extended" thesis fields.
 *
 * The detail/listing components never touch raw column names directly — they go
 * through these accessors. If your Supabase columns are named differently,
 * change them HERE once and every page updates.
 *
 * Each accessor is defensive: it accepts arrays OR delimited strings and trims
 * empties, so it works whether `keywords` is `text[]`, a comma list, or null.
 */


export type ResearchReport = Record<string, any>;

const firstDefined = (...vals: any[]) =>
  vals.find((v) => v !== undefined && v !== null && v !== "");

/** Split a value that may be an array, or a string delimited by , ; | or newlines. */
function toList(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).map((s) => s.trim()).filter(Boolean);
  return String(value)
    .split(/\r?\n|[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getKeywords(report: ResearchReport): string[] {
  return toList(firstDefined(report.keywords, report.subjects, report.tags));
}

export function getReferences(report: ResearchReport): string[] {
  // References are often a longer text block — split on newlines only when it is
  // a string, but allow a real array too.
  const raw = firstDefined(report.references, report.bibliography, report.citations);
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).map((s) => s.trim()).filter(Boolean);
  return String(raw)
    .split(/\r?\n+/)
    .map((s) => s.replace(/^\s*\[?\d+\]?[.)]?\s*/, "").trim()) // strip leading "1." / "[1]"
    .filter(Boolean);
}

export function getDoi(report: ResearchReport): string | null {
  return (firstDefined(report.doi, report.doi_id, report.identifier) as string) ?? null;
}

export function getDepartment(report: ResearchReport): string | null {
  // We used to resolve the faculty code to a label synchronously here, but
  // faculties are now DB-driven. Components that need the exact faculty label
  // should fetch it or receive it from the server. We just fall back to the
  // raw string code here if no department is specified.

  return (
    (firstDefined(
      report.department,
      report.department_name,
      report.departments?.name, // Added for Supabase join: select("*, departments(name)")
      report.faculty_name,
      report.faculty,
    ) as string) ?? null
  );
}

export function getPublicationDate(report: ResearchReport): string | null {
  return (
    (firstDefined(
      report.published_at,
      report.publication_date,
      report.published_date,
      report.created_at,
    ) as string) ?? null
  );
}

/** Best-effort 4-digit year from the publication date, falling back to academic_year. */
export function getYear(report: ResearchReport): string | null {
  const d = getPublicationDate(report);
  if (d) {
    const m = String(d).match(/(19|20)\d{2}/);
    if (m) return m[0];
  }
  if (report.academic_year) {
    const m = String(report.academic_year).match(/(19|20)\d{2}/g);
    if (m) return m[m.length - 1]; // end year of "2023-2024"
  }
  return null;
}

/** Human date like "12 June 2026"; returns null on unparseable input. */
export function formatPublicationDate(report: ResearchReport): string | null {
  const d = getPublicationDate(report);
  if (!d) return null;
  const date = new Date(d);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** A short "source" line, ACS-style: "Cohort 12 · 2023–2024 · Faculty of Science". */
export function getSourceLine(report: ResearchReport): string {
  const parts = [
    report.cohort ? `Cohort ${report.cohort}` : null,
    report.academic_year || null,
    getDepartment(report),
  ].filter(Boolean);
  return parts.join("  ·  ");
}
