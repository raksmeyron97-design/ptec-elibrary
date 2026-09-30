import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import ThesisBrowseView from "@/components/ui/theses/ThesisBrowseView";
import { getThesisYearGroups } from "@/lib/theses/browse.server";
import { localeAlternates } from "@/lib/seo/alternates";
import { buildOpenGraph, buildTwitter } from "@/lib/seo/open-graph";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { SITE_URL } from "@/lib/seo/site";
import { brandSuffixFor } from "@/lib/seo/brand";
import { fitDescription, fitTitle } from "@/lib/seo/text-fit";
import { getOrgIdentity } from "@/lib/system-settings/config";

// /theses/year/<yyyy> (SEO Phase 3.5): every thesis of one year, once the year
// holds THESIS_BROWSE_MIN_WORKS of them (lib/theses/browse.ts); below that the
// page does not exist. Runtime ISR, like the thesis pages it links to.
export const revalidate = 3600;
export function generateStaticParams() {
  return [];
}

type PageProps = { params: Promise<{ year: string; locale: string }> };

async function yearGroup(raw: string) {
  if (!/^\d{4}$/.test(raw)) return null;
  const year = Number(raw);
  return (await getThesisYearGroups()).find((g) => g.key === year) ?? null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { year, locale } = await params;
  setRequestLocale(locale);
  const group = await yearGroup(year);
  if (!group) notFound();
  const [t, org] = await Promise.all([getTranslations({ locale, namespace: "theses" }), getOrgIdentity()]);
  const title = t("browseYearTitle", { year: group.key });
  const description = fitDescription(t("browseYearDescription", { year: group.key, count: group.count }), locale);
  const alternates = localeAlternates(`/theses/year/${group.key}`, locale);
  const openGraph = buildOpenGraph({ locale, org, title, description, type: "website", url: alternates.canonical });
  return {
    title: fitTitle(title, { locale, brandSuffix: brandSuffixFor(org, locale) }),
    description,
    alternates,
    openGraph,
    twitter: buildTwitter({ card: "summary_large_image", title, description, images: openGraph.images }),
  };
}

export default async function ThesisYearPage({ params }: PageProps) {
  const { year, locale } = await params;
  setRequestLocale(locale);
  const group = await yearGroup(year);
  if (!group) notFound();
  const [t, tNav] = await Promise.all([
    getTranslations({ locale, namespace: "theses" }),
    getTranslations({ locale, namespace: "nav" }),
  ]);
  const heading = t("browseYearTitle", { year: group.key });
  const pageUrl = `${SITE_URL}${locale === "km" ? "/km" : ""}/theses/year/${group.key}`;
  return (
    <ThesisBrowseView
      heading={heading}
      description={t("browseYearDescription", { year: group.key, count: group.count })}
      rows={group.rows}
      crumbs={{ home: tNav("home"), theses: tNav("theses") }}
      jsonLd={[
        breadcrumbSchema(
          [{ name: tNav("home"), path: "/" }, { name: tNav("theses"), path: "/theses" }, { name: heading }],
          { locale, pageUrl },
        ),
        browseCollectionSchema(pageUrl, heading, locale, group.rows),
      ]}
    />
  );
}

/** CollectionPage + ItemList of exactly the works the page links to. */
function browseCollectionSchema(
  pageUrl: string,
  name: string,
  locale: string,
  rows: readonly { slug: string | null; title: string }[],
): Record<string, unknown> {
  const prefix = `${SITE_URL}${locale === "km" ? "/km" : ""}/theses/`;
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${pageUrl}#collection`,
    name,
    url: pageUrl,
    inLanguage: locale === "km" ? "km" : "en",
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: rows.length,
      itemListElement: rows.map((r, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: r.title,
        url: `${prefix}${encodeURIComponent(r.slug ?? "")}`,
      })),
    },
  };
}
