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
  formatDateParts,
  formatEventDateRange,
  formatEventTime,
} from "@/lib/posts/event-status";
import { categoryPlaceholder } from "./postStyles";
import DateBlock from "./DateBlock";
import EventStatusBadge from "./EventStatusBadge";
import { ClockIcon, PinIcon } from "./icons";

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
  const dateParts = formatDateParts(post.event?.startAt ?? post.publishedAt, locale);

  return (
    <Link
      href={`/posts/${post.slug}`}
      className="group flex h-full flex-col rounded-xl border border-divider bg-bg-surface no-underline transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-[0_8px_24px_rgba(11,21,48,0.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-app motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      {/* Thumbnail. The wrapper does NOT clip: the date plate hangs below the
          image edge, and an overflow-hidden here sheared its lower half off. */}
      <div className="relative flex-none" style={{ aspectRatio: "16 / 9" }}>
        <div className="absolute inset-0 overflow-hidden rounded-t-xl">
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

        {isEvent && eventStatus && (
          <EventStatusBadge
            status={eventStatus}
            label={t(`eventStatus.${eventStatus}` as never)}
            className="absolute right-3 top-3 z-10 shadow-sm"
          />
        )}

        {/* The date, affixed to the photograph like a stamp on a filed
            document. Putting it here rather than in the text column matters
            for Khmer specifically: the block is ~56px wide, and taking that
            out of a 330px card left the title a column too narrow for a
            script that cannot hyphenate.

            For an event the stamp carries the EVENT date, not the publication
            date — when a ceremony happens is the fact a reader is scanning
            for; when the notice was posted is not. */}
        {dateParts && (
          <span className="absolute bottom-3 left-3 z-10 rounded-md bg-plate/95 px-3 py-2 shadow-[0_4px_14px_rgba(11,21,48,0.35)] backdrop-blur-[2px]">
            <DateBlock parts={dateParts} tone="light" size="sm" />
          </span>
        )}
        </div>
      </div>

      {/* Body — full width for the title; pt clears the date plate. */}
      <div className="flex flex-1 flex-col p-5">
        <span className="mb-2 font-sans text-[10.5px] font-semibold uppercase tracking-[0.16em] text-brand">
          {categoryLabel}
        </span>

        {/* leading-[1.5]: Khmer stacks vowel signs above and subscript
            consonants below the baseline, so the `leading-snug` (1.375) this
            used to carry made two-line titles collide. */}
        <h3 className="m-0 line-clamp-3 font-khmer-serif text-[17px] font-bold leading-[1.5] text-text-heading transition-colors group-hover:text-brand">
          {post.title}
        </h3>

        {isEvent ? (
          <div className="mt-3 space-y-1 text-[13px] text-text-body">
            <span className="flex items-start gap-1.5">
              <ClockIcon className="mt-0.5 shrink-0 text-brand" />
              <span className="min-w-0">
                {formatEventDateRange(post.event!.startAt, post.event!.endAt, locale)}
                {post.event!.startAt && (
                  <span className="ml-1.5 text-text-muted">
                    {formatEventTime(post.event!.startAt, locale)}
                  </span>
                )}
              </span>
            </span>
            {(post.event!.location || formatLabel) && (
              <span className="flex items-start gap-1.5 text-text-muted">
                <PinIcon className="mt-0.5 shrink-0" />
                <span className="line-clamp-1 min-w-0">
                  {post.event!.location || formatLabel}
                  {post.event!.location && formatLabel && <span> · {formatLabel}</span>}
                </span>
              </span>
            )}
          </div>
        ) : (
          post.excerpt && (
            <p className="m-0 mt-3 line-clamp-2 text-[13.5px] leading-[1.7] text-text-body">
              {post.excerpt}
            </p>
          )
        )}
      </div>
    </Link>
  );
}
