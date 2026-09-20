import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, ArrowUpRight } from "lucide-react";

import { Link } from "@/i18n/navigation";
import SubjectLearningPaths from "@/components/seo/SubjectLearningPaths";
import JsonLd from "@/components/seo/JsonLd";
import Icon from "@/components/ui/core/Icon";
import ResourceTypeBadge from "@/components/ui/collection/ResourceTypeBadge";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { SITE_URL } from "@/lib/seo/site";
import { localeAlternates } from "@/lib/seo/alternates";
import { buildOpenGraph, buildTwitter } from "@/lib/seo/open-graph";
import { libraryNode } from "@/lib/seo/org-nodes";
import { getOrgIdentity } from "@/lib/system-settings/config";
import { decodeSlugParam } from "@/lib/slug";
import {
  buildSubjectBreadcrumbs,
  buildSubjectHierarchySchema,
  getSubjectDetail,
  otherSubjects,
  subjectVisibility,
  subjectBreakdown,
  subjectTypeKey,
  SUBJECT_RESOURCE_TYPES,
  type SubjectItem,
  type SubjectResourceType,
} from "@/lib/subjects";
import { JOURNALS_PATH } from "@/lib/journals/urls";

export const revalidate = 3600;

type PageProps = { params: Promise<{ slug: string; locale: string }> };

/** Where "browse all" sends a visitor for each resource type. */
const LISTING_PATH: Record<SubjectResourceType, string> = {
  book: "/books",
  thesis: "/theses",
  publication: JOURNALS_PATH,
  catalog: "/catalogs",
};

function truncate(text: string, max = 155): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug: rawSlug, locale } = await params;

  // All three are independent, so they run together rather than stacking three
  // round trips onto the metadata path. getSubjectDetail is React-cached and
  // getOrgIdentity reads the cached site config, so resolving the identity even
  // on the not-found path costs nothing.
  //
  // Next delivers non-ASCII segments percent-encoded to the page body and
  // decoded to generateMetadata — Khmer subject slugs never match otherwise.
  const [subject, t, org] = await Promise.all([
    getSubjectDetail(decodeSlugParam(rawSlug), locale),
    getTranslations({ locale, namespace: "subjects" }),
    getOrgIdentity(),
  ]);

  if (!subject) {
    return { title: t("emptyTitle"), robots: { index: false, follow: true } };
  }

  const parts = subjectBreakdown(subject.counts, t);
  const title = t("metaTitle", { subject: subject.name });
  const description =
    parts.length > 0
      ? truncate(t("metaDescription", { subject: subject.name, breakdown: parts.join(", ") }))
      : truncate(t("metaDescriptionEmpty", { subject: subject.name }));
  const alternates = localeAlternates(`/subjects/${subject.slug}`, locale);
  const socialTitle = `${title} | ${org.libraryName}`;
  const openGraph = buildOpenGraph({
    locale,
    org,
    title: socialTitle,
    description,
    type: "website" as const,
    url: alternates.canonical,
  });

  return {
    title,
    description,
    alternates,
    // The §5 depth gate, from the SAME function the sitemap filters with
    // (lib/subjects/indexability.ts) — a hub is never submitted for indexing
    // and then found answering `noindex`.
    //
    // `follow` in every case: a hub below the bar is still a set of real links
    // to real resources, and withdrawing the crawl would strand them. What is
    // withdrawn is the claim that this PAGE is a search result. V2 applied that
    // to EMPTY subjects (ten were live and in sitemap.xml — F-1); 3.3 applies
    // it to thin ones, one of which held a single 23-page book and was
    // advertised exactly like the 65-book research collection.
    ...(subjectVisibility(subject.counts, subject.fullText) === "index"
      ? {}
      : { robots: { index: false, follow: true } }),
    openGraph,
    // `summary_large_image`, not `summary`: this page ships the shared
    // 1200 x 630 card and `summary` crops a landscape image to a small square.
    twitter: buildTwitter({
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: openGraph.images,
    }),
  };
}

