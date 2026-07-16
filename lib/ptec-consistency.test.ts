// lib/ptec-consistency.test.ts
//
// Guards the single-source-of-truth contract for global library information.
// lib/ptec.ts owns contact details and opening hours; every other surface
// (footer, contact page, JSON-LD, translation strings) must derive from it.
// These tests fail the moment a duplicated or retired value re-enters the
// codebase, instead of letting two pages drift apart in production.
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PTEC } from "./ptec";
import { parseOpeningHours, compactHoursLabel } from "./library-hours";

const ROOT = path.resolve(__dirname, "..");

/** Repo-wide fixed-string search over tracked source files (fast, respects .gitignore). */
function grepSource(needle: string): string[] {
  try {
    const out = execFileSync(
      "git",
      ["grep", "-l", "-F", needle, "--", "*.ts", "*.tsx", "*.json"],
      { cwd: ROOT, encoding: "utf8" },
    );
    return out.split("\n").filter(Boolean);
  } catch {
    return []; // git grep exits 1 on no matches
  }
}

describe("contact info single source of truth", () => {
  it("the phone number literal exists ONLY in lib/ptec.ts (+ this test)", () => {
    const offenders = grepSource(PTEC.phone).filter(
      (f) => !["lib/ptec.ts", "lib/ptec-consistency.test.ts"].includes(f),
    );
    expect(offenders).toEqual([]);
  });

  it("the tel: href literal exists ONLY in lib/ptec.ts", () => {
    const offenders = grepSource("+85592788990").filter(
      (f) => !["lib/ptec.ts", "lib/ptec-consistency.test.ts"].includes(f),
    );
    expect(offenders).toEqual([]);
  });

  it("the contact email is not hardcoded outside sanctioned files", () => {
    // lib/push.ts uses it as the VAPID mailto fallback — acceptable, server-only.
    const allowed = ["lib/ptec.ts", "lib/ptec-consistency.test.ts", "lib/push.ts"];
    const offenders = grepSource(PTEC.email).filter((f) => !allowed.includes(f));
    expect(offenders).toEqual([]);
  });
});

describe("opening hours single source of truth", () => {
  const spec = parseOpeningHours(PTEC.hours.openingHoursSpec);
  const fmt = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
  const weekdayRange = spec[1][0]; // Monday
  const satRange = spec[6][0];

  it("openingHoursSpec parses to Mon–Fri + Sat windows, Sunday closed", () => {
    for (const day of [1, 2, 3, 4, 5]) expect(spec[day]).toEqual([weekdayRange]);
    expect(spec[6]).toEqual([satRange]);
    expect(spec[0]).toEqual([]);
  });

  it("compactHoursLabel (contact page) derives from the spec", () => {
    expect(compactHoursLabel("km")).toBe(
      `ច-សុ ${fmt(weekdayRange.open)}–${fmt(weekdayRange.close)} · សៅ ${fmt(satRange.open)}–${fmt(satRange.close)}`,
    );
    expect(compactHoursLabel("en")).toBe(
      `Mon-Fri ${fmt(weekdayRange.open)}–${fmt(weekdayRange.close)} · Sat ${fmt(satRange.open)}–${fmt(satRange.close)}`,
    );
  });

  it.each(["en", "km"])(
    "messages/%s.json aboutHours*Time strings match the spec (translations may not drift)",
    (locale) => {
      const messages = JSON.parse(
        readFileSync(path.join(ROOT, "messages", `${locale}.json`), "utf8"),
      );
      // The timings strings live in whichever namespace holds aboutHours keys.
      const ns = Object.values(messages).find(
        (v): v is Record<string, string> =>
          !!v && typeof v === "object" && "aboutHoursWeekdayTime" in (v as object),
      );
      expect(ns).toBeDefined();
      expect(ns!.aboutHoursWeekdayTime).toBe(
        `${fmt(weekdayRange.open)}–${fmt(weekdayRange.close)}`,
      );
      expect(ns!.aboutHoursSatTime).toBe(`${fmt(satRange.open)}–${fmt(satRange.close)}`);
    },
  );

  it("PTEC.hours display sentences agree with the spec (7 AM–5 PM / 8 AM–4 PM)", () => {
    // Coarse but effective: the human-readable strings must mention the same
    // clock hours as the machine spec. If the spec changes and these strings
    // are forgotten, this fails.
    expect(weekdayRange).toEqual({ open: 7 * 60, close: 17 * 60 });
    expect(satRange).toEqual({ open: 8 * 60, close: 16 * 60 });
    expect(PTEC.hours.en).toContain("7:00 AM – 5:00 PM");
    expect(PTEC.hours.en).toContain("8:00 AM – 4:00 PM");
  });
});

describe("no resurrected hardcoded counters", () => {
  it("no source file hardcodes a '###+ resources' style figure", () => {
    // The homepage figure must come from lib/collection-stats.ts. A literal
    // like "120+" next to a resources label is the exact bug this guards.
    // lib/collection-stats.test.ts legitimately asserts the "120+" output of
    // formatApproximateCount — that's the formatter's own test, not a hardcode.
    const allowed = ["lib/ptec-consistency.test.ts", "lib/collection-stats.test.ts"];
    const offenders = grepSource("120+").filter((f) => !allowed.includes(f));
    expect(offenders).toEqual([]);
  });
});
