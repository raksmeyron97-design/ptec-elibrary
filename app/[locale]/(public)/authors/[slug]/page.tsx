import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { decodeSlugParam } from "@/lib/slug";
import JsonLd from "@/components/seo/JsonLd";
import Icon from "@/components/ui/core/Icon";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { SITE_URL } from "@/lib/seo/site";
import { getOrgIdentity } from "@/lib/system-settings/config";
import { localeAlternates } from "@/lib/seo/alternates";

import { getAuthorProfile } from "@/lib/authors/profile";
import { authorStats } from "@/lib/authors/stats";
import { authorLinks } from "@/lib/authors/links";
import AuthorHero from "@/components/ui/authors/AuthorHero";
import AuthorAbout from "@/components/ui/authors/AuthorAbout";
import ResearchInterests from "@/components/ui/authors/ResearchInterests";
import AuthorWorksList from "@/components/ui/authors/AuthorWorksList";

export const revalidate = 3600;

type PageProps = { params: Promise<{ slug: string; locale: string }> };

function truncate(text: string | null | undefined, max = 155): string {
  const clean = text?.replace(/\s+/g, " ").trim() ?? "";
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug: rawSlug, locale } = await params;
  const slug = decodeSlugParam(rawSlug);
  const [author, t] = await Promise.all([
    getAuthorProfile(slug),
    getTranslations({ locale, namespace: "authors" }),
  ]);
  if (!author) return { title: t("notFoundTitle"), robots: { index: false, follow: true } };

  const org = await getOrgIdentity();
  const title = `${author.name} — ${t("eyebrow")}`;
  // The biography when there is one; otherwise a factual sentence, never an
  // invented description of who this person is.
  const description =
    truncate(author.bio) || t("metaDescription", { name: author.name });
  const alternates = localeAlternates(`/authors/${author.slug}`, locale);

  return {
    title,
    description,
    alternates,
    openGraph: {
      title,
      description,
      type: "profile",
      url: alternates.canonical,
      siteName: org.siteName,
      ...(author.photoUrl ? { images: [{ url: author.photoUrl, alt: author.name }] } : {}),
    },
    twitter: {
      // "summary" either way: a portrait is a square thumbnail, not a
      // large_image hero, and a profile with no photo has nothing to enlarge.
      card: "summary",
      title,
      description,
      ...(author.photoUrl ? { images: [author.photoUrl] } : {}),
    },
  };
}

