// /journals/<journal>/issues — every public issue of one journal, newest first,
// grouped by volume. An issue is listed only when it has a published article
// (the same rule its own page and the sitemap use), so every link here resolves.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import JsonLd from "@/components/seo/JsonLd";
import JournalBreadcrumb from "@/components/ui/journals/JournalBreadcrumb";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { buildIssuesListMetadata, issuesListJsonLd, type JournalPageSeoInput } from "@/lib/seo/journal-seo";
import { getJournalBySlug, getJournalOverview, type JournalSummary } from "@/lib/journals/data";
import { formatJournalDate, issueLabel, journalTitle, type JournalIssue } from "@/lib/journals/types";
import { issuePath, journalIssuesPath, journalPath, JOURNALS_PATH } from "@/lib/journals/urls";
import { getOrgIdentity } from "@/lib/system-settings/config";
import { decodeSlugParam } from "@/lib/slug";

export const revalidate = 3600;

type PageProps = { params: Promise<{ slug: string; locale: string }> };

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

/** Issues grouped under their volume, in the order compareIssuesNewestFirst gave them. */
function groupByVolume(issues: JournalIssue[]) {
  const groups: { key: string; volume: JournalIssue["volume"]; issues: JournalIssue[] }[] = [];
  for (const issue of issues) {
    const key = issue.volume_id ?? "∅";
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, volume: issue.volume ?? null, issues: [] };
      groups.push(g);
    }
    g.issues.push(issue);
  }
  return groups;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug: rawSlug, locale } = await params;
  const slug = decodeSlugParam(rawSlug);
  const journal = await getJournalBySlug(slug);
  if (!journal) return { title: "Journal not found", robots: { index: false, follow: true } };
  const [t, overview, org] = await Promise.all([
    getTranslations({ locale, namespace: "journals" }),
    getJournalOverview(journal.id),
    getOrgIdentity(),
  ]);
  const name = journalTitle(journal, locale);
  return buildIssuesListMetadata(
    toSeo(journal),
    locale,
    { title: t("issuesTitle", { journal: name }), description: t("issuesDescription", { journal: name }) },
    overview.issues.length,
    org,
  );
}

export default async function JournalIssuesPage({ params }: PageProps) {
  const { slug: rawSlug, locale } = await params;
  const slug = decodeSlugParam(rawSlug);
  const journal = await getJournalBySlug(slug);
  if (!journal) notFound();

  const [t, overview] = await Promise.all([
    getTranslations({ locale, namespace: "journals" }),
    getJournalOverview(journal.id),
  ]);
  const name = journalTitle(journal, locale);
  const crumbs = [
    { label: t("breadcrumbHome"), href: "/" },
    { label: t("breadcrumbJournals"), href: JOURNALS_PATH },
    { label: name, href: journalPath(journal.slug) },
    { label: t("breadcrumbIssues") },
  ];

  return (
    <section className="min-h-screen bg-bg-body px-4 py-6 sm:px-6 sm:py-10 md:px-12">
      <JsonLd
        data={issuesListJsonLd(
          toSeo(journal),
          locale,
          overview.issues.map((i) => ({ slug: i.slug, label: issueLabel(i, locale) })),
          t("issuesTitle", { journal: name }),
        )}
      />
      <JsonLd
        data={breadcrumbSchema(
          [
            { name: crumbs[0].label, path: "/" },
            { name: crumbs[1].label, path: JOURNALS_PATH },
            { name, path: journalPath(journal.slug) },
            { name: crumbs[3].label, path: journalIssuesPath(journal.slug) },
          ],
          { locale },
        )}
      />
      <div className="mx-auto max-w-[1000px]">
        <JournalBreadcrumb crumbs={crumbs} />
        <h1 className="font-khmer-serif text-[26px] font-bold leading-tight text-text-heading sm:text-[32px]">
          {t("issuesTitle", { journal: name })}
        </h1>

        {overview.issues.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-divider bg-bg-surface p-6 text-[14px] text-text-muted">
            {t("noIssues")}
          </p>
        ) : (
          <div className="mt-8 space-y-8">
            {groupByVolume(overview.issues).map((group) => {
              const heading = group.volume
                ? group.volume.year
                  ? t("volumeYear", { volume: group.volume.volume_number, year: group.volume.year })
                  : t("volumeHeading", { volume: group.volume.volume_number })
                : t("noVolume");
              return (
                <section key={group.key} aria-labelledby={`vol-${group.key}`}>
                  <h2 id={`vol-${group.key}`} className="text-[15px] font-bold text-text-heading">
                    {heading}
                  </h2>
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {group.issues.map((issue) => (
                      <li key={issue.id}>
                        <Link
                          href={issuePath(journal.slug, issue.slug)}
                          className="flex h-full flex-col rounded-xl border border-divider bg-bg-surface px-4 py-3 transition-colors hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
                        >
                          <span className="text-[15px] font-semibold text-text-heading">
                            {issueLabel(issue, locale)}
                            {issue.is_special_issue && (
                              <span className="ml-2 rounded-full bg-accent/12 px-2 py-0.5 text-[11px] font-bold text-accent-text">
                                {t("specialIssue")}
                              </span>
                            )}
                          </span>
                          {issue.title && issue.issue_number && (
                            <span className="mt-0.5 text-[13.5px] text-text-body">
                              {(locale === "km" && issue.title_km) || issue.title}
                            </span>
                          )}
                          <span className="mt-1 text-[12.5px] text-text-muted">
                            {[
                              formatJournalDate(issue.published_date, locale),
                              t("articleCount", { count: overview.issueArticleCounts[issue.id] ?? 0 }),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
