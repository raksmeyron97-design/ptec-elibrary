import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import ThesisBrowseView from "@/components/ui/theses/ThesisBrowseView";
import { getThesisProgramGroups, programName } from "@/lib/theses/browse.server";
import { localeAlternates } from "@/lib/seo/alternates";
import { buildOpenGraph, buildTwitter } from "@/lib/seo/open-graph";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { SITE_URL } from "@/lib/seo/site";
import { brandSuffixFor } from "@/lib/seo/brand";
import { fitDescription, fitTitle } from "@/lib/seo/text-fit";
import { getOrgIdentity } from "@/lib/system-settings/config";

// /theses/program/<programme> (SEO Phase 3.5): every thesis of one programme,
// once it holds THESIS_BROWSE_MIN_WORKS of them (lib/theses/browse.ts); below
// that the page does not exist. Runtime ISR, like the thesis pages it links to.
export const revalidate = 3600;
export function generateStaticParams() {
  return [];
}

type PageProps = { params: Promise<{ program: string; locale: string }> };

async function programGroup(raw: string) {
  let segment = raw;
  try {
    segment = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return (await getThesisProgramGroups()).find((g) => g.key === segment) ?? null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { program, locale } = await params;
  setRequestLocale(locale);
  const group = await programGroup(program);
  if (!group) notFound();
  const [t, org, name] = await Promise.all([
    getTranslations({ locale, namespace: "theses" }),
    getOrgIdentity(),
    programName(group.key, locale),
  ]);
  const title = t("browseProgramTitle", { program: name });
  const description = fitDescription(t("browseProgramDescription", { program: name, count: group.count }), locale);
  const alternates = localeAlternates(`/theses/program/${group.key}`, locale);
  const openGraph = buildOpenGraph({ locale, org, title, description, type: "website", url: alternates.canonical });
  return {
    title: fitTitle(title, { locale, brandSuffix: brandSuffixFor(org, locale) }),
    description,
    alternates,
    openGraph,
    twitter: buildTwitter({ card: "summary_large_image", title, description, images: openGraph.images }),
  };
}

export default async function ThesisProgramPage({ params }: PageProps) {
  const { program, locale } = await params;
  setRequestLocale(locale);
  const group = await programGroup(program);
  if (!group) notFound();
  const [t, tNav, name] = await Promise.all([
    getTranslations({ locale, namespace: "theses" }),
    getTranslations({ locale, namespace: "nav" }),
    programName(group.key, locale),
  ]);
  const heading = t("browseProgramTitle", { program: name });
  const pageUrl = `${SITE_URL}${locale === "km" ? "/km" : ""}/theses/program/${group.key}`;
  return (
    <ThesisBrowseView
      heading={heading}
      description={t("browseProgramDescription", { program: name, count: group.count })}
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