export default async function SubjectPage({ params }: PageProps) {
  const { slug: rawSlug, locale } = await params;
  const subject = await getSubjectDetail(decodeSlugParam(rawSlug), locale);
  if (!subject) notFound();

  const [t, org, fallbackSubjects] = await Promise.all([
    getTranslations({ locale, namespace: "subjects" }),
    getOrgIdentity(),
    subject.related.length === 0 ? otherSubjects(subject.slug) : Promise.resolve([]),
  ]);

  const prefix = locale === "km" ? `${SITE_URL}/km` : SITE_URL;
  const subjectUrl = `${prefix}/subjects/${subject.slug}`;

  // Grouped by type, in a stable order, so the page reads as a small catalogue
  // rather than one undifferentiated grid of mixed things.
  const groups = SUBJECT_RESOURCE_TYPES.flatMap((type) => {
    const items = subject.items.filter((i) => i.type === type);
    return items.length > 0 ? [{ type, items }] : [];
  });

  // Hierarchical breadcrumbs: 4 levels for child topics (Home → Subjects → Parent → Child)
  // and 3 levels for parent / flat topics (Home → Subjects → Topic).
  const crumbs = buildSubjectBreadcrumbs(subject, subject.parent, t);
  const breadcrumbs = breadcrumbSchema(crumbs, { locale, pageUrl: subjectUrl });

  // Schema.org CollectionPage hierarchy markup (SEO 3.3 Phase B Item 6)
  const hierarchySchema = buildSubjectHierarchySchema({
    subjectSlug: subject.slug,
    subjectName: subject.name,
    locale,
    parent: subject.parent,
    children: subject.children,
    hubSeoTitle: t("hubSeoTitle"),
  });

  const collectionSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${subjectUrl}#collection`,
    name: subject.name,
    url: subjectUrl,
    inLanguage: locale === "km" ? "km" : "en",
    isAccessibleForFree: true,
    provider: libraryNode(org),
    isPartOf: hierarchySchema.isPartOf,
    about: hierarchySchema.about,
    ...(hierarchySchema.hasPart ? { hasPart: hierarchySchema.hasPart } : {}),
    // The items actually rendered, in the order rendered. numberOfItems is the
    // full match count, which may exceed the listed items (each type is capped)
    // — that is what ItemList's numberOfItems means.
    ...(subject.items.length > 0
      ? {
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: subject.counts.total,
            itemListElement: subject.items.map((item, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: item.title,
              url: `${prefix}${item.href}`,
            })),
          },
        }
      : {}),
  };

  return (
    <main className="min-h-screen bg-bg-body px-4 py-8 sm:px-6 sm:py-10 md:px-12">
      <JsonLd data={breadcrumbs} />
      <JsonLd data={collectionSchema} />

      <div className="mx-auto max-w-5xl">
        <nav
          aria-label="Breadcrumb"
          className="mb-6 flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-text-muted sm:gap-2"
        >
          <Link href="/" className="focus-field rounded-sm transition-colors hover:text-brand">
            {t("breadcrumbHome")}
          </Link>
          <Icon name="chevron-right" className="text-[16px] text-divider" />
          <Link
            href="/subjects"
            className="focus-field rounded-sm transition-colors hover:text-brand"
          >
            {t("breadcrumbSubjects")}
          </Link>
          {subject.parent && (
            <>
              <Icon name="chevron-right" className="text-[16px] text-divider" />
              <Link
                href={`/subjects/${subject.parent.slug}`}
                className="focus-field rounded-sm transition-colors hover:text-brand"
              >
                {subject.parent.name}
              </Link>
            </>
          )}
          <Icon name="chevron-right" className="text-[16px] text-divider" />
          <span className="max-w-[220px] truncate font-semibold text-text-heading sm:max-w-none">
            {subject.name}
          </span>
        </nav>

        <header className="mb-10">
          {subject.parent && (
            <div className="mb-3">
              <Link
                href={`/subjects/${subject.parent.slug}`}
                className="focus-field inline-flex items-center gap-1.5 rounded-full border border-brand/25 bg-brand/5 px-3 py-1 text-[12px] font-semibold text-brand transition-colors hover:border-brand/40"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                {t("subtopicOf", { parent: subject.parent.name })}
              </Link>
            </div>
          )}
          <p className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-brand">
            {t("eyebrow")}
          </p>
          <h1 className="mt-2 text-[clamp(26px,4.5vw,38px)] font-bold leading-[1.2] tracking-tight text-text-heading [text-wrap:balance]">
            {subject.name}
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-text-muted">{t("intro")}</p>

          {/* Breakdown statistic cards/pills strip */}
          <div className="mt-6 flex flex-wrap gap-2.5 sm:gap-3 border-t border-divider pt-5">
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-divider bg-bg-surface px-3.5 py-2 text-[13px] font-semibold text-text-heading shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
                {t("hubCountResources", { count: subject.counts.total }).replace(/^\d+\s*/, "")}:
              </span>
              <span className="font-bold tabular-nums text-brand">{subject.counts.total}</span>
            </span>
            {SUBJECT_RESOURCE_TYPES.filter((type) => subject.counts[type] > 0).map((type) => (
              <span
                key={type}
                className="inline-flex items-center gap-1.5 rounded-xl border border-divider bg-bg-surface px-3.5 py-2 text-[13px] font-medium text-text-body shadow-2xs"
              >
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                  {t(`group${subjectTypeKey(type)}` as "groupBook")}:
                </span>
                <span className="font-bold tabular-nums text-text-heading">
                  {subject.counts[type]}
                </span>
              </span>
            ))}
          </div>
        </header>

        {/* Subtopics Rail — rendered on parent hubs (ស្រាវជ្រាវ, វិទ្យាសាស្ត្រ, គណិតវិទ្យា)
            to pass internal link equity down to canonical child subjects */}
        {subject.children.length > 0 && (
          <section
            id="subject-subtopics"
            aria-labelledby="subtopics-heading"
            className="mb-10 rounded-2xl border border-divider bg-bg-surface p-6 sm:p-7 shadow-xs"
          >
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <h2 id="subtopics-heading" className="text-[18px] font-bold text-text-heading">
                  {t("subtopicsHeading")}
                </h2>
                <p className="mt-1 text-[13px] text-text-muted">{t("subtopicsIntro")}</p>
              </div>
              <span className="rounded-full border border-divider bg-bg-body px-2.5 py-0.5 text-[11.5px] font-bold text-text-muted tabular-nums">
                {t("subtopicCount", { count: subject.children.length })}
              </span>
            </div>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {subject.children.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/subjects/${c.slug}`}
                    className="group focus-field flex items-center justify-between rounded-xl border border-divider bg-bg-body p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-xs"
                  >
                    <span className="font-semibold text-[14px] text-text-heading transition-colors group-hover:text-brand">
                      {c.name}
                    </span>
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-0.5 text-[11.5px] font-bold text-brand tabular-nums">
                      {c.counts.total}
                      <ArrowUpRight className="h-3 w-3 opacity-60 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Curricula & Learning Paths — self-fetching from cached index; streams
            independently and returns null when this subject has no learning paths */}
        <Suspense fallback={null}>
          <SubjectLearningPaths subjectName={subject.name} locale={locale} />
        </Suspense>

        {groups.length === 0 ? (
          <div className="rounded-2xl border border-divider bg-bg-surface p-8 text-center">
            <p className="text-[15px] font-bold text-text-heading">{t("emptyTitle")}</p>
            <p className="mt-2 text-[13.5px] text-text-muted">{t("emptyBody")}</p>
            <Link
              href="/subjects"
              className="focus-field mt-4 inline-block rounded-lg border border-divider px-4 py-2 text-[13px] font-semibold text-brand transition-colors hover:border-brand/40"
            >
              {t("backToSubjects")}
            </Link>
          </div>
        ) : (
          <div className="space-y-10">
            {groups.map((group) => (
              <section key={group.type} aria-labelledby={`group-${group.type}`}>
                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                  <h2
                    id={`group-${group.type}`}
                    className="text-[18px] font-bold text-text-heading"
                  >
                    {t(`group${subjectTypeKey(group.type)}` as "groupBook")}{" "}
                    <span className="text-[14px] font-semibold text-text-muted">
                      ({subject.counts[group.type]})
                    </span>
                  </h2>
                  {/* Present whenever the group is capped OR simply as the way
                      onward — the collection listing is where the rest lives. */}
                  <Link
                    href={LISTING_PATH[group.type]}
                    className="focus-field rounded-sm text-[13px] font-semibold text-brand transition-colors hover:underline"
                  >
                    {t(`browseAll${subjectTypeKey(group.type)}` as "browseAllBook")} →
                  </Link>
                </div>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {group.items.map((item) => (
                    <li key={`${item.type}-${item.href}`}>
                      <ResourceTile
                        item={item}
                        label={t(`type${subjectTypeKey(item.type)}` as "typeBook")}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {/* Related subjects — evidence-backed when publications co-tag them,
            and honestly relabelled "More subjects" when they do not. The two
            are different claims and get different headings. */}
        {(subject.related.length > 0 || fallbackSubjects.length > 0) && (
          <section aria-labelledby="related-subjects" className="mt-14 border-t border-divider pt-8">
            <h2 id="related-subjects" className="text-[18px] font-bold text-text-heading">
              {subject.related.length > 0 ? t("relatedHeading") : t("otherHeading")}
            </h2>
            {subject.related.length > 0 && (
              <p className="mt-1 text-[13px] text-text-muted">{t("relatedIntro")}</p>
            )}
            <ul className="mt-4 flex flex-wrap gap-2">
              {(subject.related.length > 0 ? subject.related : fallbackSubjects).map((s) => (
                <li key={s.slug}>
                  <Link
                    href={`/subjects/${s.slug}`}
                    className="focus-field inline-flex items-center gap-2 rounded-full border border-divider bg-bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-text-body transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:text-brand hover:shadow-xs"
                  >
                    {s.name}
                    <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11.5px] font-bold text-brand tabular-nums">
                      {s.counts.total}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}

function ResourceTile({ item, label }: { item: SubjectItem; label: string }) {
  return (
    <Link
      href={item.href}
      className="group focus-field relative flex h-full flex-col justify-between rounded-2xl border border-divider bg-bg-surface p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md"
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <ResourceTypeBadge type={item.type} label={label} />
          <ArrowUpRight
            className="h-4 w-4 shrink-0 text-text-muted transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand"
            aria-hidden="true"
          />
        </div>

        <h3 className="mt-2.5 line-clamp-2 text-[15.5px] font-bold leading-snug tracking-tight text-text-heading transition-colors group-hover:text-brand">
          {item.title}
        </h3>

        {item.author && (
          <p className="mt-1.5 line-clamp-1 text-[13px] font-medium text-text-muted">
            {item.author}
          </p>
        )}

        {item.excerpt && (
          <p className="mt-2.5 line-clamp-2 text-[13px] leading-relaxed text-text-body">
            {truncate(item.excerpt, 140)}
          </p>
        )}
      </div>
    </Link>
  );
}
