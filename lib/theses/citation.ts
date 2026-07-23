import {
  getDoi,
  getYear,
  getDepartment,
  getKeywords,
  getThesisTypeLabel,
  type ResearchReport,
} from "./report-fields";
import {
  apa,
  bibtex,
  ris,
  citationFileName,
  type CitationWork,
} from "@/lib/citations";

/**
 * Repository base URL for citation links. The institution NAME is no longer
 * here: it is a published setting, passed in as `institution` by the caller
 * (`(await getOrgIdentity()).institutionName`). A constant here meant every
 * exported APA/MLA/BibTeX citation kept naming the old institution after the
 * admin panel had already been updated.
 */
export const REPOSITORY = {
  // Falls back to the runtime origin when NEXT_PUBLIC_SITE_URL is unset.
  baseUrl: "https://library.ptec.edu.kh",
};

export type CiteFormat = "apa" | "mla" | "chicago" | "ieee" | "bibtex" | "ris";

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

/** Normalise a thesis row into the neutral CitationWork shape. The APA/BibTeX
 *  "type" comes from the real thesis_type column ("Thesis", "Research Report",
 *  "Capstone Project", …) instead of a hardcoded label. */
export function thesisToCitationWork(report: ResearchReport, reportId: string, institution: string): CitationWork {
  const authors = safeAuthors(report)
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);
  return {
    kind: "thesis",
    title: (report.title || "").toString().trim(),
    authors,
    year: getYear(report),
    publisher: institution,
    department: getDepartment(report),
    number: report.cohort ? `Cohort ${report.cohort}` : null,
    noteType: getThesisTypeLabel(report),
    doi: getDoi(report),
    abstract: (report.abstract || "").toString() || null,
    keywords: getKeywords(report),
    url: reportUrl(reportId),
  };
}

export function toAPA(report: ResearchReport, reportId: string, institution: string): string {
  return apa(thesisToCitationWork(report, reportId, institution));
}

export function toMLA(report: ResearchReport, reportId: string, institution: string): string {
  const authors = safeAuthors(report);
  const year = getYear(report) || "n.d.";
  const title = (report.title || "").toString().trim();
  const link = doiOrUrl(report, reportId);
  return `${authors}. "${title}." ${institution}, ${year}, ${link}.`;
}

export function toChicago(report: ResearchReport, reportId: string, institution: string): string {
  const authors = safeAuthors(report);
  const year = getYear(report) || "n.d.";
  const title = (report.title || "").toString().trim();
  const link = doiOrUrl(report, reportId);
  return `${authors}. ${year}. "${title}." ${institution}. ${link}.`;
}

export function toIEEE(report: ResearchReport, reportId: string, institution: string): string {
  const authors = safeAuthors(report);
  const year = getYear(report) || "n.d.";
  const title = (report.title || "").toString().trim();
  const link = doiOrUrl(report, reportId);
  return `${authors}, "${title}," ${institution}, ${year}. [Online]. Available: ${link}`;
}

export function toBibTeX(report: ResearchReport, reportId: string, institution: string): string {
  return bibtex(thesisToCitationWork(report, reportId, institution));
}

export function toRIS(report: ResearchReport, reportId: string, institution: string): string {
  return ris(thesisToCitationWork(report, reportId, institution));
}

export function buildCitation(
  format: CiteFormat,
  report: ResearchReport,
  reportId: string,
  /** Published institution name — `(await getOrgIdentity()).institutionName`. */
  institution: string,
): string {
  if (format === "mla") return toMLA(report, reportId, institution);
  if (format === "chicago") return toChicago(report, reportId, institution);
  if (format === "ieee") return toIEEE(report, reportId, institution);
  if (format === "bibtex") return toBibTeX(report, reportId, institution);
  if (format === "ris") return toRIS(report, reportId, institution);
  return toAPA(report, reportId, institution);
}

/** Filename + mime for downloading a citation file. */
export function citationFile(format: CiteFormat, report: ResearchReport): { name: string; mime: string } {
  // Neither the URL nor the institution plays a part in the filename.
  return citationFileName(format, thesisToCitationWork(report, report.slug ?? report.id ?? "", ""));
}
