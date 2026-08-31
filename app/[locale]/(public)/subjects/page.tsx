import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import JsonLd from "@/components/seo/JsonLd";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { SITE_URL } from "@/lib/seo/site";
import { localeAlternates } from "@/lib/seo/alternates";
import { openGraphBase } from "@/lib/seo/open-graph";
import { libraryNode } from "@/lib/seo/org-nodes";
import { getOrgIdentity } from "@/lib/system-settings/config";
import { getIndexableSubjects, subjectBreakdown, type SubjectSummary } from "@/lib/subjects";

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
  const [subjects, t, org] = await Promise.all([
    getIndexableSubjects(),
    getTranslations({ locale, namespace: "subjects" }),
    getOrgIdentity(),
  ]);

  // toSorted, not [...x].sort(): getIndexableSubjects() hands back a CACHED
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
  ]);

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
    <main className="min-h-screen bg-bg-body px-4 py-10 sm:px-6 md:px-12">
      <JsonLd data={breadcrumbs} />
      {sorted.length > 0 && <JsonLd data={collectionSchema} />}

      <div className="mx-auto max-w-5xl">
        <nav
          aria-label="Breadcrumb"
          className="mb-5 flex flex-wrap items-center gap-2 text-[13px] font-medium text-text-muted"
        >
          <Link href="/" className="focus-field rounded-sm transition-colors hover:text-brand">
            {t("breadcrumbHome")}
          </Link>
          <span aria-hidden="true">/</span>
          <span className="font-semibold text-text-heading">{t("breadcrumbSubjects")}</span>
        </nav>

        <header className="mb-8">
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-brand">
            {t("breadcrumbSubjects")}
          </p>
          <h1 className="mt-2 text-3xl font-bold text-text-heading sm:text-4xl">
            {t("hubTitle")}
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-7 text-text-muted">{t("hubIntro")}</p>
          {sorted.length > 0 && (
            <p className="mt-3 text-[13px] font-semibold text-text-muted">
              {t("hubCountSubjects", { count: sorted.length })} ·{" "}
              {t("hubCountResources", { count: totalResources })}
            </p>
          )}
        </header>

        {sorted.length === 0 ? (
          <div className="rounded-2xl border border-divider bg-bg-surface p-8 text-center text-text-muted">
            {t("hubEmpty")}
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((subject) => (
              <li key={subject.slug}>
                <SubjectTile subject={subject} t={t} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function SubjectTile({
  subject,
  t,
}: {
  subject: SubjectSummary;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const parts = subjectBreakdown(subject.counts, t);

  return (
    <Link
      href={`/subjects/${subject.slug}`}
      className="focus-field flex h-full flex-col rounded-xl border border-divider bg-bg-surface p-4 transition-colors hover:border-brand/40"
    >
      <h2 className="text-[15px] font-bold text-text-heading">{subject.name}</h2>
      <p className="mt-1 text-[12.5px] font-semibold text-brand">
        {t("resourceCount", { count: subject.counts.total })}
      </p>
      {parts.length > 0 && (
        <p className="mt-1.5 text-[12px] leading-5 text-text-muted">{parts.join(" · ")}</p>
      )}
    </Link>
  );
}
