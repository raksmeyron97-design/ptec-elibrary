import { describe, it, expect } from "vitest";
import {
  csvEscape,
  buildCsv,
  maskPhone,
  maskEmail,
  resolveRange,
  tabForEvent,
  pickTimelineBucket,
  floorToBucket,
  timelineBucketStarts,
  BUCKET_MS,
  type ActivityEvent,
} from "./activity-log-shared";
import { pageWindow } from "@/app/(admin)/admin/(protected)/logs/_components/LogsPagination";

const baseEvent = (over: Partial<ActivityEvent>): ActivityEvent => ({
  id: "x",
  source: "activity_events",
  eventType: "download",
  eventStatus: "authorized",
  resourceType: "thesis",
  resourceId: "r",
  resourceTitle: "T",
  userId: "u",
  actorName: "Sok Dara",
  actorEmail: "sok@ptec.edu.kh",
  actorAvatar: null,
  isAnon: false,
  institutionType: null,
  role: null,
  purpose: null,
  rankAtEvent: null,
  permissionSource: null,
  denialReason: null,
  locale: null,
  occurredAt: new Date().toISOString(),
  ...over,
});

describe("csvEscape — formula injection + quoting", () => {
  it("neutralizes leading formula characters", () => {
    expect(csvEscape("=1+2")).toBe('"\'=1+2"');
    expect(csvEscape("+cmd")).toBe('"\'+cmd"');
    expect(csvEscape("-2")).toBe('"\'-2"');
    expect(csvEscape("@x")).toBe('"\'@x"');
  });
  it("quotes commas, quotes and newlines", () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('she said "hi"')).toBe('"she said ""hi"""');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });
  it("handles null/undefined as empty", () => {
    expect(csvEscape(null)).toBe('""');
    expect(csvEscape(undefined)).toBe('""');
  });
  it("passes plain values through quoted", () => {
    expect(csvEscape("Educational Leadership")).toBe('"Educational Leadership"');
  });
});

