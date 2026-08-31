import { describe, it, expect } from "vitest";
import {
  isIndexableRoute,
  isPrivateSeoRoute,
  stripLocalePrefix,
  validateAlternateUrls,
  validateCanonicalUrl,
  validateSeoMetadata,
  validateSitemap,
  validateSitemapEntry,
  validateStructuredData,
} from "@/lib/seo/validate";
import { PRODUCTION_SITE_URL } from "@/lib/seo/production-origin";

const P = PRODUCTION_SITE_URL;
const rules = (issues: { rule: string }[]) => issues.map((i) => i.rule);

describe("validateCanonicalUrl", () => {
  it("accepts a well-formed canonical", () => {
    expect(validateCanonicalUrl(`${P}/books/foo`)).toEqual([]);
  });

  it("accepts the bare origin (how Next serializes the root)", () => {
    expect(validateCanonicalUrl(P)).toEqual([]);
  });

  it.each([
    ["http://localhost:3000/books", ["wrong-origin", "insecure-scheme"]],
    ["https://library.storage-ptec.online/books", ["wrong-origin"]],
    [`${P}/books/`, ["trailing-slash"]],
    [`${P}/books?sort=popular`, ["canonical-has-query"]],
    [`${P}/books#top`, ["canonical-has-fragment"]],
    ["/books", ["unparseable-url"]],
  ])("flags %s", (url, expected) => {
    expect(rules(validateCanonicalUrl(url))).toEqual(expect.arrayContaining(expected));
  });

  it("rejects the tunnel fallback host — it must never compete with the canonical one", () => {
    expect(rules(validateCanonicalUrl("https://library.storage-ptec.online/"))).toContain(
      "wrong-origin",
    );
  });
});

describe("validateAlternateUrls", () => {
  const good = { en: `${P}/theses/x`, km: `${P}/km/theses/x`, "x-default": `${P}/theses/x` };

  it("accepts a reciprocal en/km/x-default set", () => {
    expect(validateAlternateUrls(good.en, good)).toEqual([]);
    expect(validateAlternateUrls(good.km, good)).toEqual([]);
  });

  it("requires all three hreflang keys", () => {
    expect(rules(validateAlternateUrls(good.en, { en: good.en }))).toEqual(
      expect.arrayContaining(["missing-hreflang", "missing-hreflang"]),
    );
  });

  it("requires x-default to equal the English URL", () => {
    expect(rules(validateAlternateUrls(good.en, { ...good, "x-default": good.km }))).toContain(
      "x-default-mismatch",
    );
  });

  it("rejects en and km resolving to the same URL", () => {
    const same = { en: good.en, km: good.en, "x-default": good.en };
    expect(rules(validateAlternateUrls(good.en, same))).toContain("identical-alternates");
  });

  it("rejects a canonical absent from its own alternate set", () => {
    expect(rules(validateAlternateUrls(`${P}/other`, good))).toContain(
      "canonical-not-in-alternates",
    );
  });

  it("validates each alternate URL, not just the canonical", () => {
    const bad = { ...good, km: "http://localhost:3000/km/theses/x" };
    expect(rules(validateAlternateUrls(good.en, bad))).toContain("alternate:km:wrong-origin");
  });
});

describe("private route classification", () => {
  it.each(["/km", "/km/books", "/books"])("strips the locale prefix from %s", (path) => {
    expect(stripLocalePrefix(path).startsWith("/km")).toBe(false);
  });

  it.each([
    "/admin",
    "/km/dashboard",
    "/km/lists/abc",
    "/api/books",
    "/offline-books",
    "/km/profile",
  ])("marks %s private in either locale", (path) => {
    expect(isPrivateSeoRoute(path)).toBe(true);
    expect(isIndexableRoute(path)).toBe(false);
  });

  it.each(["/", "/km", "/books", "/km/subjects/math", "/authors/x", "/search"])(
    "keeps %s indexable",
    (path) => {
      expect(isIndexableRoute(path)).toBe(true);
    },
  );
});

