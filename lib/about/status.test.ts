import { describe, expect, it } from "vitest";
import {
  hasUsableSchedule,
  resolveLibraryStatus,
  statusKey,
  statusTone,
} from "./status";
import type { HoursClosure } from "@/lib/system-settings/types";

// The library's published schedule: Mon–Fri 07:00–17:00, Sat 08:00–16:00,
// Sunday closed. Cambodia is UTC+7 year-round with no DST, so every instant
// below is written as UTC and the expected local time noted in the comment.
const SPEC = ["Mo-Fr 07:00-17:00", "Sa 08:00-16:00"];

/** A UTC instant for a given Cambodia-local wall clock time. */
function phnomPenh(iso: string): Date {
  return new Date(`${iso}+07:00`);
}

describe("hasUsableSchedule", () => {
  it("accepts a spec with at least one opening window", () => {
    expect(hasUsableSchedule(SPEC)).toBe(true);
  });

  it("rejects an empty spec", () => {
    expect(hasUsableSchedule([])).toBe(false);
  });

  it("rejects a spec whose every entry is malformed", () => {
    // A close time at or before the open time is dropped by the parser; if
    // that is all there is, we have no schedule — NOT a closed week.
    expect(hasUsableSchedule(["Mo-Fr 17:00-07:00", "garbage"])).toBe(false);
  });
});

describe("resolveLibraryStatus", () => {
  it("reports open during a weekday window", () => {
    // Wednesday 10:30 local.
    const status = resolveLibraryStatus(phnomPenh("2026-07-29T10:30:00"), SPEC);
    expect(status.kind).toBe("open");
    if (status.kind !== "open") throw new Error("expected open");
    expect(status.closesAtMin).toBe(17 * 60);
  });

  it("reports closed before opening, with today's opening time", () => {
    // Wednesday 06:30 local — half an hour before the doors open.
    const status = resolveLibraryStatus(phnomPenh("2026-07-29T06:30:00"), SPEC);
    expect(status.kind).toBe("closed");
    if (status.kind !== "closed") throw new Error("expected closed");
    expect(status.nextOpen).toEqual({ dayOffset: 0, weekday: 3, openMin: 7 * 60 });
  });

  it("reports closed after the window, pointing at the NEXT day", () => {
    // Wednesday 18:00 local — closed; next opening is Thursday 07:00.
    const status = resolveLibraryStatus(phnomPenh("2026-07-29T18:00:00"), SPEC);
    expect(status.kind).toBe("closed");
    if (status.kind !== "closed") throw new Error("expected closed");
    expect(status.nextOpen).toEqual({ dayOffset: 1, weekday: 4, openMin: 7 * 60 });
  });

  it("uses Saturday's different window, not the weekday one", () => {
    // Saturday 07:30 local — the library opens at 08:00 on Saturdays, so a
    // weekday-only reading of the schedule would wrongly say "open".
    const early = resolveLibraryStatus(phnomPenh("2026-08-01T07:30:00"), SPEC);
    expect(early.kind).toBe("closed");

    const open = resolveLibraryStatus(phnomPenh("2026-08-01T09:00:00"), SPEC);
    expect(open.kind).toBe("open");
    if (open.kind !== "open") throw new Error("expected open");
    expect(open.closesAtMin).toBe(16 * 60);
  });

  it("skips Sunday and points at Monday", () => {
    // Sunday 10:00 local.
    const status = resolveLibraryStatus(phnomPenh("2026-08-02T10:00:00"), SPEC);
    expect(status.kind).toBe("closed");
    if (status.kind !== "closed") throw new Error("expected closed");
    expect(status.nextOpen?.weekday).toBe(1); // Monday
    expect(status.nextOpen?.openMin).toBe(7 * 60);
  });

  it("evaluates in Phnom Penh time regardless of the caller's clock", () => {
    // 2026-07-29T23:30Z is 06:30 Thursday in Cambodia — still closed — even
    // though it is late Wednesday evening in UTC. Reading the instant in the
    // wrong zone would report Wednesday's already-finished day.
    const status = resolveLibraryStatus(new Date("2026-07-29T23:30:00Z"), SPEC);
    expect(status.kind).toBe("closed");
    if (status.kind !== "closed") throw new Error("expected closed");
    expect(status.nextOpen).toEqual({ dayOffset: 0, weekday: 4, openMin: 7 * 60 });
  });

  it("returns 'unavailable' rather than 'closed' when the schedule is missing", () => {
    // The distinction matters: telling someone the library is CLOSED because
    // a config read failed sends them home for no reason.
    expect(resolveLibraryStatus(phnomPenh("2026-07-29T10:30:00"), []).kind).toBe("unavailable");
  });
});

