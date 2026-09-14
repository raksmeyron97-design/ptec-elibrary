// /journals/<journal> — the JOURNAL, not another article listing: what it is,
// who publishes it, its identifiers, its current issue, its newest articles and
// its issues. Every block renders only when the journal record (or its
// articles) actually holds the fact; nothing is filled in to make the page look
// complete — no invented editorial board, aims or ISSN.
//
// Prerendered (ISR) and cookie-free: lib/journals/data.ts reads through the
// anon client under unstable_cache, invalidated by TAGS.journals.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ArrowRight, ExternalLink, Search } from "lucide-react";
import JsonLd from "@/components/seo/JsonLd";
import JournalBreadcrumb from "@/components/ui/journals/JournalBreadcrumb";
import PublicationListItem from "@/components/ui/publications/PublicationListItem";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { buildJournalMetadata, journalIssns, journalJsonLd, type JournalPageSeoInput } from "@/lib/seo/journal-seo";
import { getJournalBySlug, getJournalOverview, type JournalSummary } from "@/lib/journals/data";
import { formatJournalDate, issueLabel, journalTitle, languageName } from "@/lib/journals/types";
import { issuePath, journalFilterPath, journalIssuesPath, journalPath, JOURNALS_PATH } from "@/lib/journals/urls";
import { getOrgIdentity } from "@/lib/system-settings/config";
import { safeExternalUrl } from "@/lib/authors/links";
import { decodeSlugParam } from "@/lib/slug";

export const revalidate = 3600;

type PageProps = { params: Promise<{ slug: string; locale: string }> };

/** Issues shown on the journal page itself; the rest are one click away. */
const ISSUES_ON_JOURNAL_PAGE = 8;

function toSeo(j: JournalSummary): JournalPageSeoInput {
  return {
    slug: j.slug,
    title: j.title,
    titleKm: j.title_km,
    issn: j.issn,
    eIssn: j.e_issn,
    printIssn: j.print_issn,
    publisher: j.publisher_name,
    description: j.description,
    descriptionKm: j.description_km,
    language: j.language,
    coverUrl: j.cover_url,
    articleCount: j.articleCount,
    isIndexable: j.is_indexable,
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug: rawSlug, locale } = await params;
  const slug = decodeSlugParam(rawSlug);
  const [journal, org] = await Promise.all([getJournalBySlug(slug), getOrgIdentity()]);
  if (!journal) return { title: "Journal not found", robots: { index: false, follow: true } };
  return buildJournalMetadata(toSeo(journal), locale, org);
}

