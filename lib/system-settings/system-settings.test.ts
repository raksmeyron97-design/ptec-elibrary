// lib/system-settings/system-settings.test.ts
//
// Guards the System Settings platform:
//   1. PARITY — the code defaults, mapped through buildSiteConfig(), must
//      reproduce the legacy lib/ptec.ts values EXACTLY. This is the
//      no-regression contract for the pre-migration fallback path: with an
//      empty/missing site_settings table the public site renders exactly what
//      it rendered before the settings platform existed.
//   2. VALIDATION — the section validators normalize good input and reject
//      unsafe input (javascript: URLs, malformed hours, bad phones/emails).
//   3. DERIVATION — hour sentences/specs and closure logic are pure and
//      timezone-correct.
//   4. ALLOWLIST — the public SiteConfig contains only the expected keys, so
//      a future field added to a stored document can never leak to the public
//      site without being mapped deliberately.

import { describe, it, expect } from "vitest";
import { PTEC } from "@/lib/ptec";
import { DEFAULT_SECTION_DOCS, DEFAULT_HOURS } from "./defaults";
import { buildSiteConfig } from "./map";
import {
  diffPaths,
  isGoogleMapsEmbedUrl,
  isSafeHttpsUrl,
  normalizeKhPhone,
  phoneToIntlDisplay,
  phoneToTel,
  validateContact,
  validateHours,
  validateLinks,
  validateOrganization,
  validateSectionDoc,
  validateSeo,
} from "./schemas";
import {
  activeClosure,
  hoursSentence,
  upcomingClosures,
  weeklyToOpeningHoursSpec,
} from "./hours";

const cfg = buildSiteConfig(DEFAULT_SECTION_DOCS);

describe("parity: defaults reproduce lib/ptec.ts exactly", () => {
  it("contact + phone formats", () => {
    expect(cfg.phone).toBe(PTEC.phone);
    expect(cfg.phoneIntl).toBe(PTEC.phoneIntl);
    expect(cfg.phoneTel).toBe(PTEC.phoneTel);
    expect(cfg.phoneLibrary).toBe(PTEC.phoneLibrary);
    expect(cfg.phoneLibraryTel).toBe(PTEC.phoneLibraryTel);
    expect(cfg.email).toBe(PTEC.email);
    expect(cfg.emailInternational).toBe(PTEC.emailInternational);
    expect(cfg.address).toEqual(PTEC.address);
  });

  it("organization names", () => {
    expect(cfg.name).toEqual(PTEC.name);
  });

  it("links + sameAs", () => {
    expect(cfg.links.website).toBe(PTEC.links.website);
    expect(cfg.links.facebook).toBe(PTEC.links.facebook);
    expect(cfg.links.messenger).toBe(PTEC.links.messenger);
    expect(cfg.links.youtube).toBe(PTEC.links.youtube);
    expect(cfg.links.telegram).toBe(PTEC.links.telegram);
    expect(cfg.links.mapPlace).toBe(PTEC.links.mapPlace);
    expect(cfg.links.mapEmbed).toBe(PTEC.links.mapEmbed);
    expect(cfg.sameAs).toEqual([...PTEC.sameAs]);
  });

  it("hours: derived sentences and spec match the hand-written originals", () => {
    expect(cfg.hours.openingHoursSpec).toEqual([...PTEC.hours.openingHoursSpec]);
    expect(cfg.hours.en).toBe(PTEC.hours.en);
    expect(cfg.hours.km).toBe(PTEC.hours.km);
  });

  it("every default section document passes its own validator unchanged", () => {
    for (const [section, doc] of Object.entries(DEFAULT_SECTION_DOCS)) {
      const result = validateSectionDoc(section as never, doc);
      expect(result.ok, `${section} should validate`).toBe(true);
      if (result.ok) expect(result.value).toEqual(doc);
    }
  });
});

