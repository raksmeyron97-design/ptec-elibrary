import { describe, expect, it } from "vitest";
import { cambodiaWeekday, groupWeeklySpec, minutesToHHMM, todayIntervals } from "./schedule";

const SPEC = ["Mo-Fr 07:00-17:00", "Sa 08:00-16:00"];

describe("groupWeeklySpec", () => {
  it("collapses consecutive days that share a window", () => {
    const { open } = groupWeeklySpec(SPEC);
    expect(open).toHaveLength(2);
    expect(open[0].days).toEqual([1, 2, 3, 4, 5]); // Mon–Fri
    expect(open[1].days).toEqual([6]); // Saturday alone — different hours
  });

  it("collects days with no hours into closedDays", () => {
    expect(groupWeeklySpec(SPEC).closedDays).toEqual([0]); // Sunday
  });

  it("scans Monday-first, not Sunday-first", () => {
    // A Sunday-first scan would split Mon–Fri around the week boundary and
    // render "Monday – Friday" as two rows.
    const { open } = groupWeeklySpec(["Mo-Su 09:00-17:00"]);
    expect(open).toHaveLength(1);
    expect(open[0].days).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it("does not merge days whose hours differ", () => {
    const { open } = groupWeeklySpec(["Mo-Tu 07:00-17:00", "We-Fr 08:00-16:00"]);
    expect(open).toHaveLength(2);
    expect(open[0].days).toEqual([1, 2]);
    expect(open[1].days).toEqual([3, 4, 5]);
  });

  it("keeps multiple windows on one day together", () => {
    const { open } = groupWeeklySpec(["Mo 08:00-12:00", "Mo 13:00-17:00"]);
    expect(open).toHaveLength(1);
    expect(open[0].intervals).toHaveLength(2);
    // Sorted, so a spec listing the afternoon first still renders in order.
    expect(open[0].intervals[0].open).toBeLessThan(open[0].intervals[1].open);
  });

  it("returns NOTHING — not a closed week — for an empty spec", () => {
    // The caller renders "schedule unavailable" from this. Reporting seven
    // closed days would tell visitors the library never opens.
    expect(groupWeeklySpec([])).toEqual({ open: [], closedDays: [] });
    expect(groupWeeklySpec(["nonsense"])).toEqual({ open: [], closedDays: [] });
  });
});

describe("minutesToHHMM", () => {
  it("zero-pads both parts", () => {
    expect(minutesToHHMM(7 * 60)).toBe("07:00");
    expect(minutesToHHMM(17 * 60 + 5)).toBe("17:05");
    expect(minutesToHHMM(0)).toBe("00:00");
  });
});

describe("cambodiaWeekday", () => {
  it("reads the weekday in Phnom Penh, not the host timezone", () => {
    // 2026-07-29T23:30Z is already Thursday in Cambodia (UTC+7) while still
    // Wednesday in UTC. The highlighted "today" row depends on getting this
    // right.
    expect(cambodiaWeekday(new Date("2026-07-29T23:30:00Z"))).toBe(4); // Thursday
    expect(cambodiaWeekday(new Date("2026-07-29T10:00:00Z"))).toBe(3); // Wednesday
  });
});

describe("todayIntervals", () => {
  it("returns today's windows", () => {
    // Wednesday in Cambodia.
    const intervals = todayIntervals(SPEC, new Date("2026-07-29T03:00:00Z"));
    expect(intervals).toEqual([{ open: 7 * 60, close: 17 * 60 }]);
  });

  it("returns Saturday's different window", () => {
    const intervals = todayIntervals(SPEC, new Date("2026-08-01T03:00:00Z"));
    expect(intervals).toEqual([{ open: 8 * 60, close: 16 * 60 }]);
  });

  it("returns an empty array on a closed day", () => {
    expect(todayIntervals(SPEC, new Date("2026-08-02T03:00:00Z"))).toEqual([]);
  });
});
