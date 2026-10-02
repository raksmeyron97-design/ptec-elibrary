// Server-side reads for the public journal surfaces (/journals/<journal>,
// its issues, and the journal context of an article page).
//
// Cookie-free (createPublicClient) and cached under TAGS.journals +
// TAGS.publications, so the journal and issue pages prerender and a save in
// the admin reaches them on the next request (revalidatePublication() and the
// journal actions both fire those tags).
//
// UNKNOWN IS NOT EMPTY. Every loader here THROWS on a failed read instead of
// returning [] — unstable_cache would otherwise store "this journal has no
// issues" for an hour after one timeout, and the sitemap would drop real URLs.
// Callers decide how to degrade (a page renders its error boundary; the
// sitemap omits journal URLs but keeps every article URL, which do not depend
// on the journal).
//
// Bounded by construction: a journal page reads the journal, its public
// issues, and its newest N articles — never the whole collection.

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { TAGS } from "@/lib/cache/revalidate";
import { mapRowToPublication, type Publication } from "@/lib/publications";
import {
  ISSUE_SELECT,
  JOURNAL_SELECT,
  JOURNAL_SELECT_BASE,
  VOLUME_SELECT,
  mapRowToIssue,
  mapRowToJournal,
  type Journal,
  type JournalIssue,
} from "@/lib/journals/types";
import { compareArticlesInIssue, compareArticlesNewestFirst, compareIssuesNewestFirst } from "@/lib/journals/order";

const TAG_LIST = [TAGS.journals, TAGS.publications];
const ISSUE_WITH_VOLUME = `${ISSUE_SELECT}, journal_volumes!journal_issues_volume_in_journal(${VOLUME_SELECT})`;

/** Latest articles shown on a journal page. */
export const JOURNAL_LATEST_ARTICLES = 6;
/** Hard cap on one issue's table of contents (an issue is tens of articles). */
export const ISSUE_ARTICLE_CAP = 500;

function fail(what: string, error: { message?: string } | null): never {
  throw new Error(`[journals] ${what} failed: ${error?.message ?? "unknown error"}`);
}

export type JournalSummary = Journal & { articleCount: number; issueCount: number };

/** PostgREST / Postgres "column does not exist" — the database predates a migration. */
export function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42703" || error.code === "PGRST204" || /column .* does not exist/i.test(error.message ?? "");
}

/**
 * Published journals with the 0166 profile columns, or — on a database the
 * migration has not reached yet (the deploy window) — the 0148 columns alone,
 * which map to an empty profile. Never a failed page over a missing column.
 */
async function readPublishedJournals(db: ReturnType<typeof createPublicClient>) {
  const full = await db.from("journals").select(JOURNAL_SELECT).eq("is_published", true);
  if (!isMissingColumn(full.error)) return full;
  return db.from("journals").select(JOURNAL_SELECT_BASE).eq("is_published", true);
}

/**
 * Every published journal with its number of published articles and public
 * issues. Two small queries — the journal table, and the (journal_id, issue_id)
 * pairs of published articles — counted in memory.
 */
