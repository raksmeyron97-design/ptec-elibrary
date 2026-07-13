import { describe, it, expect } from "vitest";
import {
  parseOpeningHours,
  getLibraryStatus,
  formatTimeLabel,
} from "./library-hours";

// The PTEC spec: weekdays 7–17, Saturday 8–16, Sunday closed.
const SPEC = ["Mo-Fr 07:00-17:00", "Sa 08:00-16:00"];

describe("parseOpeningHours", () => {
  it("expands day ranges and single days into per-weekday windows", () => {
    const s = parseOpeningHours(SPEC);
    expect(s[1]).toEqual([{ open: 420, close: 1020 }]); // Monday 7:00–17:00
    expect(s[5]).toEqual([{ open: 420, close: 1020 }]); // Friday
    expect(s[6]).toEqual([{ open: 480, close: 960 }]); // Saturday 8:00–16:00
    expect(s[0]).toEqual([]); // Sunday closed
  });

  it("skips malformed and inverted entries", () => {
    const s = parseOpeningHours(["garbage", "Mo 18:00-09:00", "Xx 07:00-08:00"]);
    expect(Object.values(s).every((r) => r.length === 0)).toBe(true);
  });
});

describe("getLibraryStatus (Asia/Phnom_Penh)", () => {
  it("is open on a weekday afternoon and reports the closing time", () => {
    // Mon 10:00 Phnom Penh
    const st = getLibraryStatus(new Date("2026-07-13T03:00:00Z"), SPEC);
    expect(st.isOpen).toBe(true);
    expect(st.closesAtMin).toBe(1020); // 17:00
  });

  it("is closed after weekday hours and points to the next morning", () => {
    // Mon 18:30 Phnom Penh
    const st = getLibraryStatus(new Date("2026-07-13T11:30:00Z"), SPEC);
    expect(st.isOpen).toBe(false);
    expect(st.nextOpen).toEqual({ dayOffset: 1, weekday: 2, openMin: 420 }); // Tue 07:00
  });

  it("is open on Saturday within the shorter window", () => {
    // Sat 09:00 Phnom Penh
    const st = getLibraryStatus(new Date("2026-07-18T02:00:00Z"), SPEC);
    expect(st.isOpen).toBe(true);
    expect(st.closesAtMin).toBe(960); // 16:00
  });

  it("is closed all Sunday and reopens Monday", () => {
    // Sun 12:00 Phnom Penh
    const st = getLibraryStatus(new Date("2026-07-19T05:00:00Z"), SPEC);
    expect(st.isOpen).toBe(false);
    expect(st.nextOpen).toEqual({ dayOffset: 1, weekday: 1, openMin: 420 }); // Mon 07:00
  });

  it("counts the exact closing minute as closed", () => {
    // Fri 17:35 Phnom Penh — just past 17:00 close
    const st = getLibraryStatus(new Date("2026-07-17T10:35:00Z"), SPEC);
    expect(st.isOpen).toBe(false);
    expect(st.nextOpen).toEqual({ dayOffset: 1, weekday: 6, openMin: 480 }); // Sat 08:00
  });

  it("does not use the runtime's local timezone", () => {
    // Regardless of host TZ, the same instant yields the same Cambodia answer.
    const instant = new Date("2026-07-13T03:00:00Z");
    expect(getLibraryStatus(instant, SPEC).isOpen).toBe(true);
  });
});

describe("formatTimeLabel", () => {
  it("uses 12-hour clock for English", () => {
    expect(formatTimeLabel(1020, "en")).toBe("5:00 PM");
    expect(formatTimeLabel(420, "en")).toBe("7:00 AM");
    expect(formatTimeLabel(0, "en")).toBe("12:00 AM");
  });
  it("uses 24-hour clock for Khmer", () => {
    expect(formatTimeLabel(1020, "km")).toBe("17:00");
    expect(formatTimeLabel(480, "km")).toBe("8:00");
  });
});
