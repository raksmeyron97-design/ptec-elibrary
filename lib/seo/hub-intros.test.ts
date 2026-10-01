import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import approved from "@/content/hub-intros.json";
import drafts from "@/content/drafts/hub-intros.json";
import { HUB_KEYS, hubIntro, hubIntroProblems, type HubIntroEntry } from "./hub-intros";

const ROOT = path.resolve(__dirname, "../..");
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ") + ".";

describe("content/hub-intros.json holds approved intros only", () => {
  const hubs = (approved as { hubs: Record<string, HubIntroEntry> }).hubs;
  // One test over every entry (not it.each): the file is empty until the
  // first approval, and an empty it.each is an empty suite, which fails.
  it("every entry is a known hub, approved, marker-free and 60–120 English words", () => {
    for (const [hub, entry] of Object.entries(hubs)) {
      expect(HUB_KEYS as readonly string[]).toContain(hub);
      expect(hubIntroProblems(entry), hub).toEqual([]);
    }
  });
});

describe("hubIntro", () => {
  const ok: HubIntroEntry = { en: words(80), km: "សេចក្ដីណែនាំ។", status: "approved" };
  it("returns the page language's approved text", () => {
    expect(hubIntro("books", "en", { books: ok })).toBe(words(80));
    expect(hubIntro("books", "km", { books: ok })).toBe("សេចក្ដីណែនាំ។");
  });
  it("shows nothing for a draft, a marker, or a length out of bounds", () => {
    expect(hubIntro("books", "en", { books: { ...ok, status: "needs_review" } })).toBeNull();
    expect(hubIntro("books", "en", { books: { ...ok, en: `${words(80)} TODO(km-review)` } })).toBeNull();
    expect(hubIntro("books", "en", { books: { ...ok, en: words(30) } })).toBeNull();
  });
  it("never borrows the other language", () => {
    expect(hubIntro("books", "km", { books: { ...ok, km: null } })).toBeNull();
  });
});

describe("drafts are never read by a page", () => {
  it("every draft is still needs_review — approval means moving it, not flipping it in place", () => {
    for (const entry of Object.values((drafts as { hubs: Record<string, HubIntroEntry> }).hubs)) {
      expect(entry.status).toBe("needs_review");
    }
  });
  it("only scripts and this test import content/drafts", () => {
    const hits = ["app", "components", "lib"].flatMap((dir) => grepDrafts(path.join(ROOT, dir)));
    expect(hits.filter((f) => !f.endsWith(".test.ts"))).toEqual([]);
  });
  it.each(HUB_KEYS)("the %s hub renders <HubIntro>", (hub) => {
    const src = readFileSync(path.join(ROOT, "app/[locale]/(public)", hub, "page.tsx"), "utf8");
    expect(src).toContain(`<HubIntro hub="${hub}"`);
  });
});

// Directory entries carry their own type, so nothing is stat()ed and then
// read — the check-then-use CodeQL flags as a race (js/file-system-race, #158).
function grepDrafts(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...grepDrafts(full));
    else if (/\.(ts|tsx)$/.test(entry.name) && /(from\s+|import\(\s*|require\(\s*)["'][^"']*content\/drafts/.test(readFileSync(full, "utf8"))) out.push(full);
  }
  return out;
}
