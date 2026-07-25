// Pure SEO-health classification for the admin Data Quality dashboard (§25 of
// the SEO roadmap). Kept free of Supabase/I/O so the rules are unit-testable
// without a database — the server action in app/actions/data-quality.ts fetches
// published rows, normalizes them into SeoResourceInput, and calls buildSeoHealth.
//
// Scope is deliberately the checks that are (a) genuinely SEO/Scholar-relevant
// and (b) computable from published metadata alone. Checks that need an HTTP
// fetch (canonical → 404, broken PDF) or DOM rendering (multiple <h1>) are out
// of scope here; the existing file-health sweep + metadata-gaps sections cover
// the adjacent ground.

export type SeoResourceType =
  | "book"
  | "research"
  | "publication"
  | "learning_path"
  | "catalog"
  | "post";

export type SeoIssueCode =
  | "duplicate_title"
  | "missing_social_image"
  | "scholar_missing_author"
  | "scholar_missing_date"
  | "scholar_missing_abstract";

export type SeoSeverity = "high" | "medium";

/** One published resource, normalized for the checks. */
export interface SeoResourceInput {
  type: SeoResourceType;
  id: string;
  title: string | null;
  editUrl: string;
  /** True when an og:image OR a cover image exists — otherwise OG falls back to the site logo. */
  hasSocialImage: boolean;
  /** Theses & publications only: these feed Google Scholar citation_* tags. */
  scholarly?: boolean;
  hasAuthor?: boolean;
  hasDate?: boolean;
  hasAbstract?: boolean;
}

export interface SeoFinding {
  type: SeoResourceType;
  id: string;
  title: string;
  editUrl: string;
  issue: SeoIssueCode;
  severity: SeoSeverity;
}

export interface SeoHealthResult {
  findings: SeoFinding[];
  counts: {
    total: number;
    high: number;
    medium: number;
    byIssue: Record<SeoIssueCode, number>;
    /** How many scholarly records (theses + publications) were examined. */
    scholarlyChecked: number;
    /** How many resources were examined in total. */
    resourcesChecked: number;
  };
}

const SEVERITY_OF: Record<SeoIssueCode, SeoSeverity> = {
  scholar_missing_author: "high",
  scholar_missing_date: "high",
  scholar_missing_abstract: "high",
  duplicate_title: "medium",
  missing_social_image: "medium",
};

const SEVERITY_RANK: Record<SeoSeverity, number> = { high: 0, medium: 1 };

/** Normalize a title for duplicate detection (Unicode-safe, works for Khmer too). */
export function normalizeTitle(title: string | null | undefined): string {
  return (title ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Titles shared by two or more PUBLISHED resources of the SAME type — a
 * non-unique <title> and a duplicate-content signal. Cross-type collisions are
 * fine (the routes namespace them: /books/x vs /theses/x), so grouping is
 * per-type. Blank titles are ignored (that is a different, upstream problem).
 */
export function duplicateTitleIds(resources: SeoResourceInput[]): Set<string> {
  const groups = new Map<string, string[]>();
  for (const r of resources) {
    const key = `${r.type}::${normalizeTitle(r.title)}`;
    if (key.endsWith("::")) continue; // blank title
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r.id);
  }
  const dupes = new Set<string>();
  for (const ids of groups.values()) {
    if (ids.length >= 2) for (const id of ids) dupes.add(id);
  }
  return dupes;
}

function push(findings: SeoFinding[], r: SeoResourceInput, issue: SeoIssueCode) {
  findings.push({
    type: r.type,
    id: r.id,
    title: r.title?.trim() || "(untitled)",
    editUrl: r.editUrl,
    issue,
    severity: SEVERITY_OF[issue],
  });
}

export function buildSeoHealth(resources: SeoResourceInput[]): SeoHealthResult {
  const findings: SeoFinding[] = [];
  const dupes = duplicateTitleIds(resources);
  let scholarlyChecked = 0;

  for (const r of resources) {
    if (dupes.has(r.id)) push(findings, r, "duplicate_title");
    if (!r.hasSocialImage) push(findings, r, "missing_social_image");

    if (r.scholarly) {
      scholarlyChecked += 1;
      // These three each break a required Google Scholar citation_* tag (and
      // the visible-abstract requirement) — see lib/seo/citation.ts.
      if (!r.hasAuthor) push(findings, r, "scholar_missing_author");
      if (!r.hasDate) push(findings, r, "scholar_missing_date");
      if (!r.hasAbstract) push(findings, r, "scholar_missing_abstract");
    }
  }

  // High severity first, then a stable type/title ordering so the list doesn't
  // reshuffle between fetches for equal-severity rows.
  findings.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      a.type.localeCompare(b.type) ||
      a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
  );

  const byIssue = {
    duplicate_title: 0,
    missing_social_image: 0,
    scholar_missing_author: 0,
    scholar_missing_date: 0,
    scholar_missing_abstract: 0,
  } satisfies Record<SeoIssueCode, number>;
  let high = 0;
  let medium = 0;
  for (const f of findings) {
    byIssue[f.issue] += 1;
    if (f.severity === "high") high += 1;
    else medium += 1;
  }

  return {
    findings,
    counts: {
      total: findings.length,
      high,
      medium,
      byIssue,
      scholarlyChecked,
      resourcesChecked: resources.length,
    },
  };
}
