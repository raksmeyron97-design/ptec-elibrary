// components/ui/home/LatestPostsSection.tsx
// Homepage band 4: News (left, 8/12) and the contribution card (right, 4/12).
//
// The fetch lives in lib/home-data.ts rather than here. This component used to
// run its own uncached service-client query against `posts` with a different
// visibility predicate (`is_published`) from the one the homepage's other post
// fetcher used (`status`), so two bands on one screen could disagree about
// which posts were live. One fetcher, one predicate, one cache tag.
//
// With no published posts the band keeps its contribution card, full width,
// and the card's title becomes the band's heading — the invitation does not
// depend on there being news.
import { getTranslations } from "next-intl/server";
import LatestPosts from "./LatestPosts";
import GrowTheCollection from "./GrowTheCollection";
import { HomeSection, SectionHeader, SectionMobileLink } from "./HomeSection";
import { getLatestPostsCached } from "@/lib/home-data";

export default async function LatestPostsSection() {
  const [posts, t] = await Promise.all([getLatestPostsCached(), getTranslations("home")]);
  const hasPosts = posts.length > 0;
  const viewAll = { href: "/posts", label: t("viewAllPosts") };

  return (
    <HomeSection surface="paper" labelledBy={hasPosts ? "latest-posts-title" : "grow-title"}>
      {hasPosts && (
        <SectionHeader
          id="latest-posts-title"
          eyebrow={t("stayUpdated")}
          title={t("latestInsights")}
          lede={t("discoverLatest")}
          action={viewAll}
        />
      )}
      <div className={hasPosts ? "grid gap-8 lg:grid-cols-[8fr_4fr]" : ""}>
        {hasPosts && (
          <div>
            <LatestPosts posts={posts} />
            <SectionMobileLink {...viewAll} />
          </div>
        )}
        <GrowTheCollection headingLevel={hasPosts ? "h3" : "h2"} />
      </div>
    </HomeSection>
  );
}
