import { describe, expect, it } from "vitest";
import { localizeDigits, normalizeDigits, parsePageInput } from "./page-input";

describe("localizeDigits", () => {
  it("renders Khmer numerals for km and leaves other locales alone", () => {
    expect(localizeDigits(245, "km")).toBe("២៤៥");
    expect(localizeDigits("12 / 245", "km")).toBe("១២ / ២៤៥");
    expect(localizeDigits(245, "en")).toBe("245");
  });
});

describe("parsePageInput", () => {
  it("accepts ASCII and Khmer digits", () => {
    expect(parsePageInput("125", 245)).toBe(125);
    expect(parsePageInput("១២៥", 245)).toBe(125);
    expect(normalizeDigits("១២៥")).toBe("125");
  });
  it("clamps out-of-range values instead of failing", () => {
    expect(parsePageInput("999", 245)).toBe(245);
    expect(parsePageInput("0", 245)).toBeNull();
    expect(parsePageInput("-5", 245)).toBe(5); // the sign is noise, the number is usable
  });
  it("ignores decoration and rejects empty input", () => {
    expect(parsePageInput(" p. 12 ", 245)).toBe(12);
    expect(parsePageInput("ទំព័រ ១២", 245)).toBe(12);
    expect(parsePageInput("", 245)).toBeNull();
    expect(parsePageInput("abc", 245)).toBeNull();
  });
  it("does not clamp while the page count is unknown", () => {
    expect(parsePageInput("900", 0)).toBe(900);
  });
});
