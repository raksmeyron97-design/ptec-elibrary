// /journals/<journal>/issues/<issue> — one issue: which journal, volume and
// number, when it appeared, and its table of contents in printed order
// (lib/journals/order.ts: first page, then article number, then date).
//
// The whole table of contents is one page. An issue is tens of articles and a
// publisher's own issue page lists them all; splitting a table of contents
// across ?page= would also make every issue page per-request instead of
// prerendered. The read is still bounded (ISSUE_ARTICLE_CAP).
//
// An issue with no published article is a 404 (the edge gate reads
// journal_issues_public, and getIssue() returns null) — never an empty page.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ArrowLeft } from "lucide-react";
import JsonLd from "@/components/seo/JsonLd";
import JournalBreadcrumb from "@/components/ui/journals/JournalBreadcrumb";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { buildIssueMetadata, issueJsonLd, type JournalPageSeoInput } from "@/lib/seo/journal-seo";
import { getIssue, getJournalBySlug, type JournalSummary } from "@/lib/journals/data";
import { formatJournalDate, issueLabel, journalTitle, type JournalIssue } from "@/lib/journals/types";
import { articlePath, issuePath, journalIssuesPath, journalPath, JOURNALS_PATH } from "@/lib/journals/urls";
import { authorList } from "@/lib/citations";
import { doiUrl, normalizeDoi } from "@/lib/seo/identifiers";
import { getOrgIdentity } from "@/lib/system-settings/config";
import { decodeSlugParam } from "@/lib/slug";

export const revalidate = 3600;

type PageProps = { params: Promise<{ slug: string; issue: string; locale: string }> };

function toSeo(j: JournalSummary): JournalPageSeoInput {
  return {
    slug: j.slug,
    title: j.title,
    titleKm: j.title_km,
    issn: j.issn,
    eIssn: j.e_issn,
    printIssn: j.print_issn,
    publisher: j.publisher_name,
    articleCount: j.articleCount,
    isIndexable: j.is_indexable,
  };
}

function issueSeo(issue: JournalIssue, locale: string) {
  return {
    slug: issue.slug,
    issueNumber: issue.issue_number,
    volumeNumber: issue.volume?.volume_number ?? null,
    title: (locale === "km" && issue.title_km) || issue.title,
    datePublished: issue.published_date,
    label: issueLabel(issue, locale),
    description: (locale === "km" && issue.description_km) || issue.description,
  };
}

async function load(rawSlug: string, rawIssue: string) {
  const journal = await getJournalBySlug(decodeSlugParam(rawSlug));
  if (!journal) return null;
  const detail = await getIssue(journal.id, decodeSlugParam(rawIssue));
  return detail ? { journal, ...detail } : null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, issue: issueSlug, locale } = await params;
  const [found, org] = await Promise.all([load(slug, issueSlug), getOrgIdentity()]);
  if (!found) return { title: "Issue not found", robots: { index: false, follow: true } };
  return buildIssueMetadata(toSeo(found.journal), issueSeo(found.issue, locale), locale, org);
}

