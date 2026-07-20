// Deliberately NOT a client component: this card is pure presentation (a link
// with CSS-only hover states), and `useTranslations` from "next-intl" works
// here without "use client" (see Pagination.tsx for the same pattern). Staying
// server-rendered also means the event/publish dates below — Intl-formatted in
// Asia/Phnom_Penh — are computed once with Node's full ICU data and never
// re-run in the browser. Some headless/minimal Chromium builds ship without
// Khmer ICU data and silently fall back to English, which caused a real
// hydration mismatch when this used to be a client component calling
// useLocale() + Intl itself.
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
 * A standard News & Events card. Renders an event variant (date, time,
 * location, status) when the post carries event fields, or a news variant
 * (excerpt + date) otherwise. The whole card is a single link — no nested
 * interactive elements — so it stays valid and keyboard-focusable as one target.
 *
 * `eventStatus` is computed by the caller with request time and passed in, so
 * the status never differs between server render and hydration.
 */
export default function PostCard({
  post,
  eventStatus,
  locale,
  priority = false,
}: {
  post: PostListItem;
  eventStatus: EventStatus | null;
  locale: string;
  priority?: boolean;
}) {
  const t = useTranslations("posts");
  const isEvent = !!post.event;
  const placeholder = categoryPlaceholder(post.category);
  const categoryLabel = t(`category${post.category}` as never);

  const formatLabel =
    post.event?.format &&
    t(`eventFormat.${post.event.format}` as never);

  return (
    <Link
      href={`/posts/${post.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-divider bg-bg-surface no-underline shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-app motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      {/* Thumbnail */}
      <div className="relative flex-none overflow-hidden" style={{ aspectRatio: "16 / 9" }}>
        {post.coverUrl ? (
          <Image
            src={post.coverUrl}
            alt={post.coverAlt ?? ""}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            priority={priority}
            className="object-cover transition-transform duration-300 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center p-5"
            style={{ background: placeholder.bg }}
          >
            <span
              className="line-clamp-3 text-center font-khmer-serif text-lg font-bold leading-snug"
              style={{ color: placeholder.text }}
            >
              {post.title}
            </span>
          </div>
        )}

        {/* Category badge (top-left) */}
        <span
          className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide shadow-sm ${categoryBadge(post.category)}`}
        >
          {categoryLabel}
        </span>

        {/* Event status badge (top-right) */}
        {isEvent && eventStatus && (
          <EventStatusBadge
            status={eventStatus}
            label={t(`eventStatus.${eventStatus}` as never)}
            className="absolute right-3 top-3 shadow-sm"
          />
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-5">
        <h3 className="m-0 mb-2 line-clamp-2 font-khmer-serif text-lg font-bold leading-snug text-text-heading transition-colors group-hover:text-brand">
          {post.title}
        </h3>

        {isEvent ? (
          <div className="mb-3 space-y-1.5 text-sm text-text-body">
            <span className="flex items-start gap-2">
              <CalendarIcon className="mt-0.5 shrink-0 text-brand" />
              <span className="min-w-0">
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
                <span className="line-clamp-1 min-w-0">
                  {post.event!.location || formatLabel}
                  {post.event!.location && formatLabel && (
                    <span className="text-text-muted"> · {formatLabel}</span>
                  )}
                </span>
              </span>
            )}
          </div>
        ) : (
          post.excerpt && (
            <p className="m-0 mb-3 line-clamp-2 text-sm leading-relaxed text-text-body">
              {post.excerpt}
            </p>
          )
        )}

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-divider pt-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
            <CalendarIcon />
            {formatPtecDate(post.publishedAt, locale)}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-brand transition-all group-hover:gap-2.5">
            {isEvent ? t("viewEvent") : t("readMore")}
            <ArrowRightIcon />
          </span>
        </div>
      </div>
    </Link>
  );
}
