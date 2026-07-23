// lib/settings-consistency.test.ts
//
// Guards the single-source-of-truth contract for global organization data.
//
// Replaces the old lib/ptec-consistency.test.ts, which asserted the OPPOSITE
// contract: it pinned every surface to the compiled-in `PTEC` constant and to
// hand-written hour strings in messages/*.json. That is precisely why
// publishing in /admin/system-settings did not reach the public site — the
// tests were enforcing the drift.
//
// The contract now: `site_settings.published` is canonical, read through
// getSiteConfig() / getOrgIdentity(). lib/ptec.ts survives only as the seed +
// emergency fallback behind lib/system-settings/defaults.ts. These tests fail
// the moment a duplicate literal or an unwired call site comes back.

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PTEC } from "./ptec";

const ROOT = path.resolve(__dirname, "..");
const SELF = "lib/settings-consistency.test.ts";

/** Repo-wide fixed-string search over tracked source files (respects .gitignore). */
function grepSource(needle: string, globs = ["*.ts", "*.tsx"]): string[] {
  try {
    const out = execFileSync("git", ["grep", "-l", "-F", needle, "--", ...globs], {
      cwd: ROOT,
      encoding: "utf8",
    });
    return out.split("\n").filter(Boolean);
  } catch {
    return []; // git grep exits 1 on no matches
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. The fallback constant stays a fallback
// ─────────────────────────────────────────────────────────────────────────────

describe("lib/ptec.ts is the emergency fallback, not a consumer-facing source", () => {
  it("is imported only by the settings defaults (+ its own tests)", () => {
    const allowed = [
      "lib/system-settings/defaults.ts",
      "lib/system-settings/system-settings.test.ts",
      SELF,
    ];
    const offenders = grepSource("@/lib/ptec").filter((f) => !allowed.includes(f));
    expect(offenders).toEqual([]);
  });

  it("the phone literal appears only in the fallback + seed", () => {
    const allowed = ["lib/ptec.ts", SELF];
    expect(grepSource(PTEC.phone).filter((f) => !allowed.includes(f))).toEqual([]);
  });

  it("the tel: href literal appears only in the fallback", () => {
    const allowed = ["lib/ptec.ts", SELF];
    expect(grepSource("+85592788990").filter((f) => !allowed.includes(f))).toEqual([]);
  });

  it("the contact email is not hardcoded outside sanctioned files", () => {
    // lib/push.ts uses it as the VAPID mailto fallback — server-only, and the
    // push spec requires a literal contact URI at module scope.
    const allowed = ["lib/ptec.ts", "lib/push.ts", SELF];
    expect(grepSource(PTEC.email).filter((f) => !allowed.includes(f))).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. The retired duplicate constants must not come back
// ─────────────────────────────────────────────────────────────────────────────

describe("no second source of truth for the organization name", () => {
  it.each(["PTEC_NAME", "PTEC_LIBRARY_NAME"])(
    "%s is gone and stays gone (use getOrgIdentity())",
    (symbol) => {
      expect(grepSource(symbol).filter((f) => f !== SELF)).toEqual([]);
    },
  );

  it("the institution name is not hardcoded in rendered identity surfaces", () => {
    // Allowed, and why:
    //  • lib/ptec.ts + defaults.ts  — the seed / emergency fallback itself
    //  • *.test.ts                  — fixtures asserting concrete output
    //  • about pages + library-info — long-form EDITORIAL prose (history,
    //    mission, departmental structure). These are page content, not
    //    configuration; they are authored per page and are outside the
    //    settings schema. They are listed explicitly so the list stays a
    //    conscious decision rather than a silent hole.
    const allowed = [
      "lib/ptec.ts",
      "lib/system-settings/defaults.ts",
      "lib/library-info.ts",
      "app/[locale]/(public)/about/collection/page.tsx",
      "app/[locale]/(public)/about/committee/page.tsx",
      "app/[locale]/(public)/about/our-journey/page.tsx",
      "app/[locale]/(public)/about/page.tsx",
      "app/[locale]/(public)/about/rules/page.tsx",
      "app/[locale]/(public)/about/team/page.tsx",
      "app/[locale]/(public)/about/timings/page.tsx",
      SELF,
    ];
    const offenders = grepSource(PTEC.name.en).filter(
      (f) => !allowed.includes(f) && !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"),
    );
    expect(offenders).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Every metadata / JSON-LD call site is wired to the published identity
// ─────────────────────────────────────────────────────────────────────────────

const IDENTITY_BUILDERS = [
  "buildBookMetadata",
  "bookJsonLd",
  "booksCollectionJsonLd",
  "buildThesisMetadata",
  "thesisJsonLd",
  "thesesCollectionJsonLd",
  "buildPublicationMetadata",
  "publicationJsonLd",
  "publicationsCollectionJsonLd",
  "buildPathMetadata",
  "buildPathsListingMetadata",
  "pathCourseJsonLd",
  "pathsCollectionJsonLd",
  "postsCollectionJsonLd",
  "postEventJsonLd",
  "buildListingMetadata",
  "thesisScholarMeta",
];

describe("published identity reaches every SEO surface", () => {
  it("each app/ file calling an identity builder also resolves getOrgIdentity()", () => {
    const unwired: string[] = [];
    for (const builder of IDENTITY_BUILDERS) {
      for (const file of grepSource(`${builder}(`)) {
        if (!file.startsWith("app/")) continue; // the builders' own modules + tests
        const source = readFileSync(path.join(ROOT, file), "utf8");
        if (!source.includes("getOrgIdentity")) unwired.push(`${file} → ${builder}`);
      }
    }
    // A page that forgets the org argument silently renders the emergency
    // fallback branding instead of the published settings — fail loudly here.
    expect([...new Set(unwired)]).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Translations must not restate published values
// ─────────────────────────────────────────────────────────────────────────────

describe("messages/*.json do not duplicate published organization data", () => {
  const locales = ["en", "km"] as const;

  it.each(locales)("%s: identity strings are placeholders, not literals", (locale) => {
    const messages = JSON.parse(
      readFileSync(path.join(ROOT, "messages", `${locale}.json`), "utf8"),
    ) as Record<string, Record<string, string>>;

    // These three strings render the institution/library name on live pages.
    // They must interpolate it, never spell it out — otherwise publishing a
    // new name updates the footer address block but not the copyright line
    // three centimetres below it.
    expect(messages.footer.copyright).toContain("{institution}");
    expect(messages.footer.copyright).toContain("{library}");
    expect(messages.auth.copyright).toContain("{institution}");
    expect(messages.home.tagline).toContain("{institution}");
  });

  it.each(locales)("%s: no opening-hours clock times survive in messages", (locale) => {
    // Opening hours are published settings, rendered from
    // getSiteConfig().hours. A literal like "7:00–17:00" in a translation is a
    // schedule that no admin can ever change.
    const raw = readFileSync(path.join(ROOT, "messages", `${locale}.json`), "utf8");
    const offenders = raw.match(/"\d{1,2}:\d{2}\s*[–-]\s*\d{1,2}:\d{2}"/g) ?? [];
    expect(offenders).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Counters (kept from the previous test — still a real regression class)
// ─────────────────────────────────────────────────────────────────────────────

describe("no resurrected hardcoded counters", () => {
  it("no source file hardcodes a '###+ resources' style figure", () => {
    // The homepage figure must come from lib/collection-stats.ts.
    const allowed = [SELF, "lib/collection-stats.test.ts"];
    expect(grepSource("120+").filter((f) => !allowed.includes(f))).toEqual([]);
  });
});
