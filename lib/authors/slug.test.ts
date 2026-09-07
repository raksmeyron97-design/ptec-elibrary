import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { authorSlug, addressableAuthorSlug } from "@/lib/authors/slug";
import { unicodeSlug } from "@/lib/slug";

const ROOT = join(__dirname, "..", "..");

describe("authorSlug", () => {
  it("is unicodeSlug — one algorithm, not a second one", () => {
    for (const name of ["Adrian Wallwork", "ឡុង រក្សា", "C. R. Kothari"]) {
      expect(authorSlug(name)).toBe(unicodeSlug(name));
    }
  });

  it("keeps Khmer combining marks", () => {
    // 0125's SQL author_slugify() maps every non-[:alnum:] run to a hyphen and
    // Khmer dependent vowels/signs are marks, so it produced "ឡ-ង-រក-ស" — a
    // consonant skeleton. 74 of the library's 157 authors have Khmer names.
    const slug = authorSlug("ឡុង រក្សា");
    expect(slug).toBe("ឡុង-រក្សា");
    expect(slug).not.toBe("ឡ-ង-រក-ស");
  });

  it("reproduces the URLs the hub and sitemap already advertise", () => {
    // The pre-fix fallback was slugify(name) === unicodeSlug(name), so a
    // backfill deriving the same way repairs those URLs instead of minting
    // different ones. This is the property that makes the backfill safe.
    expect(authorSlug("Capacity Development Partnership Fund (CDPF III)")).toBe(
      "capacity-development-partnership-fund-cdpf-iii",
    );
  });

  it("returns null when a name yields nothing addressable", () => {
    expect(authorSlug("")).toBeNull();
    expect(authorSlug("   ")).toBeNull();
    expect(authorSlug(null)).toBeNull();
  });
});

describe("addressableAuthorSlug", () => {
  it("prefers a stored slug, so an admin's correction survives", () => {
    expect(addressableAuthorSlug("corrected-name", "Some Other Name")).toBe("corrected-name");
  });

  it("DROPS a row whose slug column exists but is null", () => {
    // author_profiles_public (0126) is `where slug is not null`, so middleware
    // rewrites this author's URL to a hard 404. Advertising a name-derived URL
    // anyway is the 154-dead-links bug.
    expect(addressableAuthorSlug(null, "Adrian Wallwork")).toBeNull();
    expect(addressableAuthorSlug("   ", "Adrian Wallwork")).toBeNull();
  });

  it("falls back to the name when the slug column is MISSING entirely", () => {
    // Pre-0125 the column does not exist, the gate view does not exist either,
    // and the gate fails open — so name-derived URLs resolve and dropping them
    // would empty the sitemap during a deploy window.
    expect(addressableAuthorSlug(undefined, "Adrian Wallwork")).toBe("adrian-wallwork");
  });
});

describe("author URL advertisers agree with the gate", () => {
  const readers = ["app/sitemap.ts", "lib/authors/directory.ts"];

  it.each(readers)("%s derives author slugs through addressableAuthorSlug()", (file) => {
    const src = readFileSync(join(ROOT, file), "utf8");
    expect(src).toContain("addressableAuthorSlug");
  });

  it.each(readers)("%s has no `slug || slugify(name)` fallback of its own", (file) => {
    const src = readFileSync(join(ROOT, file), "utf8");
    // The exact shape that shipped 154 unresolvable URLs.
    expect(src).not.toMatch(/\.slug\s*\|\|\s*slugify\(/);
    expect(src).not.toMatch(/rawSlug\s*\|\|\s*slugify\(/);
  });
});

describe("author creation always writes a slug", () => {
  it("the admin book save calls ensureAuthorSlug after every author upsert", () => {
    const src = readFileSync(
      join(ROOT, "app/(admin)/admin/(protected)/books/actions.ts"),
      "utf8",
    );
    // Both the upload path and the edit path upsert an author by name; each
    // one must be followed by the slug write, or that author's page 404s.
    const upserts = src.match(/\.upsert\(\{\s*name:\s*author\s*\}/g) ?? [];
    expect(upserts.length).toBeGreaterThan(0);
    const ensures = src.match(/ensureAuthorSlug\(/g) ?? [];
    expect(ensures.length).toBeGreaterThanOrEqual(upserts.length);
  });
});
