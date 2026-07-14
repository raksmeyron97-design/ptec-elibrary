import { describe, it, expect } from "vitest";
import {
  csvEscape,
  buildCsv,
  maskPhone,
  maskEmail,
  resolveRange,
  tabForEvent,
  type ActivityEvent,
} from "./activity-log-shared";

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
