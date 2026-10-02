// A journal article's own Crossref record → the fields of the article editor
// ("Start from a DOI", decision 2026-10-02: the library INDEXES articles, so
// the facts already exist at the publisher). Pure and browser-safe; the
// network and the database matching live in app/actions/article-doi.ts.
//
// Rules, each because the alternative publishes something the publisher never
// said:
//   * Only what Crossref states. No abstract is invented when none was
//     deposited (ACS deposits none for J. Chem. Educ.), no licence is guessed
//     from the publisher's name, and a date is filled only when Crossref gives
//     a FULL day — a "2026-03" print date is not turned into "2026-03-01".
//   * The title keeps the publisher's wording; JATS markup is reduced to text.
//   * Identity is never fuzzy: authors are matched to existing records by
//     ORCID, then by exact name, in the action — never by similarity here.

import { normalizeOrcid, normalizeIssn } from "@/lib/seo/identifiers";
import { normalizeDoi, isValidDoi } from "@/lib/publications/citations";
import { plainParagraphs, plainText } from "@/lib/text/plain-text";

export type DoiAuthor = {
  /** "Set Seng" — given + family, or the literal name of an organisation. */
  fullName: string;
  /**
   * Family + given — the SAME two names in the other order. Publishers mix the
   * two up for East Asian names (ACS deposited "Tomita Shinpei" for Shinpei
   * Tomita), so an exact match on either order is still an exact match.
   * Null for a one-part or organisational name.
   */
  reversedName: string | null;
  orcid: string | null;
  /** Affiliation names as the publisher deposited them, de-duplicated. */
  affiliations: string[];
  isFirst: boolean;
};

export type DoiReference = { text: string; doi?: string };

export type ArticleFromDoi = {
  doi: string;
  title: string | null;
  journalTitle: string | null;
  /** Valid ISSNs of the journal, print first. */
  issns: string[];
  publisher: string | null;
  volume: string | null;
  issue: string | null;
  pageStart: string | null;
  pageEnd: string | null;
  articleNo: string | null;
  /** YYYY-MM-DD, or null when no full date was deposited. */
  publicationDate: string | null;
  /** The year, for display, even when no full date exists. */
  year: number | null;
  /** "en" / "km" only — the editor offers no other language. */
  language: "en" | "km" | null;
  /** "CC BY 4.0" from a Creative Commons licence URL; null otherwise. */
  license: string | null;
  abstract: string | null;
  authors: DoiAuthor[];
  references: DoiReference[];
};

type DateParts = { "date-parts"?: unknown };

const first = (v: unknown): string | null => {
  const s = Array.isArray(v) ? v[0] : v;
  if (typeof s !== "string") return null;
  const t = plainText(s);
  return t || null;
};

