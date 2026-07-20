/**
 * Single source of truth for deriving an event's lifecycle status and its
 * locale-aware date/time formatting. Kept pure (no I/O, no framework) so it can
 * be unit-tested and imported from both server and client components.
 *
 * Timezone: PTEC events are institutional and displayed in Cambodia time
 * (Asia/Phnom_Penh, UTC+7, no DST) regardless of the viewer's own timezone —
 * so a reader in another country still sees the real start time. Stored values
 * are timestamptz (UTC on the wire); we format them in this zone and NEVER
 * store a formatted string (migration 0099).
 */

export const PTEC_TZ = "Asia/Phnom_Penh";
// Cambodia has observed no DST since 1972, so the offset is a safe constant.
const PTEC_UTC_OFFSET = "+07:00";

export type EventFormat = "in_person" | "online" | "hybrid";
export type EventStatusOverride = "cancelled" | "postponed";
export type EventStatus = "upcoming" | "ongoing" | "ended" | "cancelled" | "postponed";

export type EventFields = {
  startAt: string | null;
  endAt: string | null;
  location: string | null;
  format: EventFormat | null;
  registrationUrl: string | null;
  registrationDeadline: string | null;
  statusOverride: EventStatusOverride | null;
};

/** A post is an event only when it has a start date (its category is 'Event'
 *  in the data model, but the date is what makes the event UI meaningful). */
export function isEvent(fields: Pick<EventFields, "startAt">): boolean {
  return !!fields.startAt;
}

function parse(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** End of the calendar day (Asia/Phnom_Penh) that contains `iso`. Used as the
 *  effective end for a start-only event so it reads as "ongoing" for the whole
 *  day rather than flipping to "ended" the instant the start time passes. */
function ptecEndOfDay(iso: string): Date {
  const d = new Date(iso);
  // en-CA renders as YYYY-MM-DD, the parts we need for the day boundary.
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: PTEC_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return new Date(`${ymd}T23:59:59.999${PTEC_UTC_OFFSET}`);
}

/**
 * Derive the event's status. Returns null when the post is not a dated event.
 * Manual overrides (cancelled / postponed) win over the date-derived states.
 */
export function deriveEventStatus(
  fields: EventFields,
  now: Date = new Date(),
): EventStatus | null {
  const start = parse(fields.startAt);
  if (!start) return null;
  if (fields.statusOverride === "cancelled") return "cancelled";
  if (fields.statusOverride === "postponed") return "postponed";

  const end = parse(fields.endAt) ?? ptecEndOfDay(fields.startAt!);
  const n = now.getTime();
  if (n < start.getTime()) return "upcoming";
  if (n > end.getTime()) return "ended";
  return "ongoing";
}

/**
 * Whether an active registration action should be offered. False for
 * ended / cancelled / postponed events, when there is no registration URL, or
 * once the registration deadline has passed — so the UI never invites a reader
 * to register for something they can no longer attend.
 */
export function isRegistrationOpen(
  fields: EventFields,
  now: Date = new Date(),
): boolean {
  if (!fields.registrationUrl) return false;
  const status = deriveEventStatus(fields, now);
  if (status === "ended" || status === "cancelled" || status === "postponed") return false;

  const deadline = parse(fields.registrationDeadline);
  if (deadline && now.getTime() > deadline.getTime()) return false;
  return true;
}

// ── Formatting ─────────────────────────────────────────────────────────────

function intlLocale(locale: string): string {
  return locale === "km" ? "km-KH" : "en-US";
}

/**
 * A publication/generic date formatted in PTEC time. Used for post cards so the
 * rendered day is identical on server and client regardless of their own
 * timezone (a plain toLocaleDateString would risk a hydration mismatch near
 * midnight).
 */
export function formatPtecDate(iso: string | null, locale: string): string {
  return formatEventDate(iso, locale);
}

/** "15 August 2026" (localized, PTEC timezone). */
export function formatEventDate(iso: string | null, locale: string): string {
  const d = parse(iso);
  if (!d) return "";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: PTEC_TZ,
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
}

/** "9:00 AM" (localized, PTEC timezone). */
export function formatEventTime(iso: string | null, locale: string): string {
  const d = parse(iso);
  if (!d) return "";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: PTEC_TZ,
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function sameCalendarDay(a: Date, b: Date): boolean {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: PTEC_TZ, dateStyle: "short" });
  return fmt.format(a) === fmt.format(b);
}

/**
 * A human date range: a single day collapses to one date; a multi-day span
 * shows both endpoints. Times are handled separately by the caller when needed.
 */
export function formatEventDateRange(
  startIso: string | null,
  endIso: string | null,
  locale: string,
): string {
  const start = parse(startIso);
  if (!start) return "";
  const end = parse(endIso);
  const startLabel = formatEventDate(startIso, locale);
  if (!end || sameCalendarDay(start, end)) return startLabel;
  return `${startLabel} – ${formatEventDate(endIso, locale)}`;
}
