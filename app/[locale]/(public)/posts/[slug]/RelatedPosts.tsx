import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import PostCard from "@/components/ui/posts/PostCard";
import { normalizeCategory } from "@/lib/admin/posts-shared";
import type { PostListItem } from "@/lib/posts-data";

/** The columns the detail page selects for its related-posts query. */
export interface RelatedPostRow {
  id: string;
  title: string;
  slug: string;
  cover_url: string | null;
  cover_urls: string[] | null;
  category: string;
  created_at: string | null;
}

/**
 * "More from News & Events" — the three most recent posts sharing this post's
 * category.
 *
 * This used to render its own card markup, which meant a second visual
 * language for the same object and a date pinned to "km-KH" for every reader.
 * It now renders the same <PostCard> the listing grid uses, so the two
 * surfaces can never drift apart again.
 */
export default async function RelatedPosts({
  posts,
  locale,
}: {
  posts: RelatedPostRow[];
  locale: string;
}) {
  const t = await getTranslations({ locale, namespace: "posts" });
  if (posts.length === 0) return null;

  // PostCard reads the listing's normalized shape. Related rows carry no
  // excerpt or event columns, so those stay null and the card renders its
  // news variant.
  const items: PostListItem[] = posts.map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    category: normalizeCategory(row.category),
    excerpt: null,
    coverUrl: row.cover_urls?.[0] ?? row.cover_url ?? null,
    coverAlt: row.title,
    author: "",
    publishedAt: row.created_at,
    featured: false,
    event: null,
  }));

  return (
    <section aria-labelledby="related-posts-heading" className="border-t border-divider bg-bg-surface">
      <div className="mx-auto max-w-[1180px] px-5 py-12">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="h-7 w-[5px] rounded-full bg-accent" aria-hidden="true" />
            <h2
              id="related-posts-heading"
              className="m-0 font-khmer-serif text-2xl font-bold text-text-heading"
            >
              {t("relatedPosts")}
            </h2>
          </div>
          <Link
            href="/posts"
            className="inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-brand no-underline transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
          >
            {t("backToPosts")}
          </Link>
        </div>

        {/* Three across on desktop; a snapping scroll row on narrow screens so
            the cards keep their proportions instead of squeezing to a strip. */}
        <ul className="-mx-5 flex snap-x snap-mandatory list-none gap-5 overflow-x-auto px-5 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3 [&::-webkit-scrollbar]:hidden">
          {items.map((post) => (
            <li key={post.id} className="w-[78vw] min-w-0 shrink-0 snap-start sm:w-auto sm:shrink">
              <PostCard post={post} eventStatus={null} locale={locale} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
