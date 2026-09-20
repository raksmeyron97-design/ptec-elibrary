import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { jumpPages } from "./Pagination";

/**
 * SEO5-05. `pageRange()` is a barbell — first, last, ±1 — which is right for
 * a human and a dead end for a crawler. Measured on production 2026-09-20,
 * `/books` is 109 pages and page 1 links exactly two of them, so the middle
 * of the range sits ~55 clicks from the homepage.
 */
describe("jumpPages", () => {
  it("indexes production's 109-page listing every ten pages", () => {
    expect(jumpPages(109)).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });

  it("never repeats the last page", () => {
    // pageRange() always renders the last page. Emitting it here too would
    // put two links to one URL on the page: crawler noise, and a duplicate
    // tab stop for a keyboard user.
    for (const total of [100, 109, 110, 111, 200, 1000]) {
      expect(jumpPages(total)).not.toContain(total);
      expect(Math.max(...jumpPages(total), 0)).toBeLessThan(total);
    }
  });

  it("puts every page within half a stride of a jump target", () => {
    // The property that makes the depth claim true, asserted rather than
    // assumed: from a jump target, no page is more than `stride` clicks away.
    const total = 109;
    const targets = [1, ...jumpPages(total), total];
    for (let p = 1; p <= total; p++) {
      const nearest = Math.min(...targets.map((t) => Math.abs(t - p)));
      expect(nearest).toBeLessThanOrEqual(10);
    }
  });

  it("returns nothing when there is nothing to index", () => {
    expect(jumpPages(1)).toEqual([]);
    expect(jumpPages(10)).toEqual([]);
    expect(jumpPages(0)).toEqual([]);
    expect(jumpPages(-5)).toEqual([]);
    expect(jumpPages(Number.NaN)).toEqual([]);
  });

  it("honours a different stride", () => {
    expect(jumpPages(50, 25)).toEqual([25]);
    expect(jumpPages(50, 0)).toEqual([]);
  });
});

describe("the jump strip is a second, labelled nav", () => {
  const SRC = readFileSync(join(process.cwd(), "components/ui/core/Pagination.tsx"), "utf8");

  it("renders only where the barbell leaves a gap", () => {
    expect(SRC).toContain("JUMP_STRIP_MIN_PAGES");
    expect(SRC).toMatch(/totalPages > JUMP_STRIP_MIN_PAGES/);
  });

  it("is labelled, so it is not a second unnamed group of links", () => {
    expect(SRC).toMatch(/aria-label=\{t\("jumpToPage"\)\}/);
  });

  it("builds its hrefs with the same helper, so filters survive a jump", () => {
    // A jump link that dropped ?subject=Math would send the crawler and the
    // reader somewhere else entirely.
    const strip = SRC.slice(SRC.indexOf("jumpPages(totalPages).map"));
    expect(strip).toContain("pageHref(searchParams, p, basePath, pageParam)");
  });
});
