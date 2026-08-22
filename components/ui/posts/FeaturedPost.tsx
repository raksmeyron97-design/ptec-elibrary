// Deliberately NOT a client component — see the note in PostCard.tsx for why
// (pure presentation, and keeping Intl date formatting server-side avoids a
// real hydration mismatch some headless/minimal browsers hit on km-KH).
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
import EventStatusBadge from "./EventStatusBadge";
import { ClockIcon, PinIcon } from "./icons";

/**
 * The single, data-driven featured story, set as a NAVY PLATE.
 *
 * Every ceremony photograph the college publishes has the same object in it: a
 * printed backdrop banner, gold Khmer display type centred on a deep colour
 * field, ruled top and bottom. That banner is the vernacular of this world, so
 * the lead item borrows its construction — navy ground, a single gold hairline,
 * the title in Angkor (the Khmer display face already loaded for post pages).
 *
 * This is the one loud element on the page. Everything below it is deliberately
 * quiet so this reads as the lead and not as more chrome.
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
  const dateParts = formatDateParts(post.publishedAt, locale);

  return (
    <Link
      href={`/posts/${post.slug}`}
      aria-label={`${t("featuredBadge")}: ${post.title}`}
      className="group relative grid overflow-hidden rounded-xl bg-plate no-underline transition-shadow duration-300 hover:shadow-[0_16px_44px_rgba(11,21,48,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-app md:grid-cols-[1fr_1.05fr] motion-reduce:transition-none"
    >
      {/* The banner's top rule. */}
      <span aria-hidden="true" className="absolute inset-x-0 top-0 z-20 h-[3px] bg-accent" />

      {/* Content — first in the DOM so the heading precedes the image. */}
      <div className="relative order-2 flex flex-col justify-center gap-5 p-7 sm:p-9 md:order-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="font-sans text-[10.5px] font-semibold uppercase tracking-[0.2em] text-accent">
            {t("featuredBadge")}
          </span>
          <span aria-hidden="true" className="h-3 w-px bg-white/25" />
          <span className="font-sans text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/80">
            {categoryLabel}
          </span>
          {isEvent && eventStatus && (
            <EventStatusBadge status={eventStatus} label={t(`eventStatus.${eventStatus}` as never)} />
          )}
        </div>

        {/* The date block was here, beside the title. It is the signature of
            the cards below and of the detail dateline, but on the lead it sat
            cramped at 11px against 30px Angkor and restated the date printed
            in the meta row three lines lower. The title gets the full measure
            instead. */}
        <h2 className="m-0 line-clamp-3 font-title text-[clamp(21px,2.5vw,30px)] leading-[1.45] text-white transition-colors group-hover:text-accent">
          {post.title}
        </h2>

        {isEvent ? (
          <div className="space-y-1.5 text-sm text-white/75">
            <span className="flex items-start gap-2">
              <ClockIcon className="mt-0.5 shrink-0 text-accent" />
              <span>
                {formatEventDateRange(post.event!.startAt, post.event!.endAt, locale)}
                {post.event!.startAt && (
                  <span className="ml-1.5 text-white/55">
                    {formatEventTime(post.event!.startAt, locale)}
                  </span>
                )}
              </span>
            </span>
            {(post.event!.location || formatLabel) && (
              <span className="flex items-start gap-2 text-white/60">
                <PinIcon className="mt-0.5 shrink-0" />
                <span>
                  {post.event!.location || formatLabel}
                  {post.event!.location && formatLabel && <span> · {formatLabel}</span>}
                </span>
              </span>
            )}
          </div>
        ) : (
          <>
            {post.excerpt && (
              <p className="m-0 line-clamp-3 text-[15px] leading-[1.8] text-white/75">
                {post.excerpt}
              </p>
            )}
            {dateParts && (
              <p className="m-0 font-sans text-[13px] tracking-wide text-white/55">
                {dateParts.day} {dateParts.month} {dateParts.year}
              </p>
            )}
          </>
        )}
      </div>

      {/* Image */}
      <div className="relative order-1 aspect-[16/10] overflow-hidden md:order-2 md:aspect-auto md:min-h-[340px]">
        {post.coverUrl ? (
          <Image
            src={post.coverUrl}
            alt={post.coverAlt ?? ""}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 52vw"
            className="object-cover transition-transform duration-700 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center p-8"
            style={{ background: placeholder.bg }}
          >
            <span
              className="text-center font-khmer-serif text-2xl font-bold leading-[1.5]"
              style={{ color: placeholder.text }}
            >
              {post.title}
            </span>
          </div>
        )}
        {/* The photo is joined to the plate rather than boxed beside it. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-plate/80 via-plate/10 to-transparent md:bg-gradient-to-r md:from-plate md:via-plate/30 md:to-transparent"
        />
      </div>
    </Link>
  );
}