export default async function AuthorPage({ params }: PageProps) {
  const { slug: rawSlug, locale } = await params;
  const slug = decodeSlugParam(rawSlug);

  const [author, t] = await Promise.all([
    getAuthorProfile(slug),
    getTranslations("authors"),
  ]);
  if (!author) notFound();

  const stats = authorStats(author.works);
  const links = authorLinks({
    orcid: author.orcid,
    websiteUrl: author.websiteUrl,
    googleScholarUrl: author.googleScholarUrl,
    researchGateUrl: author.researchGateUrl,
  });

  const canonical =
    locale === "km"
      ? `${SITE_URL}/km/authors/${author.slug}`
      : `${SITE_URL}/authors/${author.slug}`;

  // ── Person structured data ────────────────────────────────────────────────
  //
  // Every property is omitted rather than guessed. `sameAs` carries only the
  // external profiles that passed URL validation (lib/authors/links.ts), so a
  // malformed ORCID or a librarian's note typed into the website field never
  // becomes a machine-readable claim about who this person is. `knowsAbout`
  // comes from the author's own stated interests, never from their works'
  // keywords — that would be an inference, and Google treats structured data
  // as an assertion.
  const personSchema = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url: canonical,
    mainEntity: {
      "@type": "Person",
      "@id": `${canonical}#person`,
      name: author.name,
      ...(author.bio ? { description: truncate(author.bio, 300) } : {}),
      ...(author.photoUrl ? { image: author.photoUrl } : {}),
      ...(author.positionTitle ? { jobTitle: author.positionTitle } : {}),
      ...(author.affiliation
        ? { affiliation: { "@type": "Organization", name: author.affiliation } }
        : {}),
      ...(links.length > 0 ? { sameAs: links.map((l) => l.href) } : {}),
      ...(author.researchInterests.length > 0
        ? { knowsAbout: author.researchInterests }
        : {}),
    },
  };

  // Points at the author hub now that one exists. It used to point at
  // /publications while the crumb read "Authors" — in the visible nav AND in
  // the emitted BreadcrumbList, which made it a machine-readable claim that
  // this profile lived in the publications collection
  // (docs/SEO-V2-AUDIT.md F-5).
  const breadcrumbs = breadcrumbSchema([
    { name: t("breadcrumbHome"), path: "/" },
    { name: t("breadcrumbAuthors"), path: "/authors" },
    { name: author.name },
  ]);

  const hasAside = !!(author.bio || author.bioKm) || author.researchInterests.length > 0;

  return (
    <main className="min-h-screen bg-bg-body px-4 py-8 sm:px-6 sm:py-10 md:px-12">
      <JsonLd data={personSchema} />
      <JsonLd data={breadcrumbs} />

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
            href="/authors"
            className="focus-field rounded-sm transition-colors hover:text-brand"
          >
            {t("breadcrumbAuthors")}
          </Link>
          <Icon name="chevron-right" className="text-[16px] text-divider" />
          <span className="max-w-[220px] truncate font-semibold text-text-heading sm:max-w-none">
            {author.name}
          </span>
        </nav>

        <AuthorHero
          author={author}
          stats={stats}
          labels={{
            eyebrow: t("eyebrow"),
            stats: {
              works: t("statWorks"),
              span: t("statSpan"),
              types: t("statTypes"),
            },
            links: {
              orcid: t("linkOrcid"),
              website: t("linkWebsite"),
              scholar: t("linkScholar"),
              researchgate: t("linkResearchgate"),
            },
          }}
        />

        {/* The narrative half of the profile. Absent entirely for an author
            the library knows only as a name — no empty "About" heading, no
            placeholder biography. */}
        {hasAside && (
          <div className="mb-12 space-y-8 border-t border-divider pt-8">
            <AuthorAbout
              heading={t("about")}
              bio={author.bio}
              bioKm={author.bioKm}
              labels={{ more: t("readMore"), less: t("readLess") }}
            />
            <ResearchInterests
              heading={t("researchInterests")}
              interests={author.researchInterests}
              searchLabel={(topic) => t("searchTopic", { topic })}
            />
          </div>
        )}

        {/* The main body: what this person wrote. */}
        <section aria-labelledby="author-works-heading" className="border-t border-divider pt-8">
          <h2
            id="author-works-heading"
            className="mb-6 text-[20px] font-bold tracking-tight text-text-heading sm:text-[22px]"
          >
            {t("worksHeading")}
          </h2>

          <AuthorWorksList
            works={author.works}
            counts={stats.byType}
            labels={{
              searchPlaceholder: t("worksSearchPlaceholder"),
              searchLabel: t("worksSearchLabel"),
              clearSearch: t("worksClearSearch"),
              filterLabel: t("worksFilterLabel"),
              all: t("worksAll"),
              types: {
                publication: t("typePublication"),
                thesis: t("typeThesis"),
                ebook: t("typeEbook"),
                catalog: t("typeCatalog"),
              },
              noResults: t("worksNoResults"),
              noResultsHint: t("worksNoResultsHint"),
              empty: t("worksEmpty"),
              undated: t("worksUndated"),
              downloadable: t("accessDownloadable"),
              readOnly: t("accessReadOnly"),
              // The count is client state, so the live number cannot be
              // formatted here. Passing the literal "{count}" through ICU
              // yields the translated sentence with its placeholder intact,
              // which the list substitutes once it knows the figure.
              resultCount: t("worksResultCount", { count: "{count}" }),
            }}
          />
        </section>
      </div>
    </main>
  );
}
