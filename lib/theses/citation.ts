import { getDoi, getYear, getDepartment, type ResearchReport } from "./report-fields";

/**
 * ── EDIT ME ───────────────────────────────────────────────────────────────
 * The "publisher / institution" used in every citation. Change these to your
 * university / repository name once and all citation formats update.
 */
export const REPOSITORY = {
  name: "Phnom Penh Teacher Education College", // e.g. "Royal University of Phnom Penh — Research Repository"
  // Falls back to the runtime origin when NEXT_PUBLIC_SITE_URL is unset.
  baseUrl: "https://library.ptec.edu.kh",
};

export type CiteFormat = "apa" | "bibtex" | "ris";

/** Public-facing link to a report (used inside citations when there is no DOI). */
export function reportUrl(reportId: string): string {
  const base = REPOSITORY.baseUrl?.replace(/\/$/, "");
  return `${base}/theses/${reportId}`;
}

function doiOrUrl(report: ResearchReport, reportId: string): string {
  const doi = getDoi(report);
  if (doi) return doi.startsWith("http") ? doi : `https://doi.org/${doi}`;
  return reportUrl(reportId);
}

function safeAuthors(report: ResearchReport): string {
  return (report.author_names || "Unknown author").toString().trim();
}

/** A stable, lowercase BibTeX key: firstauthorword + year + firsttitleword. */
function bibKey(report: ResearchReport): string {
  const a = safeAuthors(report).split(/[\s,]+/)[0] || "report";
  const y = getYear(report) || "n.d.";
  const t = (report.title || "untitled").toString().split(/\s+/)[0] || "report";
  return `${a}${y}${t}`.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

export function toAPA(report: ResearchReport, reportId: string): string {
  const authors = safeAuthors(report);
  const year = getYear(report) || "n.d.";
  const title = (report.title || "").toString().trim();
  const link = doiOrUrl(report, reportId);
  // Author, A. (Year). Title [Research report]. Repository. link
  return `${authors} (${year}). ${title} [Research report]. ${REPOSITORY.name}. ${link}`;
}

export function toBibTeX(report: ResearchReport, reportId: string): string {
  const fields: Array<[string, string | null]> = [
    ["author", safeAuthors(report)],
    ["title", (report.title || "").toString().trim()],
    ["institution", REPOSITORY.name],
    ["year", getYear(report)],
    ["type", "Research report"],
    ["number", report.cohort ? `Cohort ${report.cohort}` : null],
    ["address", getDepartment(report)],
    ["url", reportUrl(reportId)],
    ["doi", getDoi(report)],
  ];
  const body = fields
    .filter(([, v]) => v)
    .map(([k, v]) => `  ${k} = {${String(v).replace(/[{}]/g, "")}}`)
    .join(",\n");
  return `@techreport{${bibKey(report)},\n${body}\n}`;
}

export function toRIS(report: ResearchReport, reportId: string): string {
  const lines: Array<[string, string | null]> = [
    ["TY", "RPRT"],
    ["TI", (report.title || "").toString().trim()],
    ["AU", safeAuthors(report)],
    ["PY", getYear(report)],
    ["PB", REPOSITORY.name],
    ["DP", getDepartment(report)],
    ["AB", (report.abstract || "").toString().replace(/\s+/g, " ").trim() || null],
    ["DO", getDoi(report)],
    ["UR", reportUrl(reportId)],
    ["ER", ""],
  ];
  return lines
    .filter(([tag, v]) => tag === "ER" || v)
    .map(([tag, v]) => `${tag}  - ${v ?? ""}`)
    .join("\n");
}

export function buildCitation(format: CiteFormat, report: ResearchReport, reportId: string): string {
  if (format === "bibtex") return toBibTeX(report, reportId);
  if (format === "ris") return toRIS(report, reportId);
  return toAPA(report, reportId);
}

/** Filename + mime for downloading a citation file. */
export function citationFile(format: CiteFormat, report: ResearchReport): { name: string; mime: string } {
  const slug = bibKey(report) || "citation";
  if (format === "bibtex") return { name: `${slug}.bib`, mime: "application/x-bibtex" };
  if (format === "ris") return { name: `${slug}.ris`, mime: "application/x-research-info-systems" };
  return { name: `${slug}.txt`, mime: "text/plain" };
}
