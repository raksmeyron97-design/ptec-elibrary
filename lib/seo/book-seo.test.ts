import { describe, it, expect } from "vitest";
import {
  languageCode,
  bookCanonicalUrl,
  booksCollectionUrl,
  bookFallbackDescription,
  bookMetaDescription,
  buildBookMetadata,
  bookJsonLd,
  booksCollectionJsonLd,
  sitemapLastmod,
  FALLBACK_OG_IMAGE,
  type BookSeoInput,
} from "./book-seo";

const complete: BookSeoInput = {
  slug: "methods-in-educational-research",
  title: "Methods in Educational Research",
  description:
    "A comprehensive, practice-oriented guide to designing and conducting rigorous educational research studies from theory through to practice.",
  coverUrl: "https://cdn.example.com/cover.webp",
  language: "English",
  publisher: "Jossey-Bass",
  isbn: "978-0-7879-7962-2",
  publishedAt: "2010-01-01",
  pages: 480,
  authors: ["Marguerite Lodico"],
  department: "Research",
  category: "Research Methods",
  tags: ["research", "methodology"],
};

const sparse: BookSeoInput = {
  slug: "action-research-top-10-2025",
  title: "Action Research Top 10 (2025)",
  description: "", // no description
  coverUrl: null, // no cover
  language: null, // unknown language
  publisher: null, // unknown publisher
  isbn: null,
  publishedAt: null, // unknown date
  pages: 1, // legacy "unknown" sentinel
  authors: [], // unknown author
  department: "Research",
  category: null,
  tags: [],
};

describe("languageCode", () => {
  it("maps human names to BCP-47 codes", () => {
    expect(languageCode("English")).toBe("en");
    expect(languageCode("Khmer")).toBe("km");
    expect(languageCode("km")).toBe("km");
  });
  it("returns undefined for unknown/empty (never a wrong guess)", () => {
    expect(languageCode("Klingon")).toBeUndefined();
    expect(languageCode(null)).toBeUndefined();
    expect(languageCode("")).toBeUndefined();
  });
});

describe("canonical URLs", () => {
  it("prefixes /km for Khmer detail + collection", () => {
    expect(bookCanonicalUrl("x", "en")).toBe("https://library.ptec.edu.kh/books/x");
    expect(bookCanonicalUrl("x", "km")).toBe("https://library.ptec.edu.kh/km/books/x");
    expect(booksCollectionUrl("en", 1)).toBe("https://library.ptec.edu.kh/books");
    expect(booksCollectionUrl("en", 2)).toBe("https://library.ptec.edu.kh/books?page=2");
    expect(booksCollectionUrl("km", 2)).toBe("https://library.ptec.edu.kh/km/books?page=2");
  });
});

describe("bookFallbackDescription", () => {
  it("is factual, non-empty, and localized — never invents facts", () => {
    const en = bookFallbackDescription(sparse, "en");
    expect(en).toContain("Action Research Top 10 (2025)");
    expect(en).toContain("free");
    const km = bookFallbackDescription(sparse, "km");
    expect(km).toContain("Action Research Top 10 (2025)");
    expect(km.length).toBeGreaterThan(10);
  });
  it("includes verified authors when known", () => {
    expect(bookFallbackDescription(complete, "en")).toContain("Marguerite Lodico");
  });
});

describe("bookMetaDescription", () => {
  it("uses the record's own description when it is long enough", () => {
    expect(bookMetaDescription(complete, "en")).toContain("comprehensive");
  });
  it("falls back for a missing description and is never empty", () => {
    const d = bookMetaDescription(sparse, "en");
    expect(d.length).toBeGreaterThan(0);
    expect(d).toContain("Action Research");
  });
  it("truncates to a snippet-safe length", () => {
    const long = { ...complete, description: "x".repeat(400) };
    expect(bookMetaDescription(long, "en").length).toBeLessThanOrEqual(160);
  });
});

describe("buildBookMetadata", () => {
  it("produces complete OG/Twitter metadata for a full record", () => {
    const m = buildBookMetadata(complete, "en") as any;
    expect(m.title).toBe("Methods in Educational Research");
    expect(m.description).toBeTruthy();
    expect(m.alternates.canonical).toBe("https://library.ptec.edu.kh/books/methods-in-educational-research");
    expect(m.alternates.languages.km).toContain("/km/books/");
    expect(m.openGraph.images[0].url).toBe("https://cdn.example.com/cover.webp");
    expect(m.openGraph.url).toBe(m.alternates.canonical);
    expect(m.twitter.images[0]).toBe("https://cdn.example.com/cover.webp");
    expect(m.publisher).toBe("Jossey-Bass");
  });

  it("never emits undefined/empty metadata for a sparse record", () => {
    const m = buildBookMetadata(sparse, "en") as any;
    expect(m.description).toBeTruthy();
    expect(m.openGraph.images[0].url).toBe(FALLBACK_OG_IMAGE);
    expect(m.twitter.images[0]).toBe(FALLBACK_OG_IMAGE);
    // No fabricated publisher/authors.
    expect(m.publisher).toBeUndefined();
    expect(m.authors).toBeUndefined();
  });

  it("localizes canonical + OG locale for Khmer routes", () => {
    const m = buildBookMetadata(complete, "km") as any;
    expect(m.alternates.canonical).toContain("/km/books/");
    expect(m.openGraph.locale).toBe("km_KH");
  });
});

