import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ArrowUpRight } from "lucide-react";

import { Link } from "@/i18n/navigation";
import JsonLd from "@/components/seo/JsonLd";
import Icon from "@/components/ui/core/Icon";
import CollectionHeader from "@/components/ui/collection/CollectionHeader";
import SubjectDirectoryFilter from "@/components/ui/subjects/SubjectDirectoryFilter";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { SITE_URL } from "@/lib/seo/site";
import { localeAlternates } from "@/lib/seo/alternates";
import { openGraphBase } from "@/lib/seo/open-graph";
import { libraryNode } from "@/lib/seo/org-nodes";
import { getOrgIdentity } from "@/lib/system-settings/config";
import {
  getBrowsableSubjects,
  getSubjectHierarchy,
  subjectBreakdown,
  type SubjectSummary,
  type SubjectHierarchyRef,
} from "@/lib/subjects";

// ISR. The hub renders taxonomy + counts, both invalidated by the tags on
// getSubjectIndex(), so publishing a book moves the numbers without a redeploy.
export const revalidate = 3600;

type PageProps = { params: Promise<{ locale: string }> };

/**
 * The subject hub — the page whose absence made every /subjects/[slug] URL an
 * orphan (docs/SEO-V2-AUDIT.md F-4).
 *
 * Before this existed, subject pages were reachable only from sitemap.xml: no
 * navigation entry, no listing, no internal link anywhere on the site pointed
 * at one. Their own breadcrumbs pointed at /books while claiming to say
 * "Subjects", because there was nowhere truthful to point (F-5).
 *
 * Only subjects with at least one public resource are listed. An empty subject
 * is a soft-404 and does not belong on a hub any more than in a sitemap.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const [t, org] = await Promise.all([
    getTranslations({ locale, namespace: "subjects" }),
    getOrgIdentity(),
  ]);

  const title = t("hubSeoTitle");
  const description = t("hubSeoDescription");
  const alternates = localeAlternates("/subjects", locale);

  return {
    title,
    description,
    alternates,
    openGraph: {
      ...(await openGraphBase(locale)),
      title: `${title} | ${org.libraryName}`,
      description,
      type: "website",
      url: alternates.canonical,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SubjectsHubPage({ params }: PageProps) {
  const { locale } = await params;
  const [subjects, hierarchy, t, org] = await Promise.all([
    getBrowsableSubjects(),
    getSubjectHierarchy(locale),
    getTranslations({ locale, namespace: "subjects" }),
    getOrgIdentity(),
  ]);

  // Browsable, not indexable: a subject too thin to rank is still somewhere a
  // reader can go, and the hub is the only place that says it exists. What is
  // withheld here is only the subject with 0 or 1 resource — see
  // lib/subjects/indexability.ts.
  //
  // toSorted, not [...x].sort(): getBrowsableSubjects() hands back a CACHED
  // array that must not be mutated, and toSorted returns a new one without the
  // separate spread copy.
  const sorted = subjects.toSorted(
    (a, b) => b.counts.total - a.counts.total || a.name.localeCompare(b.name),
  );
  const totalResources = sorted.reduce((sum, s) => sum + s.counts.total, 0);
  const hubUrl = locale === "km" ? `${SITE_URL}/km/subjects` : `${SITE_URL}/subjects`;

  const breadcrumbs = breadcrumbSchema([
    { name: t("breadcrumbHome"), path: "/" },
    { name: t("breadcrumbSubjects") },
  ], { locale });

  // CollectionPage + ItemList naming every subject that has resources. The
  // ItemList is the machine-readable form of the link graph this page creates:
  // it is exactly the set of URLs the page links to, in the order shown.
  const collectionSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${hubUrl}#collection`,
    name: t("hubSeoTitle"),
    description: t("hubSeoDescription"),
    url: hubUrl,
    inLanguage: locale === "km" ? "km" : "en",
    isAccessibleForFree: true,
    provider: libraryNode(org),
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: sorted.length,
      itemListElement: sorted.map((s, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: s.name,
        url:
          locale === "km"
            ? `${SITE_URL}/km/subjects/${s.slug}`
            : `${SITE_URL}/subjects/${s.slug}`,
      })),
    },
  };

  return (
    <main className="min-h-screen bg-bg-body px-4 py-8 sm:px-6 sm:py-10 md:px-12">
      <JsonLd data={breadcrumbs} />
      {sorted.length > 0 && <JsonLd data={collectionSchema} />}

      <div className="mx-auto max-w-5xl">
        <nav
          aria-label="Breadcrumb"
          className="mb-6 flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-text-muted sm:gap-2"
        >
          <Link href="/" className="focus-field rounded-sm transition-colors hover:text-brand">
            {t("breadcrumbHome")}
          </Link>
          <Icon name="chevron-right" className="text-[16px] text-divider" />
          <span className="font-semibold text-text-heading">{t("breadcrumbSubjects")}</span>
        </nav>

        <CollectionHeader
          eyebrow={t("breadcrumbSubjects")}
          title={t("hubTitle")}
          description={t("hubIntro")}
          stats={
            sorted.length > 0 ? (
              <>
                <span className="inline-flex items-center rounded-full border border-divider bg-bg-surface px-3.5 py-1 text-[12.5px] font-semibold text-text-body shadow-2xs">
                  {t("hubCountSubjects", { count: sorted.length })}
                </span>
                <span className="inline-flex items-center rounded-full border border-divider bg-bg-surface px-3.5 py-1 text-[12.5px] font-semibold text-text-body shadow-2xs">
                  {t("hubCountResources", { count: totalResources })}
                </span>
              </>
            ) : null
          }
        />

        {sorted.length === 0 ? (
          <div className="rounded-2xl border border-divider bg-bg-surface p-8 text-center text-text-muted">
            {t("hubEmpty")}
          </div>
        ) : (
          <>
            <SubjectDirectoryFilter
              listId="subjects-grid"
              label={t("hubSearchLabel")}
              placeholder={t("hubSearchPlaceholder")}
              noMatches={t("hubNoMatches")}
              clearLabel={t("hubClearSearch")}
            />

            <ul id="subjects-grid" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sorted.map((subject) => {
                const node =
                  hierarchy.bySlug.get(subject.slug) ?? hierarchy.byCategoryId.get(subject.id);
                const parent = node?.parent ?? null;
                const childrenCount = node?.children?.length ?? 0;

                return (
                  <li
                    key={subject.slug}
                    data-subject-key={`${subject.name} ${subject.slug} ${parent?.name ?? ""}`}
                    className="h-full"
                  >
                    <SubjectTile
                      subject={subject}
                      parent={parent}
                      childrenCount={childrenCount}
                      t={t}
                    />
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}

function SubjectTile({
  subject,
  parent,
  childrenCount,
  t,
}: {
  subject: SubjectSummary;
  parent: SubjectHierarchyRef | null;
  childrenCount: number;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const parts = subjectBreakdown(subject.counts, t);

  return (
    <Link
      href={`/subjects/${subject.slug}`}
      className="group focus-field relative flex h-full flex-col justify-between rounded-2xl border border-divider bg-bg-surface p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md"
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {parent && (
              <p className="text-[11.5px] font-medium text-text-muted">
                {t("subtopicOf", { parent: parent.name })}
              </p>
            )}
            <h2 className="text-[16px] font-bold leading-snug tracking-tight text-text-heading transition-colors group-hover:text-brand [text-wrap:balance]">
              {subject.name}
            </h2>
          </div>
          <ArrowUpRight
            className="h-4 w-4 shrink-0 text-text-muted transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand"
            aria-hidden="true"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center rounded-md border border-brand/20 bg-brand/5 px-2 py-0.5 text-[11.5px] font-bold text-brand tabular-nums">
            {t("resourceCount", { count: subject.counts.total })}
          </span>
          {childrenCount > 0 && (
            <span className="inline-flex items-center rounded-md border border-divider bg-bg-body px-2 py-0.5 text-[11px] font-medium text-text-muted">
              {t("subtopicCount", { count: childrenCount })}
            </span>
          )}
        </div>
      </div>

      {parts.length > 0 && (
        <p className="mt-4 border-t border-divider/60 pt-3 text-[12px] leading-relaxed text-text-muted">
          {parts.join(" · ")}
        </p>
      )}
    </Link>
  );
}
