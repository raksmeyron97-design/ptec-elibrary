// components/ui/home/NewsAndArrivals.tsx
//
// Section 6 — "what has changed since you were last here", answered once.
//
// Merges two bands that answered it separately and overlapped constantly:
// "New and noteworthy" (a curated editorial strip: editor's pick, a
// publication, a learning path, the latest post) and "Just added to the
// library" (a chronological strip across all three digital types). The
// editorial half's items now live in their proper sections — the pick and the
// publication in Featured, the learning path in "Start with your goal" — and
// what is genuinely left is news plus accessions, which is two columns, not
// two sections.
//
// Both columns degrade independently: no posts renders the arrivals column
// alone and vice versa, and the section hides entirely only when both are
// empty. A failure in one is never allowed to blank the other.
import { Link } from "@/i18n/navigation";
import { ArrowRight, Newspaper, Sparkles } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import type { LatestPostRow } from "@/lib/home-data";
import type { HomeResourceItem } from "@/lib/home/payload";
import SectionHeader, { SECTION_SHELL } from "./SectionHeader";
import ResourceCard from "./ResourceCard";

const COVER_SIZES = "(max-width: 640px) 45vw, (max-width: 1024px) 22vw, 220px";

/**
 * Cambodia time, so "added" and "published" dates agree with the rest of the
 * site's clock (lib/library-hours.ts) rather than with the server's region.
 */
function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "km" ? "km-KH" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Phnom_Penh",
  }).format(new Date(iso));
}

function ColumnHeading({
  id,
  icon: Icon,
  children,
}: {
  id: string;
  icon: typeof Newspaper;
  children: React.ReactNode;
}) {
  return (
    <h3
      id={id}
      className="mb-4 flex items-center gap-2 font-khmer-serif text-[16px] font-bold text-text-heading"
    >
      <Icon className="h-4 w-4 shrink-0 text-brand" aria-hidden strokeWidth={2.1} />
      {children}
    </h3>
  );
}

export default async function NewsAndArrivals({
  posts,
  arrivals,
  surfaceClass,
}: {
  posts: LatestPostRow[];
  arrivals: HomeResourceItem[];
  surfaceClass: string;
}) {
  const [t, tSearch, locale] = await Promise.all([
    getTranslations("home"),
    getTranslations("search"),
    getLocale(),
  ]);

  if (posts.length === 0 && arrivals.length === 0) return null;

  const typeLabel = (type: HomeResourceItem["type"]): string => {
    if (type === "thesis") return tSearch("badgeThesis");
    if (type === "publication") return tSearch("badgePublication");
    return tSearch("badgeBook");
  };

  return (
    <section className={surfaceClass} aria-labelledby="news-arrivals-title">
      <div className={SECTION_SHELL}>
        <SectionHeader
          id="news-arrivals-title"
          eyebrow={t("newsEyebrow")}
          title={t("newsTitle")}
          body={t("newsBody")}
          locale={locale}
          accent="accent"
        />

        {/* 5/7 split: the arrivals grid needs two card columns to look
            intentional, the news list does not. */}
        <div className="grid gap-8 lg:grid-cols-12 lg:gap-10">
          {/* ── News ── */}
          {posts.length > 0 && (
            <div className="lg:col-span-5">
              <ColumnHeading id="news-col-title" icon={Newspaper}>
                {t("newsPostsHeading")}
              </ColumnHeading>
              <ul className="flex flex-col gap-3" aria-labelledby="news-col-title">
                {posts.map((post) => {
                  const date = post.published_at ?? post.created_at;
                  return (
                    <li key={post.id}>
                      <Link
                        href={`/posts/${post.slug}`}
                        prefetch={false}
                        className="group flex flex-col rounded-2xl border border-divider bg-paper p-4 transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[0_8px_28px_-10px_rgba(11,21,53,0.2)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:p-5"
                      >
                        {date && (
                          <span className="text-[11.5px] font-semibold text-text-muted">
                            {formatDate(date, locale)}
                          </span>
                        )}
                        <span
                          title={post.title}
                          className="mt-1 font-khmer-serif text-[15px] font-bold leading-[1.5] text-text-heading line-clamp-2 transition-colors group-hover:text-brand"
                        >
                          {post.title}
                        </span>
                        {post.excerpt && (
                          <span className="mt-1.5 text-[12.5px] leading-relaxed text-text-muted line-clamp-2">
                            {post.excerpt}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <Link
                href="/posts"
                className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 text-[13.5px] font-semibold text-brand transition-colors hover:text-brand-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand rounded-sm"
              >
                {t("newsAllPosts")}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          )}

          {/* ── New arrivals ── */}
          {arrivals.length > 0 && (
            <div className={posts.length > 0 ? "lg:col-span-7" : "lg:col-span-12"}>
              <ColumnHeading id="arrivals-col-title" icon={Sparkles}>
                {t("newsArrivalsHeading")}
              </ColumnHeading>
              <ul
                aria-labelledby="arrivals-col-title"
                // A single arrival must not stretch to full width and read as a
                // broken grid, so the columns are fixed and the row is left-aligned.
                className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
              >
                {arrivals.map((item) => (
                  <li key={`${item.type}:${item.slug}`}>
                    <ResourceCard
                      item={item}
                      typeLabel={typeLabel(item.type)}
                      variant="compact"
                      sizes={COVER_SIZES}
                      footnote={
                        item.addedAt
                          ? t("newArrivalsAdded", { date: formatDate(item.addedAt, locale) })
                          : undefined
                      }
                    />
                  </li>
                ))}
              </ul>
              <Link
                href="/books?sort=newest"
                className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 text-[13.5px] font-semibold text-brand transition-colors hover:text-brand-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand rounded-sm"
              >
                {t("newsAllArrivals")}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
