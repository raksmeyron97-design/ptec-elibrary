import type { ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import {
  deriveEventStatus,
  isRegistrationOpen,
  formatEventDateRange,
  formatEventTime,
  type EventFields,
} from "@/lib/posts/event-status";
import EventStatusBadge from "./EventStatusBadge";
import { CalendarIcon, ClockIcon, PinIcon, ExternalLinkIcon, UsersIcon } from "./icons";

/** Google Calendar "add event" template URL (UTC, all-day-safe). */
function googleCalendarUrl(title: string, startIso: string, endIso: string | null): string {
  const fmt = (iso: string) =>
    new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const start = fmt(startIso);
  const end = endIso
    ? fmt(endIso)
    : fmt(new Date(new Date(startIso).getTime() + 60 * 60 * 1000).toISOString());
  const p = new URLSearchParams({ action: "TEMPLATE", text: title, dates: `${start}/${end}` });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/**
 * The event details card on a post's detail page. Server component: it derives
 * the status from request time and shows a registration action only when it is
 * genuinely open (never for ended / cancelled / postponed events, or past the
 * deadline). External links carry safe rel attributes.
 */
export default async function PostEventPanel({
  event,
  title,
}: {
  event: EventFields;
  title: string;
}) {
  const t = await getTranslations("posts");
  const locale = await getLocale();
  const now = new Date();
  const status = deriveEventStatus(event, now);
  if (!status) return null;

  const regOpen = isRegistrationOpen(event, now);
  const formatLabel = event.format ? t(`eventFormat.${event.format}` as never) : null;

  const rows: { icon: ReactNode; label: string; value: string }[] = [];
  if (event.startAt) {
    rows.push({
      icon: <CalendarIcon />,
      label: t("eventDateLabel"),
      value: formatEventDateRange(event.startAt, event.endAt, locale),
    });
    rows.push({
      icon: <ClockIcon />,
      label: t("eventTimeLabel"),
      value: event.endAt
        ? `${formatEventTime(event.startAt, locale)} – ${formatEventTime(event.endAt, locale)}`
        : formatEventTime(event.startAt, locale),
    });
  }
  if (event.location) rows.push({ icon: <PinIcon />, label: t("eventLocationLabel"), value: event.location });
  if (formatLabel) rows.push({ icon: <UsersIcon />, label: t("eventFormatLabel"), value: formatLabel });

  const note =
    status === "ended"
      ? t("eventEndedNote")
      : status === "cancelled"
        ? t("eventCancelledNote")
        : status === "postponed"
          ? t("eventPostponedNote")
          : null;

  return (
    <section
      aria-label={t("eventDetails")}
      className="overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm"
    >
      <div className="flex items-center justify-between gap-3 border-b border-divider px-5 py-4">
        <h2 className="m-0 flex items-center gap-2 font-khmer-serif text-base font-bold text-text-heading">
          <span className="h-5 w-1 rounded-full bg-accent" aria-hidden="true" />
          {t("eventDetails")}
        </h2>
        <EventStatusBadge status={status} label={t(`eventStatus.${status}` as never)} />
      </div>

      <dl className="m-0 flex flex-col gap-0 px-5 py-2">
        {rows.map((row, i) => (
          <div
            key={row.label}
            className={`flex items-start justify-between gap-3 py-2.5 text-sm ${i < rows.length - 1 ? "border-b border-divider" : ""}`}
          >
            <dt className="flex items-center gap-2 text-text-muted">
              <span className="text-text-muted" aria-hidden="true">{row.icon}</span>
              {row.label}
            </dt>
            <dd className="m-0 max-w-[60%] text-right font-semibold text-text-heading">{row.value}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-2.5 px-5 pb-5 pt-2">
        {regOpen && event.registrationUrl && (
          <a
            href={event.registrationUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-contrast transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
          >
            {t("eventRegisterCta")}
            <ExternalLinkIcon />
            <span className="sr-only">{t("eventExternalNote")}</span>
          </a>
        )}

        {regOpen && event.registrationDeadline && (
          <p className="text-center text-xs text-text-muted">
            {t("eventRegistrationDeadline", { date: formatEventDateRange(event.registrationDeadline, null, locale) })}
          </p>
        )}

        {!regOpen && event.registrationUrl && status === "upcoming" && (
          <p className="rounded-lg bg-paper px-3 py-2 text-center text-xs font-medium text-text-muted">
            {t("eventRegistrationClosed")}
          </p>
        )}

        {note && (
          <p
            className={`rounded-lg px-3 py-2 text-center text-xs font-medium ${
              status === "cancelled"
                ? "bg-red-50 text-red-700"
                : status === "postponed"
                  ? "bg-amber-50 text-amber-800"
                  : "bg-paper text-text-muted"
            }`}
          >
            {note}
          </p>
        )}

        {event.startAt && status !== "ended" && status !== "cancelled" && (
          <a
            href={googleCalendarUrl(title, event.startAt, event.endAt)}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-divider px-4 py-2 text-sm font-semibold text-text-body transition-colors hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <CalendarIcon />
            {t("eventAddToCalendar")}
          </a>
        )}
      </div>
    </section>
  );
}
