import { describe, expect, it } from "vitest";
import { monthGrid, monthOf, publishingDays, weekdayIndex, weekdayRhythm } from "./overview-library";

const daily = (start: string, values: number[]) => {
  const t0 = Date.parse(`${start}T00:00:00Z`);
  return values.map((value, i) => ({
    date: new Date(t0 + i * 86_400_000).toISOString().slice(0, 10),
    value,
  }));
};

describe("weekdayIndex", () => {
  it("reads the weekday from the calendar day itself, Monday first", () => {
    // 2026-09-01 is a Tuesday; 2026-09-30 a Wednesday.
    expect(weekdayIndex("2026-09-01")).toBe(1);
    expect(weekdayIndex("2026-09-30")).toBe(2);
    expect(weekdayIndex("2026-09-28")).toBe(0);
    expect(weekdayIndex("2026-09-27")).toBe(6);
  });

  it("refuses an hourly key rather than guessing its day", () => {
    expect(weekdayIndex("2026-09-30T14:00")).toBeNull();
  });
});

describe("weekdayRhythm", () => {
  it("totals a daily series per weekday and names the busiest", () => {
    // Mon 2026-09-07 … Sun 2026-09-13, then Mon 2026-09-14.
    const r = weekdayRhythm(daily("2026-09-07", [1, 2, 3, 4, 5, 10, 6, 2]))!;
    expect(r.days.map((d) => d.total)).toEqual([3, 2, 3, 4, 5, 10, 6]);
    expect(r.days[0].days).toBe(2); // two Mondays in the window
    expect(r.total).toBe(33);
    expect(r.busiest).toBe(5); // Saturday
    expect(r.weekendPct).toBe(48); // 16 of 33
  });

  it("says nothing under a week — an absent weekday is not a quiet one", () => {
    expect(weekdayRhythm(daily("2026-09-07", [1, 2, 3, 4, 5, 6]))).toBeNull();
  });

  it("says nothing for an hourly series", () => {
    const hourly = Array.from({ length: 24 }, (_, h) => ({
      date: `2026-09-30T${String(h).padStart(2, "0")}:00`,
      value: 1,
    }));
    expect(weekdayRhythm(hourly)).toBeNull();
  });

  it("has no busiest day and no weekend share when nothing happened", () => {
    const r = weekdayRhythm(daily("2026-09-07", [0, 0, 0, 0, 0, 0, 0]))!;
    expect(r.busiest).toBeNull();
    expect(r.weekendPct).toBeNull();
  });
});

describe("monthGrid", () => {
  it("lays September 2026 out in whole Monday-first weeks", () => {
    const cells = monthGrid("2026-09");
    expect(cells).toHaveLength(35);
    expect(cells[0]).toEqual({ date: "2026-08-31", day: 31, inMonth: false });
    expect(cells[1]).toEqual({ date: "2026-09-01", day: 1, inMonth: true });
    expect(cells.filter((c) => c.inMonth)).toHaveLength(30);
    expect(cells[34]).toEqual({ date: "2026-10-04", day: 4, inMonth: false });
  });

  it("starts a month that begins on a Monday without a leading week", () => {
    // 2026-06-01 is a Monday.
    expect(monthGrid("2026-06")[0]).toEqual({ date: "2026-06-01", day: 1, inMonth: true });
  });

  it("returns nothing for a malformed month", () => {
    expect(monthGrid("September")).toEqual([]);
  });
});

describe("publishingDays", () => {
  it("counts publications per day inside the month only", () => {
    expect(monthOf("2026-09-14")).toBe("2026-09");
    expect(
      publishingDays("2026-09", ["2026-09-14", "2026-08-31", "2026-09-14", "2026-09-02", "2026-10-01"]),
    ).toEqual([
      { date: "2026-09-02", count: 1 },
      { date: "2026-09-14", count: 2 },
    ]);
  });
});
