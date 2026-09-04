import { describe, expect, it } from "vitest";
import { pageFromPercent, parseLocalPosition, resolveResumePage, serverTimestamp, shouldOfferContinue } from "./resume";

describe("resolveResumePage", () => {
  const numPages = 500;

  it("uses the exact local page when logged out", () => {
    expect(resolveResumePage({ local: { p: 124, pct: 25 }, serverPct: 0, isLoggedIn: false, numPages })).toBe(124);
  });

  it("uses the exact local page when the server agrees within tolerance", () => {
    expect(resolveResumePage({ local: { p: 124, pct: 25 }, serverPct: 26, isLoggedIn: true, numPages })).toBe(124);
    expect(resolveResumePage({ local: { p: 124, pct: 25 }, serverPct: 27, isLoggedIn: true, numPages })).toBe(124);
  });

  it("yields to the server when the book was read further elsewhere — never overwrites a newer position", () => {
    expect(resolveResumePage({ local: { p: 124, pct: 25 }, serverPct: 60, isLoggedIn: true, numPages })).toBeNull();
    expect(pageFromPercent(60, numPages)).toBe(300);
  });

  it("lets the NEWER position win when both carry a timestamp", () => {
    const serverAt = Date.parse("2026-09-04T00:00:00Z");
    // Device wrote after the server's last save → the device is right, even 40 points apart.
    expect(
      resolveResumePage({ local: { p: 124, pct: 25, t: serverAt + 60_000 }, serverPct: 65, serverAt, isLoggedIn: true, numPages }),
    ).toBe(124);
    // Device wrote BEFORE the server's last save → the book moved on elsewhere.
    expect(
      resolveResumePage({ local: { p: 124, pct: 25, t: serverAt - 60_000 }, serverPct: 65, serverAt, isLoggedIn: true, numPages }),
    ).toBeNull();
    // Inside clock slack counts as "not newer".
    expect(
      resolveResumePage({ local: { p: 124, pct: 25, t: serverAt + 400 }, serverPct: 65, serverAt, isLoggedIn: true, numPages }),
    ).toBeNull();
  });

  it("keeps the device's page when the server still holds what this device last synced", () => {
    // Read to 25% here, closed before the autosave: server has the 3% this
    // device sent earlier. Nobody else wrote, so the exact page is newest —
    // whatever the clocks say.
    const serverAt = Date.parse("2026-09-04T00:00:00Z");
    expect(
      resolveResumePage({ local: { p: 124, pct: 25, t: serverAt - 5000, s: 3 }, serverPct: 3, serverAt, isLoggedIn: true, numPages }),
    ).toBe(124);
    // Another device wrote since (server no longer holds our synced value).
    expect(
      resolveResumePage({ local: { p: 124, pct: 25, t: serverAt - 5000, s: 3 }, serverPct: 60, serverAt, isLoggedIn: true, numPages }),
    ).toBeNull();
  });

  it("uses local when the server knows nothing (0%)", () => {
    expect(resolveResumePage({ local: { p: 9, pct: 2 }, serverPct: 0, isLoggedIn: true, numPages })).toBe(9);
  });

  it("clamps the stored page to the real page count and rejects garbage", () => {
    expect(resolveResumePage({ local: { p: 9999, pct: 100 }, serverPct: 0, isLoggedIn: false, numPages })).toBe(500);
    expect(resolveResumePage({ local: { p: 0 }, serverPct: 0, isLoggedIn: false, numPages })).toBeNull();
    expect(resolveResumePage({ local: null, serverPct: 40, isLoggedIn: true, numPages })).toBeNull();
    expect(resolveResumePage({ local: { p: 5 }, serverPct: 0, isLoggedIn: false, numPages: 0 })).toBeNull();
  });
});

describe("shouldOfferContinue", () => {
  it("only prompts when the reader is actually moved off page 1", () => {
    expect(shouldOfferContinue(1)).toBe(false);
    expect(shouldOfferContinue(2)).toBe(true);
  });
});

describe("parseLocalPosition", () => {
  it("parses the stored shape and tolerates corruption", () => {
    expect(parseLocalPosition('{"p":42,"pct":10}')).toEqual({ p: 42, pct: 10, t: undefined, s: undefined });
    expect(parseLocalPosition('{"p":42,"pct":10,"t":1700000000000,"s":8}')).toEqual({ p: 42, pct: 10, t: 1700000000000, s: 8 });
    expect(serverTimestamp("2026-09-04T00:00:00Z")).toBe(Date.parse("2026-09-04T00:00:00Z"));
    expect(serverTimestamp("nope")).toBeNull();
    expect(serverTimestamp(null)).toBeNull();
    expect(parseLocalPosition('{"p":"42"}')).toEqual({ p: undefined, pct: undefined, t: undefined, s: undefined });
    expect(parseLocalPosition("not json")).toBeNull();
    expect(parseLocalPosition(null)).toBeNull();
    expect(parseLocalPosition("null")).toBeNull();
  });
});
