// Pure citation builders for Publications (journal articles).
// Mirrors lib/theses/citation.ts but article-flavored: @article / TY JOUR,
// journal + volume/issue/pages, one author per RIS AU line.
// Browser-safe — no server-only imports.

import { SITE_URL } from "@/lib/seo/site";
import type { Publication } from "@/lib/publications";

export type CiteFormat = "apa" | "bibtex" | "ris";

/** Public-facing link to an article (used inside citations when there is no DOI). */
export function publicationUrl(slug: string): string {
  return `${SITE_URL}/publications/${slug}`;
}

function doiUrl(pub: Publication): string | null {
  if (!pub.doi) return null;
  return pub.doi.startsWith("http") ? pub.doi : `https://doi.org/${pub.doi}`;
}

function doiOrUrl(pub: Publication): string {
  return doiUrl(pub) ?? publicationUrl(pub.slug);
}

export function citationYear(pub: Publication): string | null {
  const raw = pub.publication_date ?? pub.published_at ?? pub.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : String(d.getFullYear());
}

/** ["Sok San", "Chan Dara"] from authorships or the comma-joined byline. */
export function authorList(pub: Publication): string[] {
  if (pub.authorships?.length) {
    return pub.authorships.map((a) => a.author.full_name).filter(Boolean);
  }
  if (pub.author_names) {
    return pub.author_names.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function pageRange(pub: Publication): string | null {
  if (pub.page_start && pub.page_end) return `${pub.page_start}–${pub.page_end}`;
  if (pub.page_start) return pub.page_start;
  if (pub.article_no) return pub.article_no;
  return null;
}

/** A stable, lowercase BibTeX key: firstauthorword + year + firsttitleword. */
function bibKey(pub: Publication): string {
  const a = (authorList(pub)[0] ?? "article").split(/\s+/)[0];
  const y = citationYear(pub) ?? "nd";
  const t = (pub.title || "untitled").split(/\s+/)[0];
  return `${a}${y}${t}`.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

/** The header line shown under the title: "Journal 2026, 12 (3), 101–118". */
export function toCitationLine(pub: Publication): string {
  const parts: string[] = [];
  const year = citationYear(pub);
  if (pub.journal_name) {
    parts.push(year ? `${pub.journal_name} ${year}` : pub.journal_name);
  } else if (year) {
    parts.push(year);
  }
  if (pub.volume) {
    parts.push(pub.issue_no ? `${pub.volume} (${pub.issue_no})` : pub.volume);
  }
  const pages = pageRange(pub);
  if (pages) parts.push(pages);
  return parts.join(", ");
}

export function toAPA(pub: Publication): string {
  const authors = authorList(pub).join(", ") || "Unknown author";
  const year = citationYear(pub) ?? "n.d.";
  const title = (pub.title || "").trim();
  const segments = [`${authors} (${year}). ${title}.`];
  if (pub.journal_name) {
    let venue = pub.journal_name;
    if (pub.volume) {
      venue += `, ${pub.volume}`;
      if (pub.issue_no) venue += `(${pub.issue_no})`;
    }
    const pages = pageRange(pub);
    if (pages) venue += `, ${pages}`;
    segments.push(`${venue}.`);
  }
  segments.push(doiOrUrl(pub));
  return segments.join(" ");
}

export function toBibTeX(pub: Publication): string {
  const fields: Array<[string, string | null]> = [
    ["author", authorList(pub).join(" and ") || "Unknown author"],
    ["title", (pub.title || "").trim()],
    ["journal", pub.journal_name],
    ["year", citationYear(pub)],
    ["volume", pub.volume],
    ["number", pub.issue_no],
    ["pages", pageRange(pub)],
    ["doi", pub.doi],
    ["url", publicationUrl(pub.slug)],
  ];
  const body = fields
    .filter(([, v]) => v)
    .map(([k, v]) => `  ${k} = {${String(v).replace(/[{}]/g, "")}}`)
    .join(",\n");
  return `@article{${bibKey(pub)},\n${body}\n}`;
}

export function toRIS(pub: Publication): string {
  const lines: Array<[string, string | null]> = [
    ["TY", "JOUR"],
    ["TI", (pub.title || "").trim()],
    ...authorList(pub).map((name): [string, string | null] => ["AU", name]),
    ["JO", pub.journal_name],
    ["PY", citationYear(pub)],
    ["VL", pub.volume],
    ["IS", pub.issue_no],
    ["SP", pub.page_start ?? pub.article_no],
    ["EP", pub.page_end],
    ["AB", (pub.abstract || "").replace(/\s+/g, " ").trim() || null],
    ...(pub.keywords ?? []).map((kw): [string, string | null] => ["KW", kw]),
    ["DO", pub.doi],
    ["UR", publicationUrl(pub.slug)],
    ["ER", ""],
  ];
  return lines
    .filter(([tag, v]) => tag === "ER" || v)
    .map(([tag, v]) => `${tag}  - ${v ?? ""}`)
    .join("\n");
}

export function buildPublicationCitation(format: CiteFormat, pub: Publication): string {
  if (format === "bibtex") return toBibTeX(pub);
  if (format === "ris") return toRIS(pub);
  return toAPA(pub);
}

/** Filename + mime for downloading a citation file. */
export function publicationCitationFile(format: CiteFormat, pub: Publication): { name: string; mime: string } {
  const slug = bibKey(pub) || "citation";
  if (format === "bibtex") return { name: `${slug}.bib`, mime: "application/x-bibtex" };
  if (format === "ris") return { name: `${slug}.ris`, mime: "application/x-research-info-systems" };
  return { name: `${slug}.txt`, mime: "text/plain" };
}