describe("validateSitemapEntry", () => {
  const entry = (url: string, extra: Record<string, unknown> = {}) => ({
    url,
    alternates: { languages: { en: url, km: url.replace(P, `${P}/km`) } },
    ...extra,
  });

  it("accepts a well-formed entry", () => {
    expect(validateSitemapEntry(entry(`${P}/books/foo`))).toEqual([]);
  });

  it("rejects a private URL", () => {
    expect(rules(validateSitemapEntry(entry(`${P}/dashboard`)))).toContain(
      "private-url-in-sitemap",
    );
  });

  it("rejects the Khmer form of a private URL too", () => {
    expect(rules(validateSitemapEntry(entry(`${P}/km/lists/abc`)))).toContain(
      "private-url-in-sitemap",
    );
  });

  it("requires both locale alternates", () => {
    expect(rules(validateSitemapEntry({ url: `${P}/books` }))).toContain(
      "missing-sitemap-alternates",
    );
  });

  it("rejects an unparseable lastmod", () => {
    expect(
      rules(validateSitemapEntry(entry(`${P}/books/x`, { lastModified: "not-a-date" }))),
    ).toContain("invalid-lastmod");
  });

  it("rejects a future lastmod", () => {
    const future = new Date(Date.now() + 30 * 86_400_000).toISOString();
    expect(
      rules(validateSitemapEntry(entry(`${P}/books/x`, { lastModified: future }))),
    ).toContain("future-lastmod");
  });

  it("accepts a real past lastmod", () => {
    expect(
      validateSitemapEntry(entry(`${P}/books/x`, { lastModified: "2026-01-15T00:00:00Z" })),
    ).toEqual([]);
  });
});

describe("validateSitemap", () => {
  const e = (path: string) => ({
    url: `${P}${path}`,
    alternates: { languages: { en: `${P}${path}`, km: `${P}/km${path}` } },
  });

  it("accepts a clean sitemap", () => {
    expect(validateSitemap([e("/books"), e("/theses")])).toEqual([]);
  });

  it("flags a duplicate URL", () => {
    expect(rules(validateSitemap([e("/books"), e("/books")]))).toContain("duplicate-url");
  });
});

describe("validateSeoMetadata", () => {
  const meta = {
    title: "Pedagogy",
    description: "8 e-books about Pedagogy in the PTEC Library.",
    alternates: {
      canonical: `${P}/subjects/pedagogy`,
      languages: {
        en: `${P}/subjects/pedagogy`,
        km: `${P}/km/subjects/pedagogy`,
        "x-default": `${P}/subjects/pedagogy`,
      },
    },
    openGraph: { title: "Pedagogy", description: "…", siteName: "PTEC Library" },
  };

  it("accepts complete metadata", () => {
    expect(validateSeoMetadata(meta)).toEqual([]);
  });

  it.each([
    ["title", "missing-title"],
    ["description", "missing-description"],
  ])("flags a missing %s", (field, rule) => {
    expect(rules(validateSeoMetadata({ ...meta, [field]: "" }))).toContain(rule);
  });

  it("flags a missing canonical", () => {
    expect(rules(validateSeoMetadata({ ...meta, alternates: {} }))).toContain("missing-canonical");
  });

  it("flags openGraph declared without siteName — the Next merge trap", () => {
    expect(
      rules(validateSeoMetadata({ ...meta, openGraph: { title: "x", description: "y" } })),
    ).toContain("missing-og-site-name");
  });
});

describe("validateStructuredData", () => {
  it("accepts a well-formed node", () => {
    expect(
      validateStructuredData({
        "@context": "https://schema.org",
        "@type": "Book",
        name: "A title",
        url: `${P}/books/a-title`,
      }),
    ).toEqual([]);
  });

  it("requires @context and @type", () => {
    expect(rules(validateStructuredData({ name: "x" }))).toEqual(
      expect.arrayContaining(["missing-context", "missing-type"]),
    );
  });

  it("flags a null leaf — an omitted property is not an empty claim", () => {
    expect(
      rules(
        validateStructuredData({
          "@context": "https://schema.org",
          "@type": "Book",
          isbn: null,
        }),
      ),
    ).toContain("null-value");
  });

  it("flags a url on the wrong origin", () => {
    expect(
      rules(
        validateStructuredData({
          "@context": "https://schema.org",
          "@type": "Book",
          url: "http://localhost:3000/books/x",
        }),
      ),
    ).toContain("jsonld-wrong-origin");
  });

  it("allows off-site URLs in sameAs — external identities are the point", () => {
    expect(
      validateStructuredData({
        "@context": "https://schema.org",
        "@type": "Person",
        name: "A person",
        sameAs: ["https://orcid.org/0000-0002-1825-0097"],
      }),
    ).toEqual([]);
  });

  it("walks nested nodes", () => {
    expect(
      rules(
        validateStructuredData({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          mainEntity: { "@type": "ItemList", itemListElement: [{ "@type": "ListItem", name: null }] },
        }),
      ),
    ).toContain("null-value");
  });
});