export default async function JournalPage({ params }: PageProps) {
  const { slug: rawSlug, locale } = await params;
  const slug = decodeSlugParam(rawSlug);
  const journal = await getJournalBySlug(slug);
  if (!journal) notFound();

  const [t, tDetail, overview, org] = await Promise.all([
    getTranslations({ locale, namespace: "journals" }),
    getTranslations({ locale, namespace: "publicationDetail" }),
    getJournalOverview(journal.id),
    getOrgIdentity(),
  ]);

  const title = journalTitle(journal, locale);
  const otherTitle = locale === "km" ? (journal.title_km ? journal.title : null) : journal.title_km;
  const publisher = (locale === "km" && journal.publisher_name_km) || journal.publisher_name;
  const description = (locale === "km" && journal.description_km) || journal.description;
  const aims = (locale === "km" && journal.aims_scope_km) || journal.aims_scope;
  const issns = journalIssns({ issn: journal.issn, eIssn: journal.e_issn, printIssn: journal.print_issn });
  const website = safeExternalUrl(journal.website_url);
  const current = overview.issues[0] ?? null;

  // Only identifiers that pass their check digit are shown, labelled by which
  // field held them. An invalid ISSN on the record is simply not displayed.
  const idRows = (
    [
      ["issn", journal.issn],
      ["printIssn", journal.print_issn],
      ["eIssn", journal.e_issn],
    ] as const
  )
    .map(([key, raw]) => ({ key, value: journalIssns({ issn: raw })[0] ?? null }))
    .filter((r): r is { key: "issn" | "printIssn" | "eIssn"; value: string } => !!r.value)
    .filter((r, i, all) => all.findIndex((x) => x.value === r.value) === i);

  const details: { label: string; value: React.ReactNode }[] = [
    ...(publisher ? [{ label: t("publisher"), value: publisher }] : []),
    ...idRows.map((r) => ({ label: t(r.key), value: <span className="font-mono">{r.value}</span> })),
    ...(languageName(journal.language, locale) ? [{ label: t("language"), value: languageName(journal.language, locale)! }] : []),
    ...(journal.frequency ? [{ label: t("frequency"), value: journal.frequency }] : []),
    ...(journal.country ? [{ label: t("country"), value: journal.country }] : []),
    ...(website
      ? [
          {
            label: t("website"),
            value: (
              <a
                href={website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 break-all text-brand underline-offset-2 hover:underline"
              >
                {new URL(website).host}
                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="sr-only"> {t("opensNewTab")}</span>
              </a>
            ),
          },
        ]
      : []),
  ];

  const crumbs = [
    { label: t("breadcrumbHome"), href: "/" },
    { label: t("breadcrumbJournals"), href: JOURNALS_PATH },
    { label: title },
  ];

  const listLabels = {
    openAccess: tDetail("openAccess"),
    licensed: tDetail("accessLicensed"),
    rightsUnstated: tDetail("accessRightsUnstated"),
  };

  return (
    <section className="min-h-screen bg-bg-body px-4 py-6 sm:px-6 sm:py-10 md:px-12">
      <JsonLd data={journalJsonLd(toSeo(journal), locale, org)} />
      <JsonLd
        data={breadcrumbSchema(
          [
            { name: crumbs[0].label, path: "/" },
            { name: crumbs[1].label, path: JOURNALS_PATH },
            { name: title, path: journalPath(journal.slug) },
          ],
          { locale },
        )}
      />
      <div className="mx-auto max-w-[1200px]">
        <JournalBreadcrumb crumbs={crumbs} />

        {/* ── Masthead ── */}
        <header className="rounded-[28px] border border-divider bg-bg-surface px-5 py-7 shadow-sm sm:px-8 sm:py-9">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent-text">{t("eyebrow")}</p>
          <h1 className="mt-2 font-khmer-serif text-[26px] font-bold leading-tight text-text-heading sm:text-[34px]">
            {title}
          </h1>
          {otherTitle && <p className="mt-1 text-[15px] text-text-muted">{otherTitle}</p>}
          {publisher && <p className="mt-3 text-[14px] font-medium text-text-body">{publisher}</p>}
          {issns.length > 0 && (
            <p className="mt-2 flex flex-wrap gap-2 text-[12.5px] text-text-muted">
              {issns.map((v) => (
                <span key={v} className="rounded-full border border-divider px-2.5 py-0.5 font-mono">
                  ISSN {v}
                </span>
              ))}
            </p>
          )}
          <p className="mt-4 text-[13px] font-semibold text-text-muted">
            {t("articleCount", { count: journal.articleCount })}
            {journal.issueCount > 0 && <> · {t("issueCount", { count: journal.issueCount })}</>}
          </p>
          {journal.articleCount > 0 && (
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={journalFilterPath(journal.slug)}
                className="inline-flex min-h-10 items-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-brand-contrast transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
                {t("searchArticles")}
              </Link>
              {overview.issues.length > 0 && (
                <Link
                  href={journalIssuesPath(journal.slug)}
                  className="inline-flex min-h-10 items-center gap-2 rounded-full border border-divider bg-bg-surface px-5 text-sm font-semibold text-text-body transition-colors hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                >
                  {t("viewAllIssues")}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              )}
            </div>
          )}
        </header>

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-x-8">
          <div className="min-w-0 space-y-10">
            {description && (
              <section aria-labelledby="journal-about">
                <h2 id="journal-about" className="font-khmer-serif text-[20px] font-bold text-text-heading">
                  {t("aboutHeading")}
                </h2>
                <p className="mt-3 whitespace-pre-line text-[15px] leading-7 text-text-body">{description}</p>
              </section>
            )}
            {aims && (
              <section aria-labelledby="journal-aims">
                <h2 id="journal-aims" className="font-khmer-serif text-[20px] font-bold text-text-heading">
                  {t("aimsScopeHeading")}
                </h2>
                <p className="mt-3 whitespace-pre-line text-[15px] leading-7 text-text-body">{aims}</p>
              </section>
            )}

            {current && (
              <section aria-labelledby="journal-current">
                <h2 id="journal-current" className="font-khmer-serif text-[20px] font-bold text-text-heading">
                  {t("currentIssue")}
                </h2>
                <Link
                  href={issuePath(journal.slug, current.slug)}
                  className="group mt-3 flex items-center justify-between gap-4 rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm transition-colors hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
                >
                  <span className="min-w-0">
                    <span className="block text-[17px] font-bold text-text-heading group-hover:text-brand">
                      {issueLabel(current, locale)}
                    </span>
                    {current.title && current.issue_number && (
                      <span className="mt-0.5 block text-[14px] text-text-body">
                        {(locale === "km" && current.title_km) || current.title}
                      </span>
                    )}
                    <span className="mt-1 block text-[13px] text-text-muted">
                      {[
                        formatJournalDate(current.published_date, locale),
                        t("articleCount", { count: overview.issueArticleCounts[current.id] ?? 0 }),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <ArrowRight className="h-5 w-5 shrink-0 text-text-muted group-hover:text-brand" aria-hidden="true" />
                </Link>
              </section>
            )}

            <section aria-labelledby="journal-latest">
              <h2 id="journal-latest" className="font-khmer-serif text-[20px] font-bold text-text-heading">
                {t("latestArticles")}
              </h2>
              {overview.latestArticles.length === 0 ? (
                <p className="mt-3 rounded-2xl border border-dashed border-divider bg-bg-surface p-6 text-[14px] text-text-muted">
                  {t("noArticles")}
                </p>
              ) : (
                <div className="mt-4 flex flex-col gap-4">
                  {overview.latestArticles.map((pub) => (
                    <PublicationListItem key={pub.id} publication={pub} labels={listLabels} />
                  ))}
                </div>
              )}
            </section>

            {overview.issues.length > 1 && (
              <section aria-labelledby="journal-issues">
                <div className="flex items-end justify-between gap-4">
                  <h2 id="journal-issues" className="font-khmer-serif text-[20px] font-bold text-text-heading">
                    {t("allIssues")}
                  </h2>
                  <Link
                    href={journalIssuesPath(journal.slug)}
                    className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline"
                  >
                    {t("viewAllIssues")}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {overview.issues.slice(0, ISSUES_ON_JOURNAL_PAGE).map((issue) => (
                    <li key={issue.id}>
                      <Link
                        href={issuePath(journal.slug, issue.slug)}
                        className="flex items-center justify-between gap-3 rounded-xl border border-divider bg-bg-surface px-4 py-3 text-[14px] transition-colors hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
                      >
                        <span className="font-semibold text-text-heading">{issueLabel(issue, locale)}</span>
                        <span className="text-[12.5px] text-text-muted">
                          {formatJournalDate(issue.published_date, locale) ??
                            t("articleCount", { count: overview.issueArticleCounts[issue.id] ?? 0 })}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {details.length > 0 && (
            <aside aria-labelledby="journal-details" className="min-w-0 lg:sticky lg:top-[128px]">
              <div className="rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm">
                <h2 id="journal-details" className="text-[13px] font-bold uppercase tracking-[0.12em] text-text-muted">
                  {t("detailsHeading")}
                </h2>
                <dl className="mt-3 space-y-3 text-[14px]">
                  {details.map((d) => (
                    <div key={d.label}>
                      <dt className="text-[12px] font-semibold text-text-muted">{d.label}</dt>
                      <dd className="mt-0.5 text-text-body">{d.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </aside>
          )}
        </div>
      </div>
    </section>
  );
}
