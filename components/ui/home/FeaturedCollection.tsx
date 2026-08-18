// components/ui/home/FeaturedCollection.tsx
//
// Section 3 — one featured set, replacing four overlapping shelves:
// "Featured" (carousel), "Popular with PTEC students", the "Trending" tab of
// "Browse the Collection", and "New and noteworthy"'s editor's pick. Between
// them those four drew from a 114-item collection and put /books/pisa-d on the
// page four times.
//
// The set arrives already chosen and already de-duplicated against the hero,
// from lib/home/payload.ts. This component only renders; it makes no data
// decisions, so the "no resource twice" rule has exactly one implementation.
//
// It is mixed-type on purpose. The library's single thesis and single
// publication have reserved slots here, which is what lets the hero stat strip
// drop the "1 theses / 1 publications" headline figures without those items
// becoming unreachable from the homepage.
import { Link } from "@/i18n/navigation";
import { ArrowRight } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import JsonLd from "@/components/seo/JsonLd";
import { absoluteUrl } from "@/lib/seo/site";
import { hrefOf, type HomeResourceItem } from "@/lib/home/payload";
import SectionHeader, { SECTION_SHELL } from "./SectionHeader";
import ResourceCard from "./ResourceCard";

/** Four per row on desktop, two on phones — sized so a phone never downloads a
 *  desktop-width cover. */
const COVER_SIZES = "(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 320px";

export default async function FeaturedCollection({
  items,
  surfaceClass,
}: {
  items: HomeResourceItem[];
  surfaceClass: string;
}) {
  const [t, tSearch, locale] = await Promise.all([
    getTranslations("home"),
    getTranslations("search"),
    getLocale(),
  ]);

  // Empty state: a titled section over blank space is worse than no section.
  // This only happens on a genuinely empty library or a total fetch failure —
  // in both cases the rest of the page still renders.
  if (items.length === 0) return null;

  const typeLabel = (type: HomeResourceItem["type"]): string => {
    if (type === "thesis") return tSearch("badgeThesis");
    if (type === "publication") return tSearch("badgePublication");
    return tSearch("badgeBook");
  };

  // ItemList so the featured set is legible to search engines as a collection
  // rather than eight unrelated links. The institutional @graph
  // (Organization / Library / WebSite) is emitted once site-wide in RootShell
  // and must not be repeated here.
  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: t("featuredTitle"),
    numberOfItems: items.length,
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.title,
      url: absoluteUrl(hrefOf(item)),
    })),
  };

  return (
    <section className={surfaceClass} aria-labelledby="featured-title">
      <JsonLd data={itemListSchema} />
      <div className={SECTION_SHELL}>
        <SectionHeader
          id="featured-title"
          eyebrow={t("featuredEyebrow")}
          title={t("featuredTitle")}
          body={t("featuredBody")}
          locale={locale}
          action={
            <Link
              href="/books"
              className="group hidden shrink-0 items-center gap-1.5 rounded-full border border-brand/30 bg-brand/[0.06] px-4 py-2 text-[13px] font-semibold text-brand transition-all hover:border-brand hover:bg-brand hover:text-brand-contrast focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:inline-flex"
            >
              {t("featuredViewAll")}
              <ArrowRight
                className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                aria-hidden
              />
            </Link>
          }
        />

        <ul className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
          {items.map((item, i) => (
            <li key={`${item.type}:${item.slug}`}>
              <ResourceCard
                item={item}
                typeLabel={typeLabel(item.type)}
                sizes={COVER_SIZES}
                // First row only. Everything below is lazy — this section can
                // sit at the fold on a tall desktop viewport.
                priority={i < 2}
              />
            </li>
          ))}
        </ul>

        <div className="mt-6 sm:hidden">
          <Link href="/books" className="inline-flex min-h-[44px] items-center gap-1.5 text-[14px] font-semibold text-brand">
            {t("featuredViewAll")}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