describe("allowlist: public SiteConfig shape is closed", () => {
  it("contains exactly the expected top-level keys", () => {
    expect(Object.keys(cfg).sort()).toEqual(
      [
        "name", "libraryName",
        "phone", "phoneIntl", "phoneTel", "phoneLibrary", "phoneLibraryTel",
        "email", "emailInternational",
        "address", "hours", "links", "sameAs", "seo",
      ].sort(),
    );
  });

  it("never contains draft/editor/version metadata", () => {
    const json = JSON.stringify(cfg);
    for (const forbidden of ["draft", "published_by", "publishedBy", "version"]) {
      expect(json).not.toContain(forbidden);
    }
  });
});

describe("phone normalization (Cambodia)", () => {
  it("accepts local and international input and canonicalizes", () => {
    expect(normalizeKhPhone("092 788 990")).toBe("092 788 990");
    expect(normalizeKhPhone("092788990")).toBe("092 788 990");
    expect(normalizeKhPhone("+855 92 788 990")).toBe("092 788 990");
    expect(normalizeKhPhone("(+855) 92-788-990")).toBe("092 788 990");
    expect(normalizeKhPhone("0123456789")).toBe("012 345 6789"); // 10-digit
  });

  it("rejects junk", () => {
    expect(normalizeKhPhone("12345")).toBeNull();
    expect(normalizeKhPhone("not a phone")).toBeNull();
    expect(normalizeKhPhone("+1 555 0100")).toBeNull();
  });

  it("derives tel: and international display", () => {
    expect(phoneToTel("092 788 990")).toBe("tel:+85592788990");
    expect(phoneToIntlDisplay("092 788 990")).toBe("(+855) 92 788 990");
  });
});

describe("URL safety", () => {
  it("accepts https URLs only", () => {
    expect(isSafeHttpsUrl("https://www.ptec.edu.kh")).toBe(true);
    expect(isSafeHttpsUrl("http://www.ptec.edu.kh")).toBe(false);
    expect(isSafeHttpsUrl("javascript" + ":alert(1)")).toBe(false);
    expect(isSafeHttpsUrl("data:text/html,x")).toBe(false);
    expect(isSafeHttpsUrl("//evil.com")).toBe(false);
    expect(isSafeHttpsUrl("https://localhost")).toBe(false); // no dot
  });

  it("map embeds must live on google.com/maps/embed", () => {
    expect(isGoogleMapsEmbedUrl(PTEC.links.mapEmbed)).toBe(true);
    expect(isGoogleMapsEmbedUrl("https://evil.com/maps/embed?x=1")).toBe(false);
    expect(isGoogleMapsEmbedUrl("https://www.google.com/search?q=x")).toBe(false);
  });

  it("links validator rejects a javascript: URL with a field error", () => {
    const doc = { ...DEFAULT_SECTION_DOCS.links, facebook: "javascript:alert(1)" };
    const result = validateLinks(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.path === "facebook")).toBe(true);
    }
  });
});