describe("resolveLibraryStatus — dated closures", () => {
  const holiday: HoursClosure = {
    from: "2026-07-29",
    to: "2026-07-29",
    reason: { en: "Public holiday", km: "ថ្ងៃបុណ្យជាតិ" },
  };

  it("a closure overrides the weekly schedule", () => {
    // Wednesday 10:30 — inside the normal window, but closed for a holiday.
    const status = resolveLibraryStatus(phnomPenh("2026-07-29T10:30:00"), SPEC, [holiday]);
    expect(status.kind).toBe("closed-exception");
    if (status.kind !== "closed-exception") throw new Error("expected exception");
    expect(status.closure.reason.en).toBe("Public holiday");
  });

  it("points past a single-day closure to the next open day", () => {
    const status = resolveLibraryStatus(phnomPenh("2026-07-29T10:30:00"), SPEC, [holiday]);
    if (status.kind !== "closed-exception") throw new Error("expected exception");
    expect(status.nextOpen).toEqual({ dayOffset: 1, weekday: 4, openMin: 7 * 60 });
  });

  it("skips an entire multi-day closure", () => {
    // Closed Wed 29 → Fri 31 July. The next opening must be Saturday 1 Aug at
    // 08:00, not Thursday — a naive "tomorrow" answer lands inside the
    // closure.
    const long: HoursClosure = {
      from: "2026-07-29",
      to: "2026-07-31",
      reason: { en: "Khmer New Year", km: "បុណ្យចូលឆ្នាំខ្មែរ" },
    };
    const status = resolveLibraryStatus(phnomPenh("2026-07-29T10:30:00"), SPEC, [long]);
    if (status.kind !== "closed-exception") throw new Error("expected exception");
    expect(status.nextOpen).toEqual({ dayOffset: 3, weekday: 6, openMin: 8 * 60 });
  });

  it("ignores a closure that does not cover today", () => {
    const future: HoursClosure = {
      from: "2026-12-25",
      to: "2026-12-25",
      reason: { en: "Christmas", km: "បុណ្យណូអែល" },
    };
    expect(resolveLibraryStatus(phnomPenh("2026-07-29T10:30:00"), SPEC, [future]).kind).toBe("open");
  });
});

describe("statusKey", () => {
  it("is stable while nothing changes, so the UI does not re-announce", () => {
    const a = resolveLibraryStatus(phnomPenh("2026-07-29T10:30:00"), SPEC);
    const b = resolveLibraryStatus(phnomPenh("2026-07-29T10:31:00"), SPEC);
    expect(statusKey(a)).toBe(statusKey(b));
  });

  it("changes when the library opens", () => {
    const before = resolveLibraryStatus(phnomPenh("2026-07-29T06:59:00"), SPEC);
    const after = resolveLibraryStatus(phnomPenh("2026-07-29T07:01:00"), SPEC);
    expect(statusKey(before)).not.toBe(statusKey(after));
  });
});

describe("statusTone", () => {
  it("maps each status to its own visual treatment", () => {
    expect(statusTone(resolveLibraryStatus(phnomPenh("2026-07-29T10:00:00"), SPEC))).toBe("open");
    expect(statusTone(resolveLibraryStatus(phnomPenh("2026-08-02T10:00:00"), SPEC))).toBe("closed");
    expect(statusTone(resolveLibraryStatus(phnomPenh("2026-07-29T10:00:00"), []))).toBe("unknown");
    expect(
      statusTone(
        resolveLibraryStatus(phnomPenh("2026-07-29T10:00:00"), SPEC, [
          { from: "2026-07-29", to: "2026-07-29", reason: { en: "Holiday", km: "បុណ្យ" } },
        ]),
      ),
    ).toBe("notice");
  });
});
