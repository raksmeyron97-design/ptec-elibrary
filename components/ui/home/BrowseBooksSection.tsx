import { getRecentlyAddedCached, getDeptBooksCached } from "@/lib/home-data";
import BookShowcaseTabs from "./BookShowcaseTabs";
import { toBookCardList, type BookCardData } from "@/lib/books/card-data";
import { getTranslations } from "next-intl/server";
import { HomeSection, SectionHeader } from "./HomeSection";

export default async function BrowseBooksSection({ trendingBooks }: { trendingBooks: BookCardData[] }) {
  const [recentlyAdded, { depts, deptBooks }, t] = await Promise.all([
    getRecentlyAddedCached(),
    getDeptBooksCached(),
    getTranslations("home"),
  ]);

  // Homepage preview keeps a tight, readable set — no more than 8 cards per tab
  // (brief), rendered 4-per-row on desktop. Only the shown slice is serialized
  // to the client, so we cap here rather than hide with CSS.
  const PREVIEW = 8;
  // Narrowed as well as sliced. The cap decided HOW MANY book objects cross
  // into the client; toBookCardList decides HOW BIG each one is, which is the
  // half that was missing — `summary` alone was 31 KB of the production
  // homepage's payload, once per card, rendered nowhere.
  const trendingPreview = toBookCardList(trendingBooks.slice(0, PREVIEW));
  const recentPreview = toBookCardList(recentlyAdded.slice(0, PREVIEW));
  const deptBooksPreview = Object.fromEntries(
    Object.entries(deptBooks).map(([k, v]) => [k, toBookCardList(v.slice(0, PREVIEW))]),
  );

  return (
    // The shared band shell and header, like every other band: the header
    // used to be drawn here by hand with <SectionTitle>, in Hanuman, while
    // the rest of the page's titles were the record serif.
    <HomeSection surface="surface" labelledBy="browse-books-title">
      <SectionHeader
        id="browse-books-title"
        eyebrow={t("browseSectionEyebrow")}
        title={t("browseSectionTitle")}
      />
      <BookShowcaseTabs
        trending={trendingPreview}
        recent={recentPreview}
        depts={depts}
        deptBooks={deptBooksPreview}
        layout="grid"
        maxItems={PREVIEW}
      />
    </HomeSection>
  );
}
