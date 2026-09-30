import { describe, expect, it } from "vitest";
import { phnomPenhIso } from "./dates";

describe("phnomPenhIso", () => {
  it("writes an instant as Phnom Penh wall-clock time with +07:00", () => {
    expect(phnomPenhIso("2026-10-05T02:00:00+00:00")).toBe("2026-10-05T09:00:00+07:00");
    expect(phnomPenhIso("2026-10-05T20:30:00Z")).toBe("2026-10-06T03:30:00+07:00");
  });
  it("leaves a date-only or unparseable value as given, and nothing as null", () => {
    expect(phnomPenhIso("2026-10-05")).toBe("2026-10-05");
    expect(phnomPenhIso("T10:00 someday")).toBe("T10:00 someday");
    expect(phnomPenhIso(null)).toBeNull();
  });
});