describe("bookJsonLd", () => {
  it("emits accurate, complete Book schema for a full record", () => {
    const s = bookJsonLd(complete, "en", { ratingValue: "4.5", reviewCount: 3 }) as any;
    expect(s["@type"]).toBe("Book");
    expect(s.url).toBe("https://library.ptec.edu.kh/books/methods-in-educational-research");
    expect(s["@id"]).toContain("#book");
    expect(s.mainEntityOfPage).toBe(s.url);
    expect(s.inLanguage).toBe("en");
    expect(s.isbn).toBe("978-0-7879-7962-2");
    expect(s.numberOfPages).toBe(480);
    expect(s.datePublished).toBe("2010-01-01");
    expect(s.publisher).toEqual({ "@type": "Organization", name: "Jossey-Bass" });
    expect(s.provider["@type"]).toBe("Library");
    expect(s.aggregateRating.reviewCount).toBe(3);
    expect(s.author).toEqual([{ "@type": "Person", name: "Marguerite Lodico" }]);
  });

  it("omits fabricated defaults for a sparse record", () => {
    const s = bookJsonLd(sparse, "en") as any;
    expect(s.numberOfPages).toBeUndefined(); // pages:1 is the unknown sentinel
    expect(s.datePublished).toBeUndefined(); // no fake date
    expect(s.isbn).toBeUndefined();
    expect(s.publisher).toBeUndefined(); // PTEC is provider, never publisher
    expect(s.author).toBeUndefined(); // no "Unknown Author" entity
    expect(s.aggregateRating).toBeUndefined(); // no ratings without reviews
    expect(s.inLanguage).toBeUndefined(); // unknown language → omit, not "en"
    expect(s.provider).toBeTruthy(); // PTEC still appears AS the provider
    expect(s.description).toBeTruthy(); // fallback description, never empty
  });

  it("uses the Khmer canonical URL when locale is km", () => {
    const s = bookJsonLd(complete, "km") as any;
    expect(s.url).toContain("/km/books/");
  });
});

describe("booksCollectionJsonLd", () => {
  const books = [
    { slug: "a", title: "Book A" },
    { slug: "b", title: "Book B" },
  ];

  it("uses the page-1 canonical URL and absolute positions", () => {
    const s = booksCollectionJsonLd({
      locale: "en",
      page: 1,
      pageSize: 18,
      total: 116,
      name: "Books",
      description: "desc",
      books,
    }) as any;
    expect(s.url).toBe("https://library.ptec.edu.kh/books");
    expect(s["@id"]).toContain("#collection");
    expect(s.mainEntity.numberOfItems).toBe(116);
    expect(s.mainEntity.itemListElement[0].position).toBe(1);
    expect(s.mainEntity.itemListElement[1].position).toBe(2);
  });

  it("uses ?page=2 URL and offset positions on page 2", () => {
    const s = booksCollectionJsonLd({
      locale: "en",
      page: 2,
      pageSize: 18,
      total: 116,
      name: "Books",
      description: "desc",
      books,
    }) as any;
    expect(s.url).toBe("https://library.ptec.edu.kh/books?page=2");
    expect(s.mainEntity.itemListElement[0].position).toBe(19);
    expect(s.mainEntity.itemListElement[0].url).toBe("https://library.ptec.edu.kh/books/a");
  });

  it("uses the /km collection URL and Khmer item URLs", () => {
    const s = booksCollectionJsonLd({
      locale: "km",
      page: 1,
      pageSize: 18,
      total: 9,
      name: "សៀវភៅ",
      description: "desc",
      books,
    }) as any;
    expect(s.url).toBe("https://library.ptec.edu.kh/km/books");
    expect(s.inLanguage).toBe("km");
    expect(s.mainEntity.itemListElement[0].url).toBe("https://library.ptec.edu.kh/km/books/a");
  });
});

describe("sitemapLastmod", () => {
  it("returns the first parseable timestamp", () => {
    expect(sitemapLastmod(null, "2026-07-13T00:00:00Z", "2020-01-01")).toBe("2026-07-13T00:00:00Z");
  });
  it("returns undefined when nothing is trustworthy (no fabricated deploy time)", () => {
    expect(sitemapLastmod(null, undefined, "")).toBeUndefined();
    expect(sitemapLastmod("not-a-date")).toBeUndefined();
  });
});
