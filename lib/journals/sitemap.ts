// Which journal-level URLs the sitemap may advertise. Pure; unit-tested.
//
// The rule is the pages' own robots rule, stated once:
//   * /journals/<j>            published, indexable, ≥1 published article
//   * /journals/<j>/issues     the same, and ≥1 public issue
//   * /journals/<j>/issues/<i> a public issue (journal_issues_public: published
//                              issue in a published journal with ≥1 published
//                              article) of an indexable journal
// A journal page with no article renders an empty shell and answers noindex;
// advertising it would be the soft-404 shape SEO V2 removed from subjects.
//
// UNKNOWN IS NOT EMPTY: the caller passes `null` when a read failed, and the
// result is then "no journal URLs this time" — never a claim that journals do
// not exist, and never a reason to drop ARTICLE URLs, which do not depend on
// any journal row (their path is /journals/articles/<slug>).

import { issuePath, journalIssuesPath, journalPath } from "@/lib/journals/urls";

export type SitemapJournal = {
  id: string;
  slug: string;
  is_published: boolean;
  is_indexable: boolean;
  updated_at: string | null;
};
export type SitemapArticle = { journal_id: string | null; updated_at: string | null };
/** A row of journal_issues_public: `slug` is "<journal slug>/<issue slug>". */
export type SitemapIssue = { slug: string; journal_id: string };

export type JournalSitemapPath = { path: string; lastModified: string | null; kind: "journal" | "issues" | "issue" };

function latest(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

export function journalSitemapPaths(
  journals: readonly SitemapJournal[] | null,
  articles: readonly SitemapArticle[],
  issues: readonly SitemapIssue[] | null,
): JournalSitemapPath[] {
  if (!journals) return [];
  const lastArticle = new Map<string, string | null>();
  const hasArticle = new Set<string>();
  for (const a of articles) {
    if (!a.journal_id) continue;
    hasArticle.add(a.journal_id);
    lastArticle.set(a.journal_id, latest(lastArticle.get(a.journal_id) ?? null, a.updated_at));
  }

  const out: JournalSitemapPath[] = [];
  const bySlugPrefix = new Map<string, SitemapIssue[]>();
  for (const i of issues ?? []) {
    const list = bySlugPrefix.get(i.journal_id) ?? [];
    list.push(i);
    bySlugPrefix.set(i.journal_id, list);
  }

  for (const j of [...journals].sort((a, b) => a.slug.localeCompare(b.slug))) {
    if (!j.is_published || !j.is_indexable || !hasArticle.has(j.id)) continue;
    const lastmod = latest(j.updated_at, lastArticle.get(j.id) ?? null);
    out.push({ path: journalPath(j.slug), lastModified: lastmod, kind: "journal" });
    const own = (bySlugPrefix.get(j.id) ?? [])
      .map((i) => i.slug)
      .filter((s) => s.startsWith(`${j.slug}/`))
      .map((s) => s.slice(j.slug.length + 1))
      .sort();
    if (own.length > 0) {
      out.push({ path: journalIssuesPath(j.slug), lastModified: lastmod, kind: "issues" });
      for (const issueSlug of own) {
        out.push({ path: issuePath(j.slug, issueSlug), lastModified: null, kind: "issue" });
      }
    }
  }
  return out;
}
