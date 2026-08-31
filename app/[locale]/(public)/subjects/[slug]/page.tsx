import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import JsonLd from "@/components/seo/JsonLd";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { SITE_URL } from "@/lib/seo/site";
import { localeAlternates } from "@/lib/seo/alternates";
import { openGraphBase } from "@/lib/seo/open-graph";
import { libraryNode } from "@/lib/seo/org-nodes";
import { getOrgIdentity } from "@/lib/system-settings/config";
import { decodeSlugParam } from "@/lib/slug";
import {
  getSubjectDetail,
  otherSubjects,
  subjectBreakdown,
  subjectTypeKey,
  SUBJECT_RESOURCE_TYPES,
  type SubjectItem,
  type SubjectResourceType,
} from "@/lib/subjects";

export const revalidate = 3600;

type PageProps = { params: Promise<{ slug: string; locale: string }> };

/** Where "browse all" sends a visitor for each resource type. */
const LISTING_PATH: Record<SubjectResourceType, string> = {
  book: "/books",
  thesis: "/theses",
  publication: "/publications",
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
    getSubjectDetail(decodeSlugParam(rawSlug)),
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

  return {
    title,
    description,
    alternates,
    // A subject with nothing attached is a soft-404: HTTP 200 with an empty
    // body. It stays crawlable (`follow`) so any link equity passes through,
    // but it is never offered for indexing. Ten such URLs were indexable and
    // in sitemap.xml before V2 — docs/SEO-V2-AUDIT.md F-1.
    ...(subject.counts.total === 0 ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      ...(await openGraphBase(locale)),
      title: `${title} | ${org.libraryName}`,
      description,
      type: "website",
      url: alternates.canonical,
    },
    twitter: { card: "summary", title, description },
  };
}

export default async function SubjectPage({ params }: PageProps) {
  const { slug: rawSlug, locale } = await params;
  const subject = await getSubjectDetail(decodeSlugParam(rawSlug));
  if (!subject) notFound();

  const [t, org, fallbackSubjects] = await Promise.all([
    getTranslations({ locale, namespace: "subjects" }),
    getOrgIdentity(),
    subject.related.length === 0 ? otherSubjects(subject.slug) : Promise.resolve([]),
  ]);

  const prefix = locale === "km" ? `${SITE_URL}/km` : SITE_URL;
  const subjectUrl = `${prefix}/subjects/${subject.slug}`;
  const parts = subjectBreakdown(subject.counts, t);

  // Grouped by type, in a stable order, so the page reads as a small catalogue
  // rather than one undifferentiated grid of mixed things.
  const groups = SUBJECT_RESOURCE_TYPES.flatMap((type) => {
    const items = subject.items.filter((i) => i.type === type);
    return items.length > 0 ? [{ type, items }] : [];
  });

  // The breadcrumb now points at a subject hub that exists. It used to read
  // "Subjects" while linking to /books, in the visible nav AND in the emitted
  // BreadcrumbList — a machine-readable claim that this page lived somewhere
  // it did not (docs/SEO-V2-AUDIT.md F-5).
  const breadcrumbs = breadcrumbSchema([
    { name: t("breadcrumbHome"), path: "/" },
    { name: t("breadcrumbSubjects"), path: "/subjects" },
    { name: subject.name },
  ]);

  const collectionSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${subjectUrl}#collection`,
    name: subject.name,
    url: subjectUrl,
    inLanguage: locale === "km" ? "km" : "en",
    isAccessibleForFree: true,
    about: { "@type": "Thing", name: subject.name },
    provider: libraryNode(org),
    isPartOf: {
      "@type": "CollectionPage",
      name: t("hubSeoTitle"),
      url: `${prefix}/subjects`,
    },
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
    <main className="min-h-screen bg-bg-body px-4 py-10 sm:px-6 md:px-12">
      <JsonLd data={breadcrumbs} />
      <JsonLd data={collectionSchema} />

      <div className="mx-auto max-w-5xl">
        <nav
          aria-label="Breadcrumb"
          className="mb-5 flex flex-wrap items-center gap-2 text-[13px] font-medium text-text-muted"
        >
          <Link href="/" className="focus-field rounded-sm transition-colors hover:text-brand">
            {t("breadcrumbHome")}
          </Link>
          <span aria-hidden="true">/</span>
          <Link
            href="/subjects"
            className="focus-field rounded-sm transition-colors hover:text-brand"
          >
            {t("breadcrumbSubjects")}
          </Link>
          <span aria-hidden="true">/</span>
          <span className="max-w-[220px] truncate font-semibold text-text-heading sm:max-w-none">
            {subject.name}
          </span>
        </nav>

        <header className="mb-8">
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-brand">
            {t("eyebrow")}
          </p>
          <h1 className="mt-2 text-3xl font-bold text-text-heading sm:text-4xl">{subject.name}</h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-7 text-text-muted">{t("intro")}</p>
          {parts.length > 0 && (
            <p className="mt-3 text-[13px] font-semibold text-text-muted">
              {t("resourceCount", { count: subject.counts.total })} · {parts.join(" · ")}
            </p>
          )}
        </header>

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
                      <ResourceTile item={item} label={t(`type${subjectTypeKey(item.type)}` as "typeBook")} />
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
                    className="focus-field inline-flex items-center gap-2 rounded-full border border-divider bg-bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-text-body transition-colors hover:border-brand/40 hover:text-brand"
                  >
                    {s.name}
                    <span className="text-[11.5px] font-bold text-text-muted">
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
      className="focus-field flex h-full flex-col rounded-xl border border-divider bg-bg-surface p-4 transition-colors hover:border-brand/40"
    >
      <span className="w-fit rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand">
        {label}
      </span>
      <h3 className="mt-2 line-clamp-2 text-[15px] font-bold text-text-heading">{item.title}</h3>
      {item.author && (
        <p className="mt-1 line-clamp-1 text-[12.5px] text-text-muted">{item.author}</p>
      )}
      {item.excerpt && (
        <p className="mt-2 line-clamp-2 text-[12.5px] leading-5 text-text-body">
          {truncate(item.excerpt, 130)}
        </p>
      )}
    </Link>
  );
}
