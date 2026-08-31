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
import { getListedAuthors } from "@/lib/authors/directory";

export const revalidate = 3600;

type PageProps = { params: Promise<{ locale: string }> };

/**
 * The author hub. Its absence is why /authors/[slug] breadcrumbs pointed at
 * /publications while reading "Authors" — there was nowhere truthful to send
 * a visitor (docs/SEO-V2-AUDIT.md F-4, F-5).
 *
 * Lists only authors with public work. The roster carries names and counts and
 * nothing else: `publication_authors` may hold a biography and an ORCID, but a
 * directory row is not the place to assert either, and an e-book author row has
 * neither to assert.
 */
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

  const breadcrumbs = breadcrumbSchema([
    { name: t("breadcrumbHome"), path: "/" },
    { name: t("breadcrumbAuthors") },
  ]);

  // ItemList of Person nodes carrying ONLY name and url. A directory knows a
  // person's name and where their page is; it does not know their job title or
  // affiliation, and /authors/[slug] is where those are asserted when they
  // exist. Repeating a thinner Person here would be a second, weaker claim
  // about the same entity.
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
      itemListElement: authors.map((a, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: {
          "@type": "Person",
          "@id": `${authorUrl(a.slug)}#person`,
          name: a.name,
          url: authorUrl(a.slug),
        },
      })),
    },
  };

  return (
    <main className="min-h-screen bg-bg-body px-4 py-10 sm:px-6 md:px-12">
      <JsonLd data={breadcrumbs} />
      {authors.length > 0 && <JsonLd data={collectionSchema} />}

      <div className="mx-auto max-w-5xl">
        <nav
          aria-label="Breadcrumb"
          className="mb-5 flex flex-wrap items-center gap-2 text-[13px] font-medium text-text-muted"
        >
          <Link href="/" className="focus-field rounded-sm transition-colors hover:text-brand">
            {t("breadcrumbHome")}
          </Link>
          <span aria-hidden="true">/</span>
          <span className="font-semibold text-text-heading">{t("breadcrumbAuthors")}</span>
        </nav>

        <header className="mb-8">
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-brand">
            {t("breadcrumbAuthors")}
          </p>
          <h1 className="mt-2 text-3xl font-bold text-text-heading sm:text-4xl">
            {t("hubTitle")}
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-7 text-text-muted">{t("hubIntro")}</p>
          {authors.length > 0 && (
            <p className="mt-3 text-[13px] font-semibold text-text-muted">
              {t("hubCountAuthors", { count: authors.length })} ·{" "}
              {t("hubCountWorks", { count: totalWorks })}
            </p>
          )}
        </header>

        {authors.length === 0 ? (
          <div className="rounded-2xl border border-divider bg-bg-surface p-8 text-center text-text-muted">
            {t("hubEmpty")}
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {authors.map((author) => (
              <li key={author.slug}>
                <Link
                  href={`/authors/${author.slug}`}
                  className="focus-field flex h-full flex-col rounded-xl border border-divider bg-bg-surface p-4 transition-colors hover:border-brand/40"
                >
                  <h2 className="text-[15px] font-bold text-text-heading">{author.name}</h2>
                  {/* The Khmer form of the name is a fact the record carries,
                      not a translation — shown whenever it exists, in either
                      locale, because it identifies the same person. */}
                  {author.nameKm && author.nameKm !== author.name && (
                    <p className="mt-0.5 font-khmer-serif text-[13px] text-text-muted">
                      {author.nameKm}
                    </p>
                  )}
                  <p className="mt-1.5 text-[12.5px] font-semibold text-brand">
                    {t("hubCountWorks", { count: author.workCount })}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