export default async function JournalIssuePage({ params }: PageProps) {
  const { slug, issue: issueSlug, locale } = await params;
  const found = await load(slug, issueSlug);
  if (!found) notFound();
  const { journal, issue, articles } = found;
  const t = await getTranslations({ locale, namespace: "journals" });

  const name = journalTitle(journal, locale);
  const label = issueLabel(issue, locale);
  const issueTitle = issue.issue_number ? (locale === "km" && issue.title_km) || issue.title : null;
  const description = (locale === "km" && issue.description_km) || issue.description;
  const published = formatJournalDate(issue.published_date, locale);
  const crumbs = [
    { label: t("breadcrumbHome"), href: "/" },
    { label: t("breadcrumbJournals"), href: JOURNALS_PATH },
    { label: name, href: journalPath(journal.slug) },
    { label: t("breadcrumbIssues"), href: journalIssuesPath(journal.slug) },
    { label },
  ];

  return (
    <section className="min-h-screen bg-bg-body px-4 py-6 sm:px-6 sm:py-10 md:px-12">
      <JsonLd
        data={issueJsonLd(
          toSeo(journal),
          issueSeo(issue, locale),
          articles.map((a) => ({ slug: a.slug, title: a.title, doi: a.doi, pageStart: a.page_start, pageEnd: a.page_end })),
          locale,
        )}
      />
      <JsonLd
        data={breadcrumbSchema(
          [
            { name: crumbs[0].label, path: "/" },
            { name: crumbs[1].label, path: JOURNALS_PATH },
            { name, path: journalPath(journal.slug) },
            { name: crumbs[3].label, path: journalIssuesPath(journal.slug) },
            { name: label, path: issuePath(journal.slug, issue.slug) },
          ],
          { locale },
        )}
      />
      <div className="mx-auto max-w-[1000px]">
        <JournalBreadcrumb crumbs={crumbs} />

        <header className="rounded-[28px] border border-divider bg-bg-surface px-5 py-7 shadow-sm sm:px-8 sm:py-9">
          <Link
            href={journalPath(journal.slug)}
            className="text-[12px] font-bold uppercase tracking-[0.14em] text-accent-text hover:underline"
          >
            {name}
          </Link>
          <h1 className="mt-2 font-khmer-serif text-[26px] font-bold leading-tight text-text-heading sm:text-[32px]">
            {label}
            {issue.is_special_issue && (
              <span className="ml-3 align-middle rounded-full bg-accent/12 px-2.5 py-0.5 text-[12px] font-bold text-accent-text">
                {t("specialIssue")}
              </span>
            )}
          </h1>
          {issueTitle && <p className="mt-1 text-[16px] text-text-body">{issueTitle}</p>}
          <p className="mt-3 text-[13px] font-semibold text-text-muted">
            {[published ? t("issuePublished", { date: published }) : null, t("articleCount", { count: articles.length })]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {description && <p className="mt-4 whitespace-pre-line text-[15px] leading-7 text-text-body">{description}</p>}
        </header>

        <section aria-labelledby="issue-toc" className="mt-10">
          <h2 id="issue-toc" className="font-khmer-serif text-[20px] font-bold text-text-heading">
            {t("issueArticlesHeading")}
          </h2>
          <ol className="mt-4 divide-y divide-divider overflow-hidden rounded-2xl border border-divider bg-bg-surface">
            {articles.map((a) => {
              const authors = authorList(a);
              const pages = a.page_start
                ? t("pages", { range: a.page_end ? `${a.page_start}–${a.page_end}` : a.page_start })
                : a.article_no
                  ? t("articleNumber", { n: a.article_no })
                  : null;
              const doi = normalizeDoi(a.doi);
              const articleTitle = locale === "km" && a.title_km ? a.title_km : a.title;
              return (
                <li key={a.id} className="px-5 py-4">
                  <h3 className="text-[16px] font-semibold leading-snug text-text-heading">
                    <Link href={articlePath(a.slug)} className="hover:text-brand hover:underline">
                      {articleTitle}
                    </Link>
                  </h3>
                  {authors.length > 0 && <p className="mt-1 text-[13.5px] text-text-body">{authors.join(", ")}</p>}
                  {(pages || doi) && (
                    <p className="mt-1 flex flex-wrap gap-x-3 text-[12.5px] text-text-muted">
                      {pages && <span>{pages}</span>}
                      {doi && (
                        <a
                          href={doiUrl(doi) ?? undefined}
                          className="font-mono hover:text-brand hover:underline"
                          rel="noopener noreferrer"
                        >
                          doi:{doi}
                        </a>
                      )}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        <p className="mt-8">
          <Link
            href={journalIssuesPath(journal.slug)}
            className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand hover:underline"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("allIssues")}
          </Link>
        </p>
      </div>
    </section>
  );
}
