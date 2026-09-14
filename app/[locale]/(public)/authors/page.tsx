import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ArrowUpRight } from "lucide-react";

import { Link } from "@/i18n/navigation";
import JsonLd from "@/components/seo/JsonLd";
import Icon from "@/components/ui/core/Icon";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { contributorNodes, soleContributorNode } from "@/lib/seo/contributor";
import { SITE_URL } from "@/lib/seo/site";
import { localeAlternates } from "@/lib/seo/alternates";
import { openGraphBase } from "@/lib/seo/open-graph";
import { libraryNode } from "@/lib/seo/org-nodes";
import { getOrgIdentity } from "@/lib/system-settings/config";
import { getListedAuthors } from "@/lib/authors/directory";
import { authorFilterKey } from "@/lib/authors/filter-key";
import AuthorDirectoryFilter from "@/components/ui/authors/AuthorDirectoryFilter";
import { CollectionHeader, CollectionEmptyState, EntityBadge } from "@/components/ui/collection";

export const revalidate = 3600;

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const [t, org] = await Promise.all([
    getTranslations({ locale, namespace: "authors" }),
    getOrgIdentity(),
  ]);

  const title = t("hubSeoTitle");
  const description = t("hubSeoDescription");
  const alternates = localeAlternates("/authors", locale);

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

export default async function AuthorsHubPage({ params }: PageProps) {
  const { locale } = await params;
  const [authors, t, org] = await Promise.all([
    getListedAuthors(),
    getTranslations({ locale, namespace: "authors" }),
    getOrgIdentity(),
  ]);

  const hubUrl = locale === "km" ? `${SITE_URL}/km/authors` : `${SITE_URL}/authors`;
  const authorUrl = (slug: string) =>
    locale === "km" ? `${SITE_URL}/km/authors/${slug}` : `${SITE_URL}/authors/${slug}`;
  const totalWorks = authors.reduce((sum, a) => sum + a.workCount, 0);

  // Extract distinct first letters for alphabetical navigation
  const availableLetters = Array.from(
    new Set(authors.map((a) => a.name.trim()[0]?.toUpperCase()).filter(Boolean)),
  ).sort();

  const breadcrumbs = breadcrumbSchema([
    { name: t("breadcrumbHome"), path: "/" },
    { name: t("breadcrumbAuthors") },
  ], { locale });

  const collectionSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${hubUrl}#collection`,
    name: t("hubSeoTitle"),
    description: t("hubSeoDescription"),
    url: hubUrl,
    inLanguage: locale === "km" ? "km" : "en",
    provider: libraryNode(org),
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: authors.length,
      itemListElement: authors.map((a, i) => {
        const node = soleContributorNode(contributorNodes(a.name, org));
        const typed = node && "@type" in node ? { "@type": node["@type"] } : {};
        const fragment = node && "@type" in node && node["@type"] === "Organization"
          ? "organization"
          : "person";
        return {
          "@type": "ListItem",
          position: i + 1,
          item: {
            ...typed,
            "@id": `${authorUrl(a.slug)}#${fragment}`,
            name: a.name,
            url: authorUrl(a.slug),
          },
        };
      }),
    },
  };

  return (
    <main className="min-h-screen bg-bg-body px-4 py-8 sm:px-6 sm:py-10 md:px-12">
      <JsonLd data={breadcrumbs} />
      {authors.length > 0 && <JsonLd data={collectionSchema} />}

      <div className="mx-auto max-w-5xl">
        {/* Semantic Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="mb-5 flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-text-muted"
        >
          <Link href="/" className="focus-field rounded-sm transition-colors hover:text-brand">
            {t("breadcrumbHome")}
          </Link>
          <Icon name="chevron-right" className="text-[15px] text-divider" />
          <span className="font-semibold text-text-heading">{t("breadcrumbAuthors")}</span>
        </nav>

        {/* Editorial Academic Header */}
        <CollectionHeader
          eyebrow={t("breadcrumbAuthors")}
          title={t("hubSubtitle")}
          description={t("hubIntro")}
          stats={
            authors.length > 0 ? (
              <>
                <span className="inline-flex items-center rounded-md border border-divider bg-bg-surface px-2.5 py-1 text-[12.5px] font-semibold text-text-heading shadow-xs">
                  {t("hubCountAuthors", { count: authors.length })}
                </span>
                <span className="text-divider">·</span>
                <span className="inline-flex items-center rounded-md border border-divider bg-bg-surface px-2.5 py-1 text-[12.5px] font-semibold text-brand shadow-xs">
                  {t("hubCountWorks", { count: totalWorks })}
                </span>
              </>
            ) : null
          }
        />

        {authors.length === 0 ? (
          <CollectionEmptyState
            title={t("hubEmpty")}
            description={t("hubIntro")}
            action={{ label: t("breadcrumbHome"), href: "/" }}
          />
        ) : (
          <>
            {/* Progressive DOM filtering island with search & alphabetical index */}
            <AuthorDirectoryFilter
              listId="author-directory"
              label={t("hubSearchLabel")}
              placeholder={t("hubSearchPlaceholder")}
              noMatches={t("hubNoMatches")}
              clearLabel={t("worksClearSearch")}
              availableLetters={availableLetters}
              allLetterLabel={t("hubAlphabetAll")}
              khmerLetterLabel={t("hubAlphabetKhmer")}
              alphabetNavLabel={t("hubAlphabetNav")}
            />

            {/* Academic Directory Grid: 2-3 columns on tablet/desktop, compact rows on mobile */}
            <ul id="author-directory" className="grid gap-2.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
              {authors.map((author) => {
                const node = soleContributorNode(contributorNodes(author.name, org));
                const isOrg = !!(node && "@type" in node && node["@type"] === "Organization");
                const kind = isOrg ? "organization" : node ? "author" : null;
                const firstChar = author.name.trim()[0]?.toUpperCase() ?? "";
                const isKhmer = /[\u1780-\u17FF]/.test(author.name);

                return (
                  <li
                    key={author.slug}
                    data-author-key={authorFilterKey(author.name, author.nameKm)}
                    data-letter={firstChar}
                    data-is-khmer={isKhmer ? "true" : "false"}
                  >
                    <Link
                      href={`/authors/${author.slug}`}
                      className="group focus-field flex h-full flex-col justify-between rounded-xl border border-divider bg-bg-surface p-3.5 transition-all duration-150 hover:border-brand/40 hover:bg-paper/50 sm:p-4"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            {kind && (
                              <EntityBadge
                                kind={kind}
                                labels={{
                                  author: t("entityAuthor"),
                                  organization: t("entityOrganization"),
                                }}
                                className="mb-1.5"
                              />
                            )}
                            <h2 className="text-[15px] font-bold leading-snug text-text-heading transition-colors group-hover:text-brand">
                              {author.name}
                            </h2>
                            {author.nameKm && author.nameKm !== author.name && (
                              <p
                                lang="km"
                                className="mt-1 font-khmer-serif text-[13px] leading-relaxed text-text-muted"
                              >
                                {author.nameKm}
                              </p>
                            )}
                          </div>
                          <ArrowUpRight
                            className="h-4 w-4 shrink-0 text-text-muted/50 transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand"
                            aria-hidden="true"
                          />
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-divider/60 pt-2.5">
                        <span className="text-[12px] font-semibold text-text-muted">
                          {t("hubCountWorks", { count: author.workCount })}
                        </span>
                      </div>
                    </Link>
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

