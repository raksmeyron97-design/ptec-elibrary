import { getRecentlyAddedCached, getDeptBooksCached, getTrendingThesesCached } from "@/lib/home-data";
import BookShowcaseTabs from "./BookShowcaseTabs";
import ContinueReadingStrip from "./ContinueReadingStrip";
import { toBookCardList, type BookCardData } from "@/lib/books/card-data";
import { getTranslations } from "next-intl/server";
import { HomeSection, SectionHeader } from "./HomeSection";
import { SHELF_MAX_ITEMS, type ShelfThesis } from "./shelf";
import { HERO_SHELF_COUNT } from "./HeroShelf";

/**
 * The homepage's one shelf: Trending · Recently Added · Theses, with the
 * department chips on Trending, and — for a signed-in reader with a book in
 * progress — a Continue-reading strip above the tabs.
 *
 * Before the 2026-10 redesign this was four bands showing overlapping sets of
 * the same books (Popular, Browse, New this week, Trending research). One
 * band, three tabs, one panel: a book is on screen at most once.
 */
export default async function BrowseBooksSection({ trendingBooks }: { trendingBooks: BookCardData[] }) {
  const [recentlyAdded, { depts, deptBooks }, theses, t] = await Promise.all([
    getRecentlyAddedCached(),
    getDeptBooksCached(),
    getTrendingThesesCached(),
    getTranslations("home"),
  ]);

  // Only the shown slice is serialized to the client, so the cap is applied
  // here rather than hidden with CSS. toBookCardList decides how BIG each
  // item is — `summary` alone was 31 KB of the production homepage's payload
  // when whole books crossed this boundary.
  // Trending carries HERO_SHELF_COUNT extra books: at lg the hero's shelf
  // shows the top six, so the tab shows the next six there instead (see
  // BookShowcaseTabs `skipOnDesktop`); phones, which have no hero shelf, show
  // the top six.
  const trendingPreview = toBookCardList(trendingBooks.slice(0, SHELF_MAX_ITEMS + HERO_SHELF_COUNT));
  const recentPreview = toBookCardList(recentlyAdded.slice(0, SHELF_MAX_ITEMS));
  const deptBooksPreview = Object.fromEntries(
    Object.entries(deptBooks).map(([k, v]) => [k, toBookCardList(v.slice(0, SHELF_MAX_ITEMS))]),
  );
  // A thesis is not a book card (no cover, its page is /theses/<slug>), so it
  // travels as the few fields the shelf draws — see shelf.ts.
  const thesisItems: ShelfThesis[] = theses.slice(0, SHELF_MAX_ITEMS).map((row) => ({
    kind: "thesis",
    id: row.id,
    href: `/theses/${row.slug ?? row.id}`,
    title: row.title,
    author: row.author_names,
    typeLabel: t("recentTypeThesis"),
  }));

  return (
    <HomeSection surface="surface" labelledBy="browse-books-title">
      <SectionHeader
        id="browse-books-title"
        eyebrow={t("browseSectionEyebrow")}
        title={t("browseSectionTitle")}
      />
      <ContinueReadingStrip />
      <BookShowcaseTabs
        trending={trendingPreview}
        skipOnDesktop={HERO_SHELF_COUNT}
        recent={recentPreview}
        theses={thesisItems}
        depts={depts}
        deptBooks={deptBooksPreview}
      />
    </HomeSection>
  );
}
