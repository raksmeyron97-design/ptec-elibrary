// lib/seo/open-graph.test.ts
//
// Two halves, and the split matters.
//
// The BEHAVIOUR half exercises buildOpenGraph() directly — the contract every
// public page emits, the locale reciprocity, and the image hierarchy.
//
// The SOURCE-SCAN half guards an ABSENCE, which no unit test can reach. Next
// replaces `openGraph` rather than deep-merging it, so a page that hand-writes
// the object silently drops whatever it does not repeat, and nothing errors —
// the tags are simply gone. That is how, on production 2026-09-20, five
// different shapes were in circulation at once and an author with no portrait
// published no og:image at all. The scan fails the build if a public page goes
// back to hand-writing one instead of calling the builder.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  buildOpenGraph,
  buildTwitter,
  ogAlternateLocale,
  ogImages,
  ogLocale,
  OG_FALLBACK_IMAGE,
  OG_FALLBACK_IMAGE_HEIGHT,
  OG_FALLBACK_IMAGE_PATH,
  OG_FALLBACK_IMAGE_WIDTH,
} from "@/lib/seo/open-graph";
import { validateOpenGraph } from "@/lib/seo/validate";
import { EMERGENCY_ORG_IDENTITY } from "@/lib/system-settings/org-identity";

const ROOT = path.resolve(__dirname, "..", "..");
const PUBLIC_TREE = path.join(ROOT, "app/[locale]/(public)");
const org = EMERGENCY_ORG_IDENTITY;

const base = {
  org,
  title: "Methods in Educational Research",
  description: "A factual description.",
  type: "article" as const,
  url: "https://library.ptec.edu.kh/books/methods",
};

// ── The contract ─────────────────────────────────────────────────────────────

describe("the Open Graph contract", () => {
  it("emits every required field for an English page", () => {
    const og = buildOpenGraph({ ...base, locale: "en" });
    expect(og.title).toBe("Methods in Educational Research");
    expect(og.description).toBe("A factual description.");
    expect(og.type).toBe("article");
    expect(og.url).toBe(base.url);
    expect(og.siteName).toBe(org.siteName);
    expect(og.locale).toBe("en_US");
    expect(og.alternateLocale).toEqual(["km_KH"]);
    expect(og.images[0].url).toBeTruthy();
    expect(og.images[0].alt).toBeTruthy();
    // The structural validator agrees, and it is the same one the sitemap
    // route and any future admin SEO report run.
    expect(validateOpenGraph(og, base.url)).toEqual([]);
  });

  it("emits the reciprocal pair for a Khmer page", () => {
    const og = buildOpenGraph({ ...base, locale: "km" });
    expect(og.locale).toBe("km_KH");
    expect(og.alternateLocale).toEqual(["en_US"]);
    expect(validateOpenGraph(og, base.url)).toEqual([]);
  });

  it("treats an unknown locale as English rather than emitting nothing", () => {
    expect(ogLocale("fr")).toBe("en_US");
    expect(ogAlternateLocale("fr")).toEqual(["km_KH"]);
  });

  it("never lets og:locale:alternate repeat og:locale", () => {
    for (const locale of ["en", "km"]) {
      const og = buildOpenGraph({ ...base, locale });
      expect(og.alternateLocale).not.toContain(og.locale);
    }
  });

  it("uses the caller's canonical URL verbatim, query string and all", () => {
    // A listing page's canonical carries ?page=2. Reconstructing the URL here
    // is how an og:url and a canonical come to disagree.
    const url = "https://library.ptec.edu.kh/books?page=2";
    expect(buildOpenGraph({ ...base, locale: "en", url }).url).toBe(url);
  });

  it("omits og:description rather than emitting an empty one", () => {
    for (const description of [undefined, null, "", "   "]) {
      const og = buildOpenGraph({ ...base, locale: "en", description });
      expect("description" in og).toBe(false);
    }
  });

  it("takes og:site_name from the published identity, never a literal", () => {
    const renamed = { ...org, siteName: "Renamed Library" };
    expect(buildOpenGraph({ ...base, org: renamed, locale: "en" }).siteName).toBe("Renamed Library");
  });
});

// ── The image hierarchy ──────────────────────────────────────────────────────

describe("the image hierarchy", () => {
  it("prefers the caller's image and labels it with the caller's alt", () => {
    const og = buildOpenGraph({
      ...base,
      locale: "en",
      image: "https://storage.example/cover.webp",
      imageAlt: "Book cover: Methods",
    });
    expect(og.images).toEqual([
      { url: "https://storage.example/cover.webp", alt: "Book cover: Methods" },
    ]);
  });

  it("declares NO width/height for an image whose size it does not know", () => {
    // lib/seo/book-seo.ts declared every cover 800 x 1200. Of eight covers
    // sampled from production on 2026-09-20 exactly one was that size; one was
    // 1200 x 672 — landscape, published as a portrait. Facebook and LinkedIn
    // size and crop a card from the declared dimensions before fetching the
    // bytes, so a wrong declaration is worse than an absent one.
    const [img] = ogImages("https://storage.example/cover.webp", { fallbackAlt: "x" });
    expect(img.width).toBeUndefined();
    expect(img.height).toBeUndefined();
  });

  it("falls back to the shared card, with its real dimensions", () => {
    for (const missing of [undefined, null, "", "   "]) {
      const og = buildOpenGraph({ ...base, locale: "en", image: missing });
      expect(og.images).toEqual([
        {
          url: OG_FALLBACK_IMAGE,
          alt: org.siteName,
          width: OG_FALLBACK_IMAGE_WIDTH,
          height: OG_FALLBACK_IMAGE_HEIGHT,
          type: "image/png",
        },
      ]);
    }
  });

  it("never labels the fallback card with the missing image's alt", () => {
    // "Thesis cover: X" over the shared site card describes an image that is
    // not there — the shape thesis-seo/publication-seo/learning-path-seo all
    // had, because each folded the fallback in before computing its alt.
    const og = buildOpenGraph({
      ...base,
      locale: "en",
      image: null,
      imageAlt: "Thesis cover: Methods",
    });
    expect(og.images[0].alt).toBe(org.siteName);
  });

  it("gives an empty caller image the fallback, not an empty images array", () => {
    // `images: ogImage ? [...] : []` was the shape on /catalogs/<slug>, and an
    // EMPTY array replaces the layout's default rather than falling through
    // to it — so a record with no cover published no og:image at all.
    const og = buildOpenGraph({ ...base, locale: "en", image: "" });
    expect(og.images).toHaveLength(1);
    expect(validateOpenGraph(og, base.url)).toEqual([]);
  });

  it("keeps the Twitter card pointing at the same file as og:image", () => {
    const og = buildOpenGraph({ ...base, locale: "en", image: "https://s.example/c.webp", imageAlt: "C" });
    const tw = buildTwitter({ card: "summary_large_image", title: base.title, images: og.images });
    expect(tw.images.map((i) => i.url)).toEqual(og.images.map((i) => i.url));
    expect(tw.images[0].alt).toBe("C");
  });
});