describe("section validators", () => {
  it("organization requires names", () => {
    const bad = validateOrganization({ name: { en: "", km: "", short: "" }, libraryName: { en: "", km: "" } });
    expect(bad.ok).toBe(false);
  });

  it("contact rejects a bad email and normalizes phones", () => {
    const result = validateContact({
      ...DEFAULT_SECTION_DOCS.contact,
      phone: "+855 92 788 990",
      email: "not-an-email",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((e) => e.path)).toContain("email");
    }

    const good = validateContact({ ...DEFAULT_SECTION_DOCS.contact, phone: "+855 92 788 990" });
    expect(good.ok).toBe(true);
    if (good.ok) expect(good.value.phone).toBe("092 788 990");
  });

  it("hours rejects close <= open, overlaps and bad closure ranges", () => {
    const badClose = validateHours({
      weekly: { ...DEFAULT_HOURS.weekly, "1": [{ open: "09:00", close: "08:00" }] },
      closures: [],
    });
    expect(badClose.ok).toBe(false);

    const overlap = validateHours({
      weekly: {
        ...DEFAULT_HOURS.weekly,
        "1": [
          { open: "07:00", close: "12:00" },
          { open: "11:00", close: "17:00" },
        ],
      },
      closures: [],
    });
    expect(overlap.ok).toBe(false);

    const badClosure = validateHours({
      weekly: DEFAULT_HOURS.weekly,
      closures: [{ from: "2026-09-10", to: "2026-09-01", reason: { en: "x", km: "x" } }],
    });
    expect(badClosure.ok).toBe(false);
  });

  it("hours requires at least one open day", () => {
    const result = validateHours({
      weekly: { "0": [], "1": [], "2": [], "3": [], "4": [], "5": [], "6": [] },
      closures: [],
    });
    expect(result.ok).toBe(false);
  });

  it("seo requires %s in the title template", () => {
    const result = validateSeo({ ...DEFAULT_SECTION_DOCS.seo, titleTemplate: "PTEC Library" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((e) => e.path)).toContain("titleTemplate");
  });
});

describe("hours derivation", () => {
  it("weeklyToOpeningHoursSpec groups consecutive identical days", () => {
    expect(weeklyToOpeningHoursSpec(DEFAULT_HOURS.weekly)).toEqual([
      "Mo-Fr 07:00-17:00",
      "Sa 08:00-16:00",
    ]);
  });

  it("multiple intervals per day emit one spec line each", () => {
    const weekly = {
      ...DEFAULT_HOURS.weekly,
      "6": [
        { open: "08:00", close: "12:00" },
        { open: "13:00", close: "16:00" },
      ],
    };
    expect(weeklyToOpeningHoursSpec(weekly)).toEqual([
      "Mo-Fr 07:00-17:00",
      "Sa 08:00-12:00",
      "Sa 13:00-16:00",
    ]);
  });

  it("hoursSentence adapts when the schedule changes", () => {
    const weekly = { ...DEFAULT_HOURS.weekly, "6": [] }; // Saturday closed too
    const sentence = hoursSentence("en", weekly);
    expect(sentence).toContain("Monday – Friday: 7:00 AM – 5:00 PM");
    expect(sentence).toContain("(Saturday, Sunday: Closed)");
  });
});

describe("closures (Asia/Phnom_Penh)", () => {
  const closures = [
    { from: "2026-04-14", to: "2026-04-16", reason: { en: "Khmer New Year", km: "បុណ្យចូលឆ្នាំខ្មែរ" } },
  ];

  it("activeClosure matches Cambodia-local dates, not UTC", () => {
    // 2026-04-13T18:00Z is already 2026-04-14 01:00 in Phnom Penh (UTC+7).
    const inside = new Date("2026-04-13T18:00:00Z");
    expect(activeClosure(inside, closures)?.reason.en).toBe("Khmer New Year");
    // 2026-04-16T18:00Z is 2026-04-17 in Phnom Penh — closure over.
    const after = new Date("2026-04-16T18:00:00Z");
    expect(activeClosure(after, closures)).toBeNull();
  });

  it("upcomingClosures keeps entries until they fully pass", () => {
    expect(upcomingClosures(new Date("2026-04-15T00:00:00Z"), closures)).toHaveLength(1);
    expect(upcomingClosures(new Date("2026-05-01T00:00:00Z"), closures)).toHaveLength(0);
  });
});

describe("diffPaths", () => {
  it("reports changed leaf paths in either direction", () => {
    const a = { name: { en: "A", km: "B" }, phone: "1" };
    const b = { name: { en: "A", km: "C" }, phone: "1", extra: true };
    expect(diffPaths(a, b).sort()).toEqual(["extra", "name.km"]);
    expect(diffPaths(a, a)).toEqual([]);
  });

  it("treats array changes as leaf changes at their index paths", () => {
    const a = { closures: [{ from: "2026-01-01" }] };
    const b = { closures: [] as unknown[] };
    expect(diffPaths(a, b)).toEqual(["closures.0"]);
  });
});
