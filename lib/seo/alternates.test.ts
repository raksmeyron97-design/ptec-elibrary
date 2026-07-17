import { describe, expect, it } from "vitest";
import { localeAlternates, localeUrls } from "@/lib/seo/alternates";
import { SITE_URL } from "@/lib/seo/site";

describe("localeUrls", () => {
  it("treats the root specially: bare origin for en, /km with no trailing slash", () => {
    expect(localeUrls("/")).toEqual({ en: SITE_URL, km: `${SITE_URL}/km` });
  });

  it("prefixes km for non-root paths", () => {
    expect(localeUrls("/books?page=2")).toEqual({
      en: `${SITE_URL}/books?page=2`,
      km: `${SITE_URL}/km/books?page=2`,
    });
  });
});

describe("localeAlternates", () => {
  it("builds reciprocal canonicals with x-default on English", () => {
    const en = localeAlternates("/theses/foo", "en");
    expect(en.canonical).toBe(`${SITE_URL}/theses/foo`);
    expect(en.languages["x-default"]).toBe(`${SITE_URL}/theses/foo`);

    const km = localeAlternates("/theses/foo", "km");
    expect(km.canonical).toBe(`${SITE_URL}/km/theses/foo`);
    expect(km.languages.en).toBe(`${SITE_URL}/theses/foo`);
  });

  it("homepage canonicals never point at /home or /km/", () => {
    expect(localeAlternates("/", "en").canonical).toBe(SITE_URL);
    expect(localeAlternates("/", "km").canonical).toBe(`${SITE_URL}/km`);
  });
});
