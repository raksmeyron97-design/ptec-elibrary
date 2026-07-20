import { describe, it, expect } from "vitest";
import {
  deriveEventStatus,
  isRegistrationOpen,
  isEvent,
  formatEventDate,
  formatEventTime,
  formatEventDateRange,
  type EventFields,
} from "./event-status";

function base(overrides: Partial<EventFields> = {}): EventFields {
  return {
    startAt: null,
    endAt: null,
    location: null,
    format: null,
    registrationUrl: null,
    registrationDeadline: null,
    statusOverride: null,
    ...overrides,
  };
}

// A fixed "now" so the derivations are deterministic. 2026-08-15 05:00 UTC
// = 2026-08-15 12:00 in Phnom_Penh (UTC+7).
const NOW = new Date("2026-08-15T05:00:00Z");

describe("isEvent", () => {
  it("is false without a start date", () => {
    expect(isEvent(base())).toBe(false);
  });
  it("is true with a start date", () => {
    expect(isEvent(base({ startAt: "2026-09-01T02:00:00Z" }))).toBe(true);
  });
});

describe("deriveEventStatus", () => {
  it("returns null for a non-event (no start)", () => {
    expect(deriveEventStatus(base(), NOW)).toBeNull();
  });

  it("is upcoming when start is in the future", () => {
    expect(deriveEventStatus(base({ startAt: "2026-09-01T02:00:00Z" }), NOW)).toBe("upcoming");
  });

  it("is ended when a past event's end has passed", () => {
    expect(
      deriveEventStatus(
        base({ startAt: "2026-08-10T02:00:00Z", endAt: "2026-08-10T06:00:00Z" }),
        NOW,
      ),
    ).toBe("ended");
  });

  it("is ongoing when now is between start and end", () => {
    expect(
      deriveEventStatus(
        base({ startAt: "2026-08-15T02:00:00Z", endAt: "2026-08-15T10:00:00Z" }),
        NOW,
      ),
    ).toBe("ongoing");
  });

  it("treats a start-only event as ongoing for the rest of the PTEC day", () => {
    // Start 03:00Z = 10:00 PTEC; now 12:00 PTEC — after start, same day → ongoing.
    expect(deriveEventStatus(base({ startAt: "2026-08-15T03:00:00Z" }), NOW)).toBe("ongoing");
  });

  it("start-only event on a past day is ended", () => {
    expect(deriveEventStatus(base({ startAt: "2026-08-14T03:00:00Z" }), NOW)).toBe("ended");
  });

  it("override cancelled wins over dates", () => {
    expect(
      deriveEventStatus(
        base({ startAt: "2026-09-01T02:00:00Z", statusOverride: "cancelled" }),
        NOW,
      ),
    ).toBe("cancelled");
  });

  it("override postponed wins over dates", () => {
    expect(
      deriveEventStatus(
        base({ startAt: "2026-09-01T02:00:00Z", statusOverride: "postponed" }),
        NOW,
      ),
    ).toBe("postponed");
  });
});

describe("isRegistrationOpen", () => {
  it("is false without a registration URL", () => {
    expect(isRegistrationOpen(base({ startAt: "2026-09-01T02:00:00Z" }), NOW)).toBe(false);
  });

  it("is true for an upcoming event with a URL and no deadline", () => {
    expect(
      isRegistrationOpen(
        base({ startAt: "2026-09-01T02:00:00Z", registrationUrl: "https://x.test/reg" }),
        NOW,
      ),
    ).toBe(true);
  });

  it("is false for an ended event even with a URL", () => {
    expect(
      isRegistrationOpen(
        base({
          startAt: "2026-08-10T02:00:00Z",
          endAt: "2026-08-10T06:00:00Z",
          registrationUrl: "https://x.test/reg",
        }),
        NOW,
      ),
    ).toBe(false);
  });

  it("is false for a cancelled event", () => {
    expect(
      isRegistrationOpen(
        base({
          startAt: "2026-09-01T02:00:00Z",
          registrationUrl: "https://x.test/reg",
          statusOverride: "cancelled",
        }),
        NOW,
      ),
    ).toBe(false);
  });

  it("is false once the registration deadline has passed", () => {
    expect(
      isRegistrationOpen(
        base({
          startAt: "2026-09-01T02:00:00Z",
          registrationUrl: "https://x.test/reg",
          registrationDeadline: "2026-08-14T00:00:00Z",
        }),
        NOW,
      ),
    ).toBe(false);
  });

  it("is true when the deadline is still in the future", () => {
    expect(
      isRegistrationOpen(
        base({
          startAt: "2026-09-01T02:00:00Z",
          registrationUrl: "https://x.test/reg",
          registrationDeadline: "2026-08-20T00:00:00Z",
        }),
        NOW,
      ),
    ).toBe(true);
  });
});

describe("formatting (Asia/Phnom_Penh)", () => {
  it("formats a date in PTEC time", () => {
    // 2026-08-15T19:00Z = 2026-08-16 02:00 PTEC → should render Aug 16.
    expect(formatEventDate("2026-08-15T19:00:00Z", "en")).toBe("August 16, 2026");
  });

  it("returns empty string for null", () => {
    expect(formatEventDate(null, "en")).toBe("");
    expect(formatEventTime(null, "en")).toBe("");
  });

  it("formats a time in PTEC time", () => {
    // 02:00Z = 09:00 PTEC.
    expect(formatEventTime("2026-08-15T02:00:00Z", "en")).toMatch(/9:00\s?AM/i);
  });

  it("collapses a single-day range to one date", () => {
    const s = "2026-08-15T02:00:00Z";
    const e = "2026-08-15T09:00:00Z";
    expect(formatEventDateRange(s, e, "en")).toBe("August 15, 2026");
  });

  it("shows both endpoints for a multi-day range", () => {
    const s = "2026-08-15T02:00:00Z";
    const e = "2026-08-17T09:00:00Z";
    expect(formatEventDateRange(s, e, "en")).toContain("–");
  });
});