async function loadPublicJournals(): Promise<JournalSummary[]> {
  const db = createPublicClient();
  const [journals, articles] = await Promise.all([
    readPublishedJournals(db),
    db
      .from("publications")
      .select("journal_id, issue_id")
      .eq("is_published", true)
      .not("journal_id", "is", null),
  ]);
  if (journals.error) fail("journals list", journals.error);
  if (articles.error) fail("journal article counts", articles.error);

  const counts = new Map<string, { articles: number; issues: Set<string> }>();
  for (const row of (articles.data ?? []) as { journal_id: string; issue_id: string | null }[]) {
    const c = counts.get(row.journal_id) ?? { articles: 0, issues: new Set<string>() };
    c.articles += 1;
    if (row.issue_id) c.issues.add(row.issue_id);
    counts.set(row.journal_id, c);
  }
  return (journals.data ?? [])
    .map(mapRowToJournal)
    .map((j) => ({
      ...j,
      articleCount: counts.get(j.id)?.articles ?? 0,
      issueCount: counts.get(j.id)?.issues.size ?? 0,
    }))
    .sort((a, b) => b.articleCount - a.articleCount || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}

export const getPublicJournals = cache(
  unstable_cache(loadPublicJournals, ["public-journals-v1"], { revalidate: 3600, tags: TAG_LIST }),
);

/** Published journal by slug, or null when there is no such public journal. */
export const getJournalBySlug = cache(async (slug: string): Promise<JournalSummary | null> => {
  const all = await getPublicJournals();
  return all.find((j) => j.slug === slug) ?? null;
});

export type JournalOverview = {
  /** Public issues (published, in a published journal, ≥1 published article), newest first. */
  issues: JournalIssue[];
  /** Published articles per public issue id. */
  issueArticleCounts: Record<string, number>;
  /** Newest published articles, newest first (may include the current issue's). */
  latestArticles: Publication[];
  /** The newest public issue's table of contents, in printed order. Empty when there is no issue. */
  currentIssueArticles: Publication[];
};

async function loadJournalOverview(journalId: string): Promise<JournalOverview> {
  const db = createPublicClient();
  const [issues, articleIssueIds, latest] = await Promise.all([
    db.from("journal_issues").select(ISSUE_WITH_VOLUME).eq("journal_id", journalId).eq("is_published", true),
    db
      .from("publications")
      .select("issue_id")
      .eq("journal_id", journalId)
      .eq("is_published", true)
      .not("issue_id", "is", null),
    db
      .from("publications_with_stats")
      .select("*")
      .eq("journal_id", journalId)
      .eq("is_published", true)
      .order("publication_date", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .limit(JOURNAL_LATEST_ARTICLES),
  ]);
  if (issues.error) fail("journal issues", issues.error);
  if (articleIssueIds.error) fail("journal issue membership", articleIssueIds.error);
  if (latest.error) fail("journal latest articles", latest.error);

  const issueArticleCounts: Record<string, number> = {};
  for (const r of (articleIssueIds.data ?? []) as { issue_id: string }[]) {
    issueArticleCounts[r.issue_id] = (issueArticleCounts[r.issue_id] ?? 0) + 1;
  }
  const publicIssues = (issues.data ?? [])
    .map(mapRowToIssue)
    .filter((i) => (issueArticleCounts[i.id] ?? 0) > 0)
    .sort(compareIssuesNewestFirst);

  // The current issue's table of contents is the journal page's main content
  // (what ThaiJO, CJBAR and Springer all lead with). One more bounded read,
  // only when there is an issue to read.
  let currentIssueArticles: Publication[] = [];
  const current = publicIssues[0];
  if (current) {
    const toc = await db
      .from("publications_with_stats")
      .select("*")
      .eq("issue_id", current.id)
      .eq("is_published", true)
      .limit(ISSUE_ARTICLE_CAP);
    if (toc.error) fail("current issue articles", toc.error);
    currentIssueArticles = (toc.data ?? []).map(mapRowToPublication).sort(compareArticlesInIssue);
  }

  return {
    issues: publicIssues,
    issueArticleCounts,
    latestArticles: (latest.data ?? []).map(mapRowToPublication).sort(compareArticlesNewestFirst),
    currentIssueArticles,
  };
}

export const getJournalOverview = cache(
  unstable_cache(loadJournalOverview, ["journal-overview-v2"], { revalidate: 3600, tags: TAG_LIST }),
);

export type IssueDetail = { issue: JournalIssue; articles: Publication[] };

async function loadIssue(journalId: string, issueSlug: string): Promise<IssueDetail | null> {
  const db = createPublicClient();
  const { data: row, error } = await db
    .from("journal_issues")
    .select(ISSUE_WITH_VOLUME)
    .eq("journal_id", journalId)
    .eq("slug", issueSlug)
    .eq("is_published", true)
    .maybeSingle();
  if (error) fail("issue", error);
  if (!row) return null;
  const issue = mapRowToIssue(row);

  const articles = await db
    .from("publications_with_stats")
    .select("*")
    .eq("issue_id", issue.id)
    .eq("is_published", true)
    .limit(ISSUE_ARTICLE_CAP);
  if (articles.error) fail("issue articles", articles.error);
  const list = (articles.data ?? []).map(mapRowToPublication).sort(compareArticlesInIssue);
  // No published article → no public issue page (journal_issues_public agrees).
  if (list.length === 0) return null;
  return { issue, articles: list };
}

export const getIssue = cache(
  unstable_cache(loadIssue, ["journal-issue-v1"], { revalidate: 3600, tags: TAG_LIST }),
);

export type ArticleJournalContext = {
  journal: Pick<
    Journal,
    "id" | "slug" | "title" | "title_km" | "title_km_source" | "issn" | "e_issn" | "print_issn" | "publisher_name"
  >;
  issue: JournalIssue | null;
};

/**
 * The public journal (and issue) an article belongs to, for its breadcrumb,
 * its "Published in" block and its JSON-LD `isPartOf` chain. Null when the
 * article is unmapped or its journal is not public — the article page then
 * renders exactly as it did before journals existed, from the legacy text.
 * A failed read also yields null here (the article page must not fail because
 * a decorative context query did), but is logged.
 */
export async function getArticleJournalContext(
  pub: Pick<Publication, "journal_id" | "issue_id">,
): Promise<ArticleJournalContext | null> {
  if (!pub.journal_id) return null;
  try {
    const journal = await getPublicJournals().then((all) => all.find((j) => j.id === pub.journal_id) ?? null);
    if (!journal) return null;
    let issue: JournalIssue | null = null;
    if (pub.issue_id) {
      const overview = await getJournalOverview(journal.id);
      issue = overview.issues.find((i) => i.id === pub.issue_id) ?? null;
    }
    return { journal, issue };
  } catch (e) {
    console.warn("[journals] article context unavailable:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** id → slug/title for every public journal, for building links in lists. */
export async function getJournalLinkIndex(): Promise<
  Map<string, Pick<Journal, "slug" | "title" | "title_km" | "title_km_source">>
> {
  try {
    const all = await getPublicJournals();
    return new Map(all.map((j) => [j.id, { slug: j.slug, title: j.title, title_km: j.title_km, title_km_source: j.title_km_source }]));
  } catch {
    // A missing link is a degraded list, never a wrong one.
    return new Map();
  }
}

export type JournalPtecAuthor = {
  id: string;
  name: string;
  nameKm: string | null;
  /** Published articles by this person in this journal. */
  articleCount: number;
};

/**
 * PTEC staff who wrote published articles in this journal — the one fact on a
 * journal page that only this library can state (decision 2026-10-02: PTEC
 * research published elsewhere is recorded here). "PTEC staff" is the
 * librarian's explicit `publication_authors.is_ptec_staff` flag (0125), never
 * a guess from an affiliation string. Bounded: one journal's authorships.
 */
async function loadJournalPtecAuthors(journalId: string): Promise<JournalPtecAuthor[]> {
  const db = createPublicClient();
  const { data, error } = await db
    .from("publication_authorships")
    .select(
      "publication_id, publication_authors!inner(id, full_name, full_name_km, is_ptec_staff), " +
        "publications!inner(journal_id, is_published)",
    )
    .eq("publications.journal_id", journalId)
    .eq("publications.is_published", true)
    .eq("publication_authors.is_ptec_staff", true)
    .limit(ISSUE_ARTICLE_CAP);
  if (error) fail("journal PTEC authors", error);

  const byId = new Map<string, JournalPtecAuthor & { pubs: Set<string> }>();
  for (const row of (data ?? []) as unknown as {
    publication_id: string;
    publication_authors: { id: string; full_name: string | null; full_name_km: string | null } | null;
  }[]) {
    const a = row.publication_authors;
    const name = a?.full_name?.trim() || a?.full_name_km?.trim();
    if (!a || !name) continue;
    const entry = byId.get(a.id) ?? { id: a.id, name, nameKm: a.full_name_km?.trim() || null, articleCount: 0, pubs: new Set() };
    entry.pubs.add(row.publication_id);
    entry.articleCount = entry.pubs.size;
    byId.set(a.id, entry);
  }
  return [...byId.values()]
    .map((e) => ({ id: e.id, name: e.name, nameKm: e.nameKm, articleCount: e.articleCount }))
    .sort((x, y) => y.articleCount - x.articleCount || x.name.localeCompare(y.name) || x.id.localeCompare(y.id));
}

export const getJournalPtecAuthors = cache(
  unstable_cache(loadJournalPtecAuthors, ["journal-ptec-authors-v1"], { revalidate: 3600, tags: TAG_LIST }),
);
