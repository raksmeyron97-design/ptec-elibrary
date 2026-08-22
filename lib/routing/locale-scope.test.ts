import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isLocaleScoped } from "./locale-scope";

const ROOT = path.resolve(__dirname, "..", "..");

function grepFiles(pattern: string): string[] {
  try {
    return execFileSync("git", ["grep", "-l", "-E", pattern, "--", "*.tsx"], {
      cwd: ROOT,
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}

const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

describe("isLocaleScoped", () => {
  it("treats public routes as locale-scoped", () => {
    for (const href of ["/", "/books", "/books/pisa-d", "/theses", "/paths/x", "/contact"]) {
      expect(isLocaleScoped(href), href).toBe(true);
    }
  });

  it("treats auth, admin, api and the offline shell as unscoped", () => {
    for (const href of [
      "/auth/login",
      "/auth/signup",
      "/admin",
      "/admin/books",
      "/api/health",
      "/~offline",
    ]) {
      expect(isLocaleScoped(href), href).toBe(false);
    }
  });

  it("treats anything that is not an app-relative path as unscoped", () => {
    for (const href of ["https://example.com", "//cdn.example.com", "mailto:a@b.c", "#top"]) {
      expect(isLocaleScoped(href), href).toBe(false);
    }
  });
});

describe("no component sends an unscoped route through the locale-aware Link", () => {
  // The locale-aware Link prefixes its href, so `/km/auth/signup` 404s. This
  // scans source rather than behaviour because the failure is invisible in
  // English — the default locale is unprefixed, so the bug only appears to
  // Khmer readers, on a page that renders fine in review.
  //
  // Both shapes that shipped broken are covered:
  //   • <Link href="/auth/login">                 — mobile profile sheet
  //   • { href: "/auth/signup" } rendered by <Link> — homepage FAQ
  //
  // A plain <a href="/auth/..."> and a next/link <NextLink> are both correct
  // and must NOT be flagged, which is why this matches the ELEMENT rather than
  // the file's imports.
  const localeLinkFiles = grepFiles('from "@/i18n/navigation"');

  /** Every `<Link ...>` opening tag in the source, attributes included.
   *  `[^]` rather than the `s` flag: this repo's tsconfig target predates it. */
  function linkElements(src: string): string[] {
    return [...src.matchAll(/<Link\b[^>]*>/g)].map((m) => m[0]);
  }

  it("finds files that use the locale-aware navigation helpers", () => {
    // A sanity check on the scan itself: if this hits zero, the pattern stopped
    // matching and every assertion below became vacuous.
    expect(localeLinkFiles.length).toBeGreaterThan(10);
  });

  it("no <Link> is given an unscoped href directly", () => {
    const offenders: string[] = [];
    for (const file of localeLinkFiles) {
      for (const el of linkElements(read(file))) {
        const href = el.match(/href=\{?[`"]([^`"]+)/)?.[1];
        if (href && href.startsWith("/") && !isLocaleScoped(href)) {
          offenders.push(`${file}: ${href}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no <Link> renders an unscoped href held in the file's data", () => {
    // Indirect form: the href sits in a config array and reaches a <Link>
    // through a variable, which source scanning cannot follow. The check is
    // therefore conservative — a file that BOTH declares an unscoped href in
    // an href position AND renders a locale-aware <Link> with a non-literal
    // href has to prove it can render the unscoped one correctly, by importing
    // a plain next/link.
    // `href:` (an object PROPERTY) only — never `href=` (a JSX attribute).
    // An attribute is attached to a visible element, so it is covered by the
    // direct check above and by reading the line; a property is a value that
    // travels, and where it lands cannot be seen from the declaration.
    const UNSCOPED_HREF = /href\s*:\s*["`](\/(?:auth|admin|~offline)[^"`]*)/;
    const offenders: string[] = [];
    for (const file of localeLinkFiles) {
      const src = read(file);
      const declared = src.match(UNSCOPED_HREF)?.[1];
      if (!declared) continue;
      const hasDynamicLink = linkElements(src).some((el) => /href=\{(?!`\/)/.test(el));
      if (!hasDynamicLink) continue; // the href never reaches a <Link>
      if (!/from "next\/link"/.test(src)) offenders.push(`${file}: ${declared}`);
    }
    expect(offenders).toEqual([]);
  });
});
