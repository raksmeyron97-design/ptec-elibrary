// components/ui/home/LatestPosts.tsx
// The left column of the homepage News band: the newest post as a feature
// card led by a date plate, then up to three compact rows.
//
// No cover images. The date is what makes news news, and printing it large on
// the plate gives every post the same strong opening whether or not an editor
// uploaded a picture — the old cards fell back to a gradient with the title
// written on it twice.
import { Link } from "@/i18n/navigation";
import { useTranslations, useLocale } from "next-intl";
import { ArrowRight } from "lucide-react";
import { formatDateParts, formatPtecDate } from "@/lib/posts/event-status";

export type LatestPost = {
  id: string;
  title: string;
  slug: string;
  category: string;
  excerpt: string | null;
  coverUrl: string | null;
  author: string;
  createdAt: string | null;
  views: number;
};

/** Most posts the band shows: the feature card plus three rows. */
export const LATEST_POSTS_SHOWN = 4;

const CATEGORY_KEY: Record<string, string> = {
  Research: "categoryResearch",
  Announcement: "categoryAnnouncement",
  Event: "categoryEvent",
  Journal: "categoryJournal",
};

/** The navy date block. `size` = the feature card's plate or a row's 64 px one. */
function DatePlate({ iso, size }: { iso: string | null; size: "feature" | "row" }) {
  const locale = useLocale();
  const parts = formatDateParts(iso, locale);
  if (!parts) return null;
  const feature = size === "feature";
  // Khmer month names are not cased, and tracking breaks their stacked marks.
  const monthType = locale === "km" ? "tracking-normal" : "uppercase tracking-[0.14em]";
  return (
    <span
      aria-hidden
      className={`relative flex shrink-0 flex-col items-center justify-center overflow-hidden rounded-lg bg-plate text-center ${
        feature ? "h-[104px] w-[84px] pb-1 sm:h-[132px] sm:w-[112px]" : "h-16 w-16 pb-0.5"
      }`}
    >
      <span className={`font-serif font-semibold leading-none text-white ${feature ? "text-[34px] sm:text-[44px]" : "text-[24px]"}`}>
        {parts.day}
      </span>
      <span className={`mt-1 font-bold text-gold-400 ${monthType} ${feature ? "text-[13px]" : "text-[10.5px]"}`}>
        {parts.month}
      </span>
      {feature && <span className="mt-0.5 text-[12px] text-blue-100">{parts.year}</span>}
      <span className="absolute inset-x-0 bottom-0 h-[3px] bg-accent" />
    </span>
  );
}

export default function LatestPosts({ posts }: { posts: LatestPost[] }) {
  const t = useTranslations("home");
  const tPosts = useTranslations("posts");
  const locale = useLocale();

  if (!posts || posts.length === 0) return null;

  const [featured, ...rest] = posts.slice(0, LATEST_POSTS_SHOWN);
  const category = (c: string) => tPosts(CATEGORY_KEY[c] ?? "categoryOther");

  return (
    <div className="min-w-0">
      {/* ── Feature card — the newest post ── */}
      <article className="group relative flex gap-4 rounded-xl border border-border bg-bg-surface p-4 shadow-sm sm:gap-5 transition duration-200 ease-[cubic-bezier(.22,1,.36,1)] hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-5">
        <DatePlate iso={featured.createdAt} size="feature" />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center rounded-full border border-info-line bg-info-soft px-2.5 py-0.5 text-[11.5px] font-bold text-info-text">
              {category(featured.category)}
            </span>
            <span className="text-[12.5px] text-text-muted">{formatPtecDate(featured.createdAt, locale)}</span>
          </div>
          {/* The title is the card's link, stretched over the card. */}
          <h3 className="mt-2 font-record text-[20px] font-bold leading-snug text-text-heading [text-wrap:balance] sm:text-[22px]">
            <Link
              href={`/posts/${featured.slug}`}
              className="rounded-sm transition-colors after:absolute after:inset-0 after:rounded-xl group-hover:text-brand focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-focus-ring/50"
            >
              {featured.title}
            </Link>
          </h3>
          {featured.excerpt && (
            <p className="mt-2 line-clamp-2 text-[14px] leading-relaxed text-text-muted">{featured.excerpt}</p>
          )}
          <span className="mt-auto inline-flex items-center gap-1.5 pt-3 text-[13.5px] font-semibold text-brand" aria-hidden>
            {t("readMore")}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </article>

      {/* ── Up to three more, as compact rows ── */}
      {rest.length > 0 && (
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-bg-surface shadow-sm">
          {rest.map((post) => (
            <li key={post.id}>
              <Link
                href={`/posts/${post.slug}`}
                className="group flex items-center gap-4 p-3 transition-colors hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring/50"
              >
                <DatePlate iso={post.createdAt} size="row" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[11.5px] font-bold text-accent-text">{category(post.category)}</span>
                  <span className="mt-0.5 line-clamp-2 text-[15px] font-semibold leading-snug text-text-heading transition-colors group-hover:text-brand">
                    {post.title}
                  </span>
                  <span className="sr-only"> — {formatPtecDate(post.createdAt, locale)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
