import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  ABOUT_NAV,
  ABOUT_PAGE_KEYS,
  aboutNavItem,
  aboutPager,
  isAboutPathActive,
  relatedAboutPages,
} from "./nav";
import enMessages from "@/messages/en.json";
import kmMessages from "@/messages/km.json";

const ROOT = path.resolve(__dirname, "..", "..");

describe("ABOUT_NAV", () => {
  it("covers every About page key exactly once", () => {
    expect(ABOUT_NAV.map((i) => i.key)).toEqual([...ABOUT_PAGE_KEYS]);
  });

  it("points at routes that actually exist", () => {
    // Catches a typo in an href before it ships as a 404 in the sub-nav on
    // all five pages at once.
    for (const item of ABOUT_NAV) {
      const route = path.join(ROOT, "app", "[locale]", "(public)", item.href, "page.tsx");
      expect(fs.existsSync(route), `${item.href} has no page.tsx`).toBe(true);
    }
  });

  it("uses locale-agnostic hrefs — never a hard-coded /km prefix", () => {
    // These go through Link from @/i18n/navigation, which adds the prefix.
    // A literal "/km/..." here would produce "/km/km/..." on Khmer pages.
    for (const item of ABOUT_NAV) {
      expect(item.href.startsWith("/about/")).toBe(true);
      expect(item.href).not.toContain("/km");
    }
  });

  it("has a label in the `nav` namespace in BOTH locales", () => {
    // A missing key renders the raw key string to real users.
    for (const item of ABOUT_NAV) {
      expect(
        (enMessages.nav as Record<string, string>)[item.labelKey],
        `en nav.${item.labelKey}`,
      ).toBeTruthy();
      expect(
        (kmMessages.nav as Record<string, string>)[item.labelKey],
        `km nav.${item.labelKey}`,
      ).toBeTruthy();
    }
  });

  it("has a description in the `about` namespace in BOTH locales", () => {
    // The `about` namespace mixes flat strings and nested groups, so it is
    // read through `unknown` rather than asserted into a uniform record.
    const lookup = (messages: unknown, group: string, key: string) =>
      (messages as Record<string, Record<string, Record<string, string>>>).about?.[group]?.[key];

    for (const item of ABOUT_NAV) {
      const [group, key] = item.descriptionKey.split(".");
      const en = lookup(enMessages, group, key);
      const km = lookup(kmMessages, group, key);
      expect(en, `en about.${item.descriptionKey}`).toBeTruthy();
      expect(km, `km about.${item.descriptionKey}`).toBeTruthy();
    }
  });
});

describe("aboutNavItem", () => {
  it("resolves every key", () => {
    for (const key of ABOUT_PAGE_KEYS) {
      expect(aboutNavItem(key).key).toBe(key);
    }
  });
});

describe("aboutPager", () => {
  it("does not wrap at either end", () => {
    // A wrapping pager sends someone who reached the last page back to the
    // first, which reads as being stuck in a loop.
    expect(aboutPager("ourJourney").previous).toBeNull();
    expect(aboutPager("ourJourney").next?.key).toBe("rules");
    expect(aboutPager("team").next).toBeNull();
    expect(aboutPager("team").previous?.key).toBe("collection");
  });

  it("links neighbours in reading order", () => {
    expect(aboutPager("timings").previous?.key).toBe("rules");
    expect(aboutPager("timings").next?.key).toBe("collection");
  });
});

describe("relatedAboutPages", () => {
  it("lists the other four pages and never the current one", () => {
    for (const key of ABOUT_PAGE_KEYS) {
      const related = relatedAboutPages(key);
      expect(related).toHaveLength(ABOUT_NAV.length - 1);
      expect(related.some((i) => i.key === key)).toBe(false);
    }
  });
});

describe("isAboutPathActive", () => {
  it("matches the exact path", () => {
    expect(isAboutPathActive("/about/rules", "/about/rules")).toBe(true);
  });

  it("tolerates a trailing slash", () => {
    expect(isAboutPathActive("/about/rules/", "/about/rules")).toBe(true);
  });

  it("does NOT prefix-match", () => {
    // A prefix match would light up two tabs at once the day a page nests
    // under another, and aria-current="page" must be unique.
    expect(isAboutPathActive("/about/rules/penalties", "/about/rules")).toBe(false);
    expect(isAboutPathActive("/about", "/about/rules")).toBe(false);
  });

  it("marks exactly one item active for each page's own path", () => {
    for (const item of ABOUT_NAV) {
      const active = ABOUT_NAV.filter((i) => isAboutPathActive(item.href, i.href));
      expect(active).toHaveLength(1);
      expect(active[0].key).toBe(item.key);
    }
  });
});