function fullDate(d: DateParts | undefined): string | null {
  const parts = Array.isArray(d?.["date-parts"]) ? (d!["date-parts"] as unknown[][])[0] : null;
  if (!Array.isArray(parts) || parts.length < 3) return null;
  const [y, m, day] = parts.map(Number);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(day)) return null;
  if (y < 1900 || m < 1 || m > 12 || day < 1 || day > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function yearOf(d: DateParts | undefined): number | null {
  const parts = Array.isArray(d?.["date-parts"]) ? (d!["date-parts"] as unknown[][])[0] : null;
  const y = Array.isArray(parts) ? Number(parts[0]) : NaN;
  return Number.isInteger(y) && y >= 1900 ? y : null;
}

const CC_NAMES: Record<string, string> = {
  by: "CC BY",
  "by-sa": "CC BY-SA",
  "by-nc": "CC BY-NC",
  "by-nc-sa": "CC BY-NC-SA",
  "by-nd": "CC BY-ND",
  "by-nc-nd": "CC BY-NC-ND",
};

/** "http://creativecommons.org/licenses/by-sa/4.0/" → "CC BY-SA 4.0". Anything else → null. */
export function creativeCommonsName(url: string | null | undefined): string | null {
  const m = /creativecommons\.org\/(licenses|publicdomain)\/([a-z-]+)\/(\d\.\d)/i.exec(url ?? "");
  if (!m) return null;
  if (m[1].toLowerCase() === "publicdomain") return m[2].toLowerCase() === "zero" ? `CC0 ${m[3]}` : null;
  const name = CC_NAMES[m[2].toLowerCase()];
  return name ? `${name} ${m[3]}` : null;
}

function referenceText(ref: Record<string, unknown>): string | null {
  const unstructured = typeof ref.unstructured === "string" ? plainText(ref.unstructured) : "";
  if (unstructured) return unstructured;
  const str = (k: string) => (typeof ref[k] === "string" ? plainText(ref[k] as string) : "");
  const author = str("author");
  const year = str("year");
  const title = str("article-title") || str("volume-title");
  const source = str("journal-title") || str("series-title");
  const volume = str("volume");
  const issue = str("issue");
  const page = str("first-page");
  const head = [author, year ? `(${year})` : ""].filter(Boolean).join(" ");
  const where = [source, volume ? (issue ? `${volume}(${issue})` : volume) : "", page].filter(Boolean).join(", ");
  const text = [head, title, where].filter(Boolean).join(". ");
  return text ? `${text}.`.replace(/\.\.$/, ".") : null;
}

/** Crossref `GET /works/{doi}` body (or its `message`) → editor fields. Null when it is not a work. */
export function parseCrossrefArticle(body: unknown): ArticleFromDoi | null {
  const root = body as { message?: unknown } | null;
  const m = (root && typeof root === "object" && "message" in root ? root.message : root) as Record<string, unknown> | null;
  if (!m || typeof m !== "object") return null;
  const doi = normalizeDoi(m.DOI);
  if (!doi || !isValidDoi(doi)) return null;

  const title = first(m.title);
  const subtitle = first(m.subtitle);
  const issnTypes = Array.isArray(m["issn-type"]) ? (m["issn-type"] as { type?: string; value?: string }[]) : [];
  const issns = [
    ...issnTypes.filter((t) => t.type === "print"),
    ...issnTypes.filter((t) => t.type !== "print"),
  ]
    .map((t) => normalizeIssn(t.value))
    .filter((v, i, all): v is string => !!v && all.indexOf(v) === i);

  const pageRaw = typeof m.page === "string" ? m.page.trim() : "";
  const [pageStart, pageEnd] = pageRaw ? pageRaw.split(/\s*[-–]\s*/) : [];

  const printed = m["published-print"] as DateParts | undefined;
  const online = m["published-online"] as DateParts | undefined;
  const issued = m.issued as DateParts | undefined;

  const licenses = Array.isArray(m.license) ? (m.license as { URL?: string }[]) : [];
  const license = licenses.map((l) => creativeCommonsName(l.URL)).find(Boolean) ?? null;

  const lang = typeof m.language === "string" ? m.language.toLowerCase() : "";

  const authors: DoiAuthor[] = (Array.isArray(m.author) ? (m.author as Record<string, unknown>[]) : [])
    .map((a) => {
      const given = typeof a.given === "string" ? plainText(a.given) : "";
      const family = typeof a.family === "string" ? plainText(a.family) : "";
      const literal = typeof a.name === "string" ? plainText(a.name) : "";
      const fullName = [given, family].filter(Boolean).join(" ") || literal;
      const affiliations = (Array.isArray(a.affiliation) ? (a.affiliation as { name?: unknown }[]) : [])
        .map((x) => (typeof x.name === "string" ? plainText(x.name) : ""))
        .filter((v, i, all) => !!v && all.indexOf(v) === i);
      return {
        fullName,
        reversedName: given && family ? `${family} ${given}` : null,
        orcid: normalizeOrcid(typeof a.ORCID === "string" ? a.ORCID : null),
        affiliations,
        isFirst: a.sequence === "first",
      };
    })
    .filter((a) => a.fullName);

  const references: DoiReference[] = (Array.isArray(m.reference) ? (m.reference as Record<string, unknown>[]) : [])
    .map((r) => {
      const text = referenceText(r);
      const refDoi = normalizeDoi(r.DOI);
      return text ? { text, ...(refDoi && isValidDoi(refDoi) ? { doi: refDoi } : {}) } : null;
    })
    .filter((r): r is DoiReference => !!r);

  const abstractRaw = typeof m.abstract === "string" ? plainParagraphs(m.abstract) : "";
  // A JATS abstract usually opens with its own "Abstract" heading.
  const abstract = abstractRaw.replace(/^abstract\s*:?\s*(\n\n)?/i, "").trim() || null;

  return {
    doi,
    title: title ? (subtitle ? `${title}: ${subtitle}` : title) : null,
    journalTitle: first(m["container-title"]),
    issns,
    publisher: typeof m.publisher === "string" ? plainText(m.publisher) || null : null,
    volume: typeof m.volume === "string" ? m.volume.trim() || null : null,
    issue: typeof m.issue === "string" ? m.issue.trim() || null : null,
    pageStart: pageStart || null,
    pageEnd: pageEnd || null,
    articleNo: typeof m["article-number"] === "string" ? m["article-number"].trim() || null : null,
    publicationDate: fullDate(printed) ?? fullDate(online) ?? fullDate(issued),
    year: yearOf(printed) ?? yearOf(online) ?? yearOf(issued),
    language: lang === "en" || lang === "km" ? lang : null,
    license,
    abstract,
    authors,
    references,
  };
}
