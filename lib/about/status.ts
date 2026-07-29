// lib/about/status.ts
//
// "Is the physical library open right now?" resolved to a shape the UI can
// render directly, including the cases the raw schedule logic doesn't cover:
// dated closures (public holidays, temporary closures) and a missing or
// unparseable schedule.
//
// Layering — each level owns one concern and none of them reach for `new
// Date()` on their own:
//
//   lib/library-hours.ts   weekly spec → open/closed at an instant (pure)
//   lib/system-settings/   the dated closures published by an admin
//   THIS FILE              combines them into one presentation state
//
// `now` is ALWAYS an argument. Every function here is pure, so the whole thing
// is unit-tested against fixed instants (lib/about/status.test.ts) and the
// server and client can evaluate the same input and agree.
//
// Everything is Cambodia local time (Asia/Phnom_Penh, UTC+7, no DST) — never
// the viewer's device timezone. A student in Phnom Penh and a reader in Paris
// must be told the same thing about the same building.

import { getLibraryStatus, LIBRARY_TIMEZONE, parseOpeningHours } from "@/lib/library-hours";
import { activeClosure } from "@/lib/system-settings/hours";
import type { HoursClosure } from "@/lib/system-settings/types";

export type AboutLibraryStatus =
  /** The schedule could not be read — show a neutral "check with the
   *  library" state, never a guessed "closed". */
  | { kind: "unavailable" }
  /** A published closure covers today (holiday, temporary closure). */
  | {
      kind: "closed-exception";
      closure: HoursClosure;
      nextOpen: { dayOffset: number; weekday: number; openMin: number } | null;
    }
  | { kind: "open"; closesAtMin: number }
  | {
      kind: "closed";
      nextOpen: { dayOffset: number; weekday: number; openMin: number } | null;
    };

/** True when the spec yields at least one real opening window. An empty or
 *  malformed spec must not be reported as "closed all week". */
export function hasUsableSchedule(spec: readonly string[]): boolean {
  if (!Array.isArray(spec) || spec.length === 0) return false;
  const parsed = parseOpeningHours(spec);
  return Object.values(parsed).some((ranges) => ranges.length > 0);
}

/**
 * The library's status at `now`.
 *
 * Precedence is deliberate: a dated closure BEATS the weekly schedule, because
 * that is the whole point of publishing one. Reversing these two would show
 * "Open now" on a national holiday.
 */
export function resolveLibraryStatus(
  now: Date,
  spec: readonly string[],
  closures: readonly HoursClosure[] = [],
  timeZone: string = LIBRARY_TIMEZONE,
): AboutLibraryStatus {
  if (!hasUsableSchedule(spec)) return { kind: "unavailable" };

  const closure = activeClosure(now, [...closures], timeZone);
  const base = getLibraryStatus(now, spec, timeZone);

  if (closure) {
    // Look past the closure for the next normal opening. Scanning day by day
    // keeps multi-day closures (e.g. Khmer New Year) from reporting an
    // opening that falls inside the closure itself.
    return { kind: "closed-exception", closure, nextOpen: nextOpenAfterClosure(now, spec, closures, timeZone) };
  }

  if (base.isOpen && base.closesAtMin !== null) {
    return { kind: "open", closesAtMin: base.closesAtMin };
  }
  return { kind: "closed", nextOpen: base.nextOpen };
}

/** The first opening that is not itself inside a published closure. */
function nextOpenAfterClosure(
  now: Date,
  spec: readonly string[],
  closures: readonly HoursClosure[],
  timeZone: string,
): { dayOffset: number; weekday: number; openMin: number } | null {
  for (let offset = 1; offset <= 14; offset++) {
    const probe = new Date(now.getTime() + offset * 86_400_000);
    if (activeClosure(probe, [...closures], timeZone)) continue;
    // Ask for the status at the START of that day so `getLibraryStatus`
    // reports that day's first window rather than skipping past it.
    const dayStart = new Date(probe.getTime());
    const status = getLibraryStatus(startOfZonedDay(dayStart, timeZone), spec, timeZone);
    if (status.isOpen) {
      // Midnight is never inside a window for this library, but handle it
      // rather than returning null and losing the answer.
      return { dayOffset: offset, weekday: zonedWeekday(probe, timeZone), openMin: 0 };
    }
    if (status.nextOpen && status.nextOpen.dayOffset === 0) {
      return { dayOffset: offset, weekday: status.nextOpen.weekday, openMin: status.nextOpen.openMin };
    }
  }
  return null;
}

/** The instant of 00:00 Cambodia-local on the same local day as `date`. */
function startOfZonedDay(date: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const num = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  const elapsed =
    (num("hour") % 24) * 3_600_000 + num("minute") * 60_000 + num("second") * 1000;
  return new Date(date.getTime() - elapsed);
}

function zonedWeekday(date: Date, timeZone: string): number {
  const label = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(label);
}

/**
 * A stable, comparable key for a status — used by the client refresher to
 * decide whether anything actually changed before re-rendering (and before
 * announcing the change to screen readers).
 */
export function statusKey(status: AboutLibraryStatus): string {
  switch (status.kind) {
    case "unavailable":
      return "unavailable";
    case "open":
      return `open:${status.closesAtMin}`;
    case "closed-exception":
      return `exception:${status.closure.from}:${status.closure.to}`;
    case "closed":
      return `closed:${status.nextOpen?.weekday ?? "-"}:${status.nextOpen?.openMin ?? "-"}`;
  }
}

/** Which of the four visual treatments a status gets. Colour is paired with
 *  an icon and a text label everywhere it is used — never colour alone. */
export function statusTone(
  status: AboutLibraryStatus,
): "open" | "closed" | "notice" | "unknown" {
  switch (status.kind) {
    case "open":
      return "open";
    case "closed":
      return "closed";
    case "closed-exception":
      return "notice";
    case "unavailable":
      return "unknown";
  }
}
