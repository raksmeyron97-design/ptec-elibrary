// The ONLY place that knows the shape of a journal / issue / article URL.
//
// Pure and dependency-free on purpose: next.config.ts imports the legacy
// redirect rules below (path aliases are not resolved there), and client
// components, the sitemap, the SEO builders, search and the AI all build
// links from the same functions. Before this module the article URL was a
// hand-written `/publications/${slug}` template in ~70 places; a route move
// meant finding all of them. lib/journals/urls.test.ts scans the source tree
// and fails if a hand-written collection URL reappears.
//
// ── Why the article URL does not contain the journal ─────────────────────────
//
// /journals/articles/<slug>, not /journals/<journal>/articles/<slug>. The
// article's slug is stable; its JOURNAL ASSIGNMENT is not — it is resolved from
// free text (migration 0148) and is exactly what an admin corrects when a
// mapping was wrong. A URL that embeds the journal would move every time that
// happens, and each move would chain behind the legacy /publications/<slug>
// redirect. The hierarchy is still expressed — in breadcrumbs and in the
// ScholarlyArticle's `isPartOf` chain — just not in the one string that has to
// be permanent. It also keeps the legacy redirect a single static hop with no
// database lookup. docs/JOURNALS-ARCHITECTURE.md §3.

/** The internal scholarly-journal collection. */
export const JOURNALS_PATH = "/journals";

/**
 * The official PTEC publications page on the college's own website. This is
 * NOT a library collection and must never be routed through `/publications`
 * on the library's origin.
 */
export const PTEC_PUBLICATIONS_URL = "https://www.ptec.edu.kh/publications/";

/** The retired internal collection path. Only the redirect rules use it. */
export const LEGACY_PUBLICATIONS_PATH = "/publications";

/**
 * Journal slugs that would collide with a static child of /journals.
 * Mirrored by the `journals_slug_shape` CHECK in 0148 and by the negative
 * lookahead in middleware's JOURNAL_GATE_PATTERNS.
 */
export const RESERVED_JOURNAL_SLUGS = ["articles"] as const;

/** Prefix of every article URL, for maps that append `/${slug}` themselves. */
export const ARTICLES_BASE_PATH = `${JOURNALS_PATH}/articles`;

export function articlePath(slug: string): string {
  return `${ARTICLES_BASE_PATH}/${slug}`;
}

export function journalPath(journalSlug: string): string {
  return `${JOURNALS_PATH}/${journalSlug}`;
}

export function journalIssuesPath(journalSlug: string): string {
  return `${journalPath(journalSlug)}/issues`;
}

export function issuePath(journalSlug: string, issueSlug: string): string {
  return `${journalIssuesPath(journalSlug)}/${issueSlug}`;
}

/**
 * The listing filtered to one journal. Used only where a filter is genuinely
 * what the reader asked for (the facet control); a link that means "this
 * journal" goes to journalPath(), which is a real, indexable page.
 */
export function journalFilterPath(journalSlug: string): string {
  return `${JOURNALS_PATH}?journal=${encodeURIComponent(journalSlug)}`;
}

// ── Legacy redirects ─────────────────────────────────────────────────────────

export type LegacyRedirectRule = {
  source: string;
  destination: string;
  statusCode: 301;
};

/**
 * next.config.ts `redirects()` entries retiring /publications.
 *
 * Config redirects run BEFORE middleware, so each locale form is stated
 * explicitly — including `/en/…`, which middleware would otherwise strip to
 * `/publications…` first and then redirect a second time (a chain). Every
 * source therefore reaches its final URL in exactly one hop.
 *
 * `statusCode: 301`, not `permanent: true` — Next maps `permanent` to 308
 * (the same choice lib/seo/subject-slug-redirects.ts makes).
 *
 * The query string is carried by Next automatically. `?journal=` held a
 * journal NAME on the old listing; /journals accepts a name as well as a slug
 * there, so old filtered links keep filtering.
 */
export function legacyPublicationRedirectRules(): LegacyRedirectRule[] {
  const rules: LegacyRedirectRule[] = [];
  // /journals/articles is the parent of every article URL but is not a page:
  // the collection of articles IS /journals. Without this it would fall to the
  // /journals/[slug] route as a journal named "articles" and stream a 200
  // before notFound() — a soft 404 at the most guessable URL under /journals.
  for (const [prefix, target] of [
    ["", ""],
    ["/en", ""],
    ["/km", "/km"],
  ] as const) {
    rules.push({ source: `${prefix}${ARTICLES_BASE_PATH}`, destination: `${target}${JOURNALS_PATH}`, statusCode: 301 });
  }
  for (const [prefix, target] of [
    ["", ""],
    ["/en", ""],
    ["/km", "/km"],
  ] as const) {
    rules.push(
      {
        source: `${prefix}${LEGACY_PUBLICATIONS_PATH}`,
        destination: `${target}${JOURNALS_PATH}`,
        statusCode: 301,
      },
      {
        source: `${prefix}${LEGACY_PUBLICATIONS_PATH}/:slug`,
        destination: `${target}${JOURNALS_PATH}/articles/:slug`,
        statusCode: 301,
      },
    );
  }
  return rules;
}
