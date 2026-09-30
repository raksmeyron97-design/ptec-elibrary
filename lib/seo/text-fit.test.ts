// lib/seo/text-fit.test.ts — descriptions and titles that fit without being cut
// mid-word, plus the date precision and per-locale brand rules they travel with.
// Fixtures are the strings production published on 2026-09-30
// (docs/seo/AUDIT-VERIFICATION.md F3, F7, F9).

import { describe, expect, it } from "vitest";
import { codePoints, fitDescription, fitTitle, fittedTitleText, graphemeLength, META_DESCRIPTION_MAX } from "./text-fit";
import { isoDateAtPrecision, parsePublicationDate, scholarDateAtPrecision } from "./dates";
import { brandSuffixFor, libraryNameFor, localizedTitleTemplate, siteNameFor } from "./brand";

const KM =
  "សៀវភៅ «រលក» គឺជាឯកសារជំនួយស្មារតី និងការសិក្សាស្រាវជ្រាវដ៏មានសារៈសំខាន់ ក្នុងមុខវិជ្ជារូបវិទ្យា។ " +
  "ខ្លឹមសាររួមមានការពន្យល់ទ្រឹស្តីវិទ្យាសាស្ត្រ ការពិសោធន៍ និងការអនុវត្តជាក់ស្តែង ដែលជួយអ្នកអានឱ្យយល់ដឹងកាន់តែស៊ីជម្រៅ។";
const EN =
  "This comprehensive introduction to qualitative research methods covers research design, data collection " +
  "through interviews and observation, research ethics, analysis and writing up findings for students.";
const KM_NO_SENTENCE = "ការសិក្សាស្រាវជ្រាវ".repeat(20); // one long run, no space, no ។

describe("fitDescription", () => {
  it("never ends in an ellipsis (the old cut: '…analysis and wr...')", () => {
    for (const [text, locale] of [[EN, "en"], [KM, "km"], [KM_NO_SENTENCE, "km"]] as const) {
      const out = fitDescription(text, locale);
      expect(out).not.toMatch(/(\.\.\.|…)$/);
      expect(codePoints(out)).toBeLessThanOrEqual(META_DESCRIPTION_MAX);
      expect(out.length).toBeGreaterThan(0);
    }
  });

  it("ends a Khmer description on its sentence mark when one falls late enough", () => {
    expect(fitDescription(KM, "km")).toMatch(/ក្នុងមុខវិជ្ជារូបវិទ្យា។$/);
  });

  it("cuts English on a whole word and drops the stranded joiner", () => {
    const out = fitDescription(EN, "en");
    expect(EN.startsWith(out)).toBe(true);
    const next = EN.slice(out.length);
    expect(next).toMatch(/^[\s,]/); // the next character was a boundary, not a letter
    expect(out).not.toMatch(/[,;:\s]$/);
  });

  it("never splits a Khmer grapheme cluster, even with no word boundary to use", () => {
    const out = fitDescription(KM_NO_SENTENCE, "km");
    expect(KM_NO_SENTENCE.startsWith(out)).toBe(true);
    // The remainder starts a new cluster: no combining mark or coeng is orphaned.
    expect(KM_NO_SENTENCE.slice(out.length)).not.toMatch(/^[ា-៓៝]/u);
  });

  it("returns short text as is, minus an ellipsis a stored summary arrived with", () => {
    expect(fitDescription("A short, complete description.", "en")).toBe("A short, complete description.");
    expect(fitDescription("Summary cut upstream...", "en")).toBe("Summary cut upstream");
    expect(fitDescription("  ", "en")).toBe("");
  });

  it("negative control: the old helper's output fails these rules", () => {
    const old = `${EN.slice(0, 157)}...`;
    expect(old).toMatch(/(\.\.\.|…)$/);
  });
});

describe("fitTitle", () => {
  const brandEn = " · PTEC Library";
  const brandKm = " · បណ្ណាល័យ វ.គ.ភ";
  const LONG =
    "Development of a Handmade Conductivity Measurement Device for a Thin-Film Semiconductor and Its Application to Polypyrrole";

  it("keeps the brand when the whole fits", () => {
    expect(fitTitle("Free Educational Books", { locale: "en", brandSuffix: brandEn })).toBe("Free Educational Books");
    expect(fitTitle("រលក", { locale: "km", brandSuffix: brandKm })).toBe("រលក");
  });

  it("drops the brand, never the item name, when it does not (the article was cut at 60 characters)", () => {
    const t = fitTitle(LONG, { locale: "en", brandSuffix: brandEn });
    expect(t).toEqual({ absolute: LONG });
    expect(fittedTitleText(t)).toBe(LONG);
  });

  it("gives Khmer a shorter budget, counted in graphemes", () => {
    const km = "ការអភិវឌ្ឍឧបករណ៍វាស់ចរន្តអគ្គិសនីធ្វើដោយដៃសម្រាប់សារធាតុពាក់កណ្ដាលចម្លង";
    expect(graphemeLength(km, "km")).toBeLessThan(codePoints(km));
    expect(fitTitle(km, { locale: "km", brandSuffix: brandKm })).toEqual({ absolute: km });
  });
});

describe("publication dates at the known precision", () => {
  it("publishes a stored year (YYYY-01-01) as the year", () => {
    expect(isoDateAtPrecision("2016-01-01")).toBe("2016");
    expect(scholarDateAtPrecision("2026-01-01")).toBe("2026");
  });

  it("keeps a real day, in UTC", () => {
    expect(isoDateAtPrecision("2024-06-15")).toBe("2024-06-15");
    expect(scholarDateAtPrecision("2024-06-15T23:30:00-05:00")).toBe("2024/06/16");
    expect(scholarDateAtPrecision("2023-01-01T00:00:00+00:00")).toBe("2023");
  });

  it("publishes nothing rather than a guess", () => {
    expect(isoDateAtPrecision(null, "", "not a date")).toBeUndefined();
    expect(parsePublicationDate("0000-00-00")).toBeNull();
  });
});

describe("one brand in two scripts", () => {
  const org = { libraryName: "PTEC Library", libraryNameKm: "បណ្ណាល័យ វ.គ.ភ", siteName: "PTEC Library" };

  it("swaps the library name inside the published template on /km only", () => {
    const names = { en: org.libraryName, km: org.libraryNameKm };
    expect(localizedTitleTemplate("%s · PTEC Library", names, "km")).toBe("%s · បណ្ណាល័យ វ.គ.ភ");
    expect(localizedTitleTemplate("%s · PTEC Library", names, "en")).toBe("%s · PTEC Library");
    // An admin's own wording without the name is kept.
    expect(localizedTitleTemplate("%s — Library", names, "km")).toBe("%s — Library");
  });

  it("measures the suffix the layout will add", () => {
    expect(brandSuffixFor({ ...org, titleTemplate: "%s · PTEC Library" }, "km")).toBe(" · បណ្ណាល័យ វ.គ.ភ");
    expect(brandSuffixFor(org, "en")).toBe(" · PTEC Library");
  });

  it("names the site in the page's script, unless an admin chose a different site name", () => {
    expect(libraryNameFor(org, "km")).toBe("បណ្ណាល័យ វ.គ.ភ");
    expect(siteNameFor(org, "km")).toBe("បណ្ណាល័យ វ.គ.ភ");
    expect(siteNameFor(org, "en")).toBe("PTEC Library");
    expect(siteNameFor({ ...org, siteName: "PTEC e-Library Portal" }, "km")).toBe("PTEC e-Library Portal");
  });
});
