import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Below `lg` the ☰ drawer is gone: the phone top bar is the brand and a
// search button, and the tab bar's three sheets (MobileNavSheets) carry every
// destination and control the drawer did. Moving a feature is allowed;
// dropping one is not — this fails if a sheet loses one of them.

const ROOT = path.resolve(__dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");
const SHEETS = read("components/layout/MobileNavSheets.tsx");

describe("the tab bar's sheets carry everything the drawer did", () => {
  it.each([
    ["the digital collections", "DIGITAL_LIBRARY_ITEMS"],
    ["the physical library", 'href="/catalogs"'],
    ["subjects", 'href="/subjects"'],
    ["authors", 'href="/authors"'],
    ["News & Events", 'href="/posts"'],
    ["every About page", "<MobileAboutAccordion"],
    ["the dashboard", 'href="/dashboard"'],
    ["saved books", 'href="/dashboard?tab=saved"'],
    ["settings", 'href="/dashboard/settings"'],
    ["this device's downloads", 'href="/offline-books"'],
    ["notifications", "<NotificationBell"],
    ["the theme toggle", "<ThemeToggle"],
    ["the language switcher", "<LanguageSwitcher"],
    ["the install button", "<InstallPWA"],
    ["the opening hours", "contact.hoursLabel"],
    ["the phone number", "contact.phoneTel"],
    ["the email address", "mailto:"],
    ["directions", "contact.mapPlace"],
    ["sign in", 'href="/auth/login"'],
    ["sign out", 'action="/auth/signout"'],
  ])("%s", (_what, needle) => {
    expect(SHEETS).toContain(needle);
  });

  it("keeps Learning Paths in Explore now that it has no tab of its own", () => {
    // The old Library sheet dropped /paths because Paths had a tab then.
    expect(SHEETS).not.toMatch(/filter\([^)]*!==\s*"\/paths"/);
  });
});

describe("the phone top bar", () => {
  it("renders no drawer", () => {
    expect(read("components/layout/Navbar.tsx")).not.toMatch(/MobileMenu/);
    expect(fs.existsSync(path.join(ROOT, "components/layout/MobileMenu.tsx"))).toBe(false);
  });

  it("is the element the sticky rules in globals.css target", () => {
    expect(read("components/layout/Navbar.tsx")).toMatch(/<header className="site-header /);
    expect(read("app/globals.css")).toMatch(/\.site-header\s*\{\s*position:\s*sticky;/);
  });
});

describe("the tab bar", () => {
  it("draws its tabs in SHELL_TABS order, so the indicator's slot is the tab's slot", () => {
    expect(read("components/layout/MobileBottomNav.tsx")).toMatch(/SHELL_TABS\.map\(/);
  });
});