describe("buildCsv", () => {
  it("prepends a UTF-8 BOM and CRLF-separates rows", () => {
    const csv = buildCsv(["A", "B"], [["1", "2"], ["=x", "y,z"]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"A","B"');
    expect(csv).toContain('"\'=x","y,z"');
    expect(csv.split("\r\n").length).toBeGreaterThanOrEqual(3);
  });
  it("keeps Khmer text intact", () => {
    const csv = buildCsv(["title"], [["និក្ខេបបទ"]]);
    expect(csv).toContain("និក្ខេបបទ");
  });
});

describe("maskPhone", () => {
  it("reveals only the last three digits", () => {
    expect(maskPhone("+855 12 345 482")).toBe("+855 ** *** 482");
    expect(maskPhone("012345482")).toBe("** *** 482");
  });
  it("returns null for empty and a dot-mask for too-short", () => {
    expect(maskPhone(null)).toBeNull();
    expect(maskPhone("")).toBeNull();
    expect(maskPhone("12")).toBe("•••");
  });
});

describe("maskEmail", () => {
  it("keeps first char + domain", () => {
    expect(maskEmail("sok@ptec.edu.kh")).toBe("s•••@ptec.edu.kh");
  });
  it("handles bad input", () => {
    expect(maskEmail(null)).toBeNull();
    expect(maskEmail("notanemail")).toBe("•••");
  });
});

describe("resolveRange", () => {
  const now = Date.parse("2026-07-14T12:00:00Z");
  it("computes 24h/7d/30d/90d windows from now", () => {
    expect(resolveRange("24h", now).start).toBe(new Date(now - 86_400_000).toISOString());
    expect(resolveRange("7d", now).start).toBe(new Date(now - 7 * 86_400_000).toISOString());
    expect(resolveRange("30d", now).end).toBe(new Date(now).toISOString());
  });
  it("honors custom bounds", () => {
    const r = resolveRange("custom", now, "2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z");
    expect(r.start).toBe("2026-01-01T00:00:00.000Z");
    expect(r.end).toBe("2026-02-01T00:00:00.000Z");
  });
});

describe("tabForEvent — denied downloads never count as downloads", () => {
  it("routes authorized downloads to Downloads", () => {
    expect(tabForEvent(baseEvent({ eventType: "download", eventStatus: "authorized" }))).toBe("downloads");
  });
  it("routes denied/failed downloads to Security, NOT Downloads", () => {
    expect(tabForEvent(baseEvent({ eventType: "download", eventStatus: "denied" }))).toBe("security");
    expect(tabForEvent(baseEvent({ eventType: "download", eventStatus: "failed" }))).toBe("security");
  });
  it("routes views to Views", () => {
    expect(tabForEvent(baseEvent({ eventType: "view", eventStatus: "success" }))).toBe("views");
  });
});

describe("timeline bucketing — ADMIN_TZ day boundaries without a tz library", () => {
  it("widens the bucket instead of narrowing the window", () => {
    const day = 86_400_000;
    expect(pickTimelineBucket(0, 24 * 3_600_000)).toBe("hour");
    expect(pickTimelineBucket(0, 48 * 3_600_000)).toBe("hour");
    // Just past 48h the hourly ladder would start producing unreadable counts.
    expect(pickTimelineBucket(0, 49 * 3_600_000)).toBe("day");
    expect(pickTimelineBucket(0, 90 * day)).toBe("day");
    // A multi-year custom range must never fall back to thousands of buckets.
    expect(pickTimelineBucket(0, 3 * 365 * day)).toBe("week");
  });

  it("floors a day to local midnight in Phnom Penh, not to UTC midnight", () => {
    // 2026-08-28T02:00:00Z is 09:00 on the 28th locally — same local day.
    const morning = Date.parse("2026-08-28T02:00:00Z");
    // 2026-08-28T20:00:00Z is 03:00 on the 29th locally — the NEXT local day.
    const evening = Date.parse("2026-08-28T20:00:00Z");
    expect(new Date(floorToBucket(morning, "day")).toISOString()).toBe("2026-08-27T17:00:00.000Z");
    expect(new Date(floorToBucket(evening, "day")).toISOString()).toBe("2026-08-28T17:00:00.000Z");
    expect(floorToBucket(morning, "day")).not.toBe(floorToBucket(evening, "day"));
  });

  it("starts weeks on Monday, not on the epoch's Thursday", () => {
    // 2026-08-28 is a Friday in Phnom Penh; its week starts Monday 2026-08-24.
    const friday = Date.parse("2026-08-28T05:00:00Z");
    const start = floorToBucket(friday, "week");
    // 17:00Z the previous day == 00:00 local.
    expect(new Date(start).toISOString()).toBe("2026-08-23T17:00:00.000Z");
  });

  it("emits every bucket in the window, including the empty ones", () => {
    const start = Date.parse("2026-08-28T00:00:00Z");
    const end = start + 5 * 3_600_000;
    const buckets = timelineBucketStarts(start, end, "hour");
    expect(buckets).toHaveLength(6);
    for (let i = 1; i < buckets.length; i++) {
      expect(buckets[i] - buckets[i - 1]).toBe(BUCKET_MS.hour);
    }
  });

  it("returns nothing for an inverted or unparseable window", () => {
    expect(timelineBucketStarts(100, 0, "day")).toEqual([]);
    expect(timelineBucketStarts(NaN, 0, "day")).toEqual([]);
  });
});

describe("pageWindow — page numbers stay a fixed width", () => {
  it("lists every page when they fit", () => {
    expect(pageWindow(0, 1)).toEqual([0]);
    expect(pageWindow(3, 7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("keeps the first and last page reachable from anywhere", () => {
    for (const page of [0, 5, 11, 21]) {
      const window = pageWindow(page, 22);
      expect(window[0]).toBe(0);
      expect(window[window.length - 1]).toBe(21);
      expect(window).toContain(page);
    }
  });

  it("never grows past the widest case, so the control does not reflow", () => {
    for (let page = 0; page < 40; page++) {
      expect(pageWindow(page, 40).length).toBeLessThanOrEqual(7);
    }
  });
});
