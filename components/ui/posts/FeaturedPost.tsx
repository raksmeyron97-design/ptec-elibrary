// Deliberately NOT a client component — see the note in PostCard.tsx for why
// (pure presentation, and keeping Intl date formatting server-side avoids a
// real hydration mismatch some headless/minimal browsers hit on km-KH).
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { useTranslations } from "next-intl";
import type { PostListItem } from "@/lib/posts-data";
import type { EventStatus } from "@/lib/posts/event-status";
import {
  formatPtecDate,
  formatEventDateRange,
  formatEventTime,
} from "@/lib/posts/event-status";
import { categoryBadge, categoryPlaceholder } from "./postStyles";
import EventStatusBadge from "./EventStatusBadge";
import { CalendarIcon, ClockIcon, PinIcon, ArrowRightIcon } from "./icons";

/**
 * The single, data-driven featured story. Editorial split on desktop
 * (~55% image / 45% content), stacked on mobile. The whole card is one link.
 * The parent only renders this when a featured post exists, so there is no
 * empty-state variant here.
 */
export default function FeaturedPost({
  post,
  eventStatus,
  locale,
}: {
  post: PostListItem;
  eventStatus: EventStatus | null;
  locale: string;
}) {
  const t = useTranslations("posts");
  const isEvent = !!post.event;
  const placeholder = categoryPlaceholder(post.category);
  const categoryLabel = t(`category${post.category}` as never);
  const formatLabel = post.event?.format && t(`eventFormat.${post.event.format}` as never);

  return (
    <Link
      href={`/posts/${post.slug}`}
      aria-label={`${t("featuredBadge")}: ${post.title}`}
      className="group grid overflow-hidden rounded-2xl border border-divider bg-bg-surface no-underline shadow-sm transition-all duration-200 hover:border-brand/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-app md:grid-cols-[1.15fr_1fr] motion-reduce:transition-none"
    >
      {/* Image */}
      <div className="relative aspect-[16/9] overflow-hidden md:aspect-auto md:min-h-[320px]">
        {post.coverUrl ? (
          <Image
            src={post.coverUrl}
            alt={post.coverAlt ?? ""}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 55vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center p-8"
            style={{ background: placeholder.bg }}
          >
            <span
              className="text-center font-khmer-serif text-2xl font-bold leading-snug"
              style={{ color: placeholder.text }}
            >
              {post.title}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-col justify-center gap-4 p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-accent-text">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            {t("featuredBadge")}
          </span>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${categoryBadge(post.category)}`}>
            {categoryLabel}
          </span>
          {isEvent && eventStatus && (
            <EventStatusBadge status={eventStatus} label={t(`eventStatus.${eventStatus}` as never)} />
          )}
        </div>

        <h2 className="m-0 line-clamp-3 font-khmer-serif text-[clamp(20px,2.4vw,28px)] font-bold leading-snug text-text-heading transition-colors group-hover:text-brand">
          {post.title}
        </h2>

        {isEvent ? (
          <div className="space-y-1.5 text-sm text-text-body">
            <span className="flex items-start gap-2">
              <CalendarIcon className="mt-0.5 shrink-0 text-brand" />
              <span>
                {formatEventDateRange(post.event!.startAt, post.event!.endAt, locale)}
                {post.event!.startAt && (
                  <span className="ml-1.5 inline-flex items-center gap-1 text-text-muted">
                    <ClockIcon />
                    {formatEventTime(post.event!.startAt, locale)}
                  </span>
                )}
              </span>
            </span>
            {(post.event!.location || formatLabel) && (
              <span className="flex items-start gap-2 text-text-muted">
                <PinIcon className="mt-0.5 shrink-0" />
                <span>
                  {post.event!.location || formatLabel}
                  {post.event!.location && formatLabel && <span> · {formatLabel}</span>}
                </span>
              </span>
            )}
          </div>
        ) : (
          post.excerpt && (
            <p className="m-0 line-clamp-2 text-[15px] leading-relaxed text-text-body sm:line-clamp-3">
              {post.excerpt}
            </p>
          )
        )}

        <div className="mt-1 flex items-center gap-4 text-sm">
          <span className="inline-flex items-center gap-1.5 text-text-muted">
            <CalendarIcon />
            {formatPtecDate(post.publishedAt, locale)}
          </span>
          <span className="inline-flex items-center gap-1.5 font-bold text-brand transition-all group-hover:gap-2.5">
            {isEvent ? t("viewEvent") : t("readArticle")}
            <ArrowRightIcon />
          </span>
        </div>
      </div>
    </Link>
  );
}