// ── The fallback asset itself ────────────────────────────────────────────────

describe("the fallback asset", () => {
  it("exists in public/ at the dimensions the constants declare", () => {
    // The constants are a promise to every crawler. If someone regenerates the
    // card at a different size, this fails rather than the promise going stale.
    const file = path.join(ROOT, "public", OG_FALLBACK_IMAGE_PATH);
    expect(fs.existsSync(file)).toBe(true);
    const buf = fs.readFileSync(file);
    // PNG: IHDR width/height are big-endian uint32 at bytes 16 and 20.
    expect(buf.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(buf.readUInt32BE(16)).toBe(OG_FALLBACK_IMAGE_WIDTH);
    expect(buf.readUInt32BE(20)).toBe(OG_FALLBACK_IMAGE_HEIGHT);
  });

  it("resolves to an absolute https URL on the canonical origin", () => {
    const url = new URL(OG_FALLBACK_IMAGE);
    expect(url.protocol).toBe("https:");
    expect(url.pathname).toBe(OG_FALLBACK_IMAGE_PATH);
  });
});

// ── Source scan ──────────────────────────────────────────────────────────────

function pageFiles(): string[] {
  return fs
    .readdirSync(PUBLIC_TREE, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && (e.name === "page.tsx" || e.name === "layout.tsx"))
    .map((e) => path.join(e.parentPath ?? PUBLIC_TREE, e.name));
}

const rel = (f: string) => path.relative(ROOT, f);

describe("no public page hand-writes an Open Graph object", () => {
  const files = pageFiles();

  it("finds the public pages", () => {
    // Guards the scan itself: at zero, every assertion below is vacuous.
    expect(files.length).toBeGreaterThan(20);
  });

  it("declares openGraph only through buildOpenGraph()", () => {
    const offenders = files
      .filter((f) => {
        const src = fs.readFileSync(f, "utf8");
        return /openGraph\s*:\s*\{/.test(src) && !/buildOpenGraph\(/.test(src);
      })
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("never hardcodes the site name, an og locale code, or the card asset", () => {
    // The site name lives in published System Settings; the locale codes and
    // the fallback path live in this module. A literal anywhere else is a
    // second source of truth, which is how five shapes ended up in production.
    const offenders: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      if (/siteName\s*:\s*["'`]/.test(src)) offenders.push(`${rel(f)} (siteName literal)`);
      if (/["'`](en_US|km_KH)["'`]/.test(src)) offenders.push(`${rel(f)} (og locale literal)`);
      if (/og-default\.(png|jpg)/.test(src)) offenders.push(`${rel(f)} (fallback image literal)`);
    }
    expect(offenders).toEqual([]);
  });
});

describe("no SEO builder keeps its own copy of the contract", () => {
  const builders = fs
    .readdirSync(path.join(ROOT, "lib/seo"))
    .filter((n) => n.endsWith(".ts") && !n.endsWith(".test.ts") && n !== "open-graph.ts")
    .map((n) => path.join(ROOT, "lib/seo", n));

  it("finds the builders", () => {
    expect(builders.length).toBeGreaterThan(10);
  });

  it("routes every openGraph block through buildOpenGraph()", () => {
    const offenders = builders
      .filter((f) => {
        const src = fs.readFileSync(f, "utf8");
        return /openGraph\s*:\s*\{/.test(src) && !/buildOpenGraph\(/.test(src);
      })
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("derives every fallback-image constant from OG_FALLBACK_IMAGE", () => {
    // book-seo, thesis-seo, publication-seo, learning-path-seo, journal-seo,
    // listing-metadata and posts-seo each exported their own
    // `${SITE_URL}/og-default.png`. Seven copies of one path is seven places
    // for a renamed asset to be missed.
    const offenders = builders
      .filter((f) => /og-default\.(png|jpg)/.test(fs.readFileSync(f, "utf8")))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("never writes an og locale code by hand", () => {
    // validate.ts is exempt: it has to KNOW the vocabulary to refuse anything
    // outside it. Every other builder must take the value from ogLocale().
    const offenders = builders
      .filter((f) => path.basename(f) !== "validate.ts")
      .filter((f) => /["\'`](en_US|km_KH)["\'`]/.test(fs.readFileSync(f, "utf8")))
      .map(rel);
    expect(offenders).toEqual([]);
  });
});
