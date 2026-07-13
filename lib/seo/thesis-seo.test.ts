import { describe, it, expect } from "vitest";
import {
  isGenericThesisTitle,
  thesisCanonicalUrl,
  thesesCollectionUrl,
  thesisFallbackDescription,
  thesisMetaDescription,
  buildThesisMetadata,
  thesisJsonLd,
  thesesCollectionJsonLd,
} from "./thesis-seo";

const SITE = "https://library.ptec.edu.kh";

describe("isGenericThesisTitle", () => {
  it("flags the live English + Khmer offenders", () => {
    expect(isGenericThesisTitle("Report")).toBe(true);
    expect(isGenericThesisTitle("report.")).toBe(true);
    expect(isGenericThesisTitle("របាយការណ៍")).toBe(true);
    expect(isGenericThesisTitle("និក្ខេបបទ")).toBe(true);
    expect(isGenericThesisTitle("Thesis")).toBe(true);
    expect(isGenericThesisTitle("Research Report")).toBe(true);
    expect(isGenericThesisTitle("")).toBe(true);
    expect(isGenericThesisTitle(null)).toBe(true);
  });

  it("accepts a real academic title", () => {
    expect(
      isGenericThesisTitle("The Impact of Co-Teaching on Student-Teacher Learning Outcomes"),
    ).toBe(false);
    expect(isGenericThesisTitle("ឥទ្ធិពលនៃការបង្រៀនរួមគ្នាលើលទ្ធផលសិក្សា")).toBe(false);
  });
});

describe("canonical URLs", () => {
  it("are locale-correct", () => {
    expect(thesisCanonicalUrl("thesis-0338d7db", "en")).toBe(`${SITE}/theses/thesis-0338d7db`);
    expect(thesisCanonicalUrl("thesis-0338d7db", "km")).toBe(`${SITE}/km/theses/thesis-0338d7db`);
    expect(thesesCollectionUrl("km", 2)).toBe(`${SITE}/km/theses?page=2`);
  });
});

describe("descriptions", () => {
  const thesis = {
    slug: "x",
    title: "Co-Teaching Outcomes",
    authors: ["Sok San"],
    department: "Mathematics Education",
  };

  it("localizes the factual fallback (Khmer is not English)", () => {
    const en = thesisFallbackDescription(thesis, "en");
    const km = thesisFallbackDescription(thesis, "km");
    expect(en).toContain("student thesis");
    expect(km).toContain("និក្ខេបបទ");
    expect(km).not.toEqual(en);
  });

  it("prefers a substantial abstract over the fallback", () => {
    const long = "A".repeat(120);
    expect(thesisMetaDescription({ ...thesis, abstract: long }, "en")).toContain("A");
  });
});

describe("buildThesisMetadata", () => {
  it("sets a locale-correct self-canonical + reciprocal hreflang", () => {
    const md = buildThesisMetadata({ slug: "x", title: "T", authors: ["A"] }, "km");
    expect(md.alternates?.canonical).toBe(`${SITE}/km/theses/x`);
    expect(md.alternates?.languages).toMatchObject({
      en: `${SITE}/theses/x`,
      km: `${SITE}/km/theses/x`,
      "x-default": `${SITE}/theses/x`,
    });
    expect(md.openGraph?.locale).toBe("km_KH");
  });

  it("omits authors entirely rather than fabricating one", () => {
    const md = buildThesisMetadata({ slug: "x", title: "T", authors: [] }, "en");
    expect(md.authors).toBeUndefined();
  });

  it("honors admin SEO overrides", () => {
    const md = buildThesisMetadata(
      { slug: "x", title: "T" },
      "en",
      { seoTitle: "Custom", seoDescription: "Custom desc" },
    );
    expect(md.title).toBe("Custom");
    expect(md.description).toBe("Custom desc");
  });
});

describe("thesisJsonLd", () => {
  it("drops broken reference fragments but keeps complete ones", () => {
    const schema = thesisJsonLd(
      {
        slug: "x",
        title: "T",
        authors: ["Sok San"],
        references: [
          "Vygotsky, L. S. (1978). Mind in society. Harvard University Press.",
          "pp. 3-4",
          "Brown, A. (2011). and",
        ],
      },
      "en",
    );
    expect(schema.citation).toEqual([
      "Vygotsky, L. S. (1978). Mind in society. Harvard University Press.",
    ]);
  });

  it("omits an invalid DOI", () => {
    const schema = thesisJsonLd({ slug: "x", title: "T", doi: "10.1234/eds" }, "en");
    expect(schema.identifier).toBeUndefined();
  });

  it("emits a validated DOI", () => {
    const schema = thesisJsonLd({ slug: "x", title: "T", doi: "10.1021/ed500143m" }, "en");
    expect(schema.identifier).toMatchObject({ propertyID: "DOI", value: "10.1021/ed500143m" });
  });

  it("keeps distinct dates and never uses no author fabrication", () => {
    const schema = thesisJsonLd(
      { slug: "x", title: "T", datePublished: "2024-06-01", dateCreated: "2024-01-01", authors: [] },
      "en",
    );
    expect(schema.datePublished).toBe("2024-06-01");
    expect(schema.dateCreated).toBe("2024-01-01");
    expect(schema.author).toBeUndefined();
    expect(schema.url).toBe(`${SITE}/theses/x`);
  });
});

describe("thesesCollectionJsonLd", () => {
  it("uses locale-correct schema + item URLs and absolute positions", () => {
    const schema = thesesCollectionJsonLd({
      locale: "km",
      page: 2,
      pageSize: 12,
      total: 30,
      name: "និក្ខេបបទ",
      description: "…",
      theses: [{ slug: "a", title: "A", authors: ["X"], year: "2024" }],
    }) as any;
    expect(schema.url).toBe(`${SITE}/km/theses?page=2`);
    expect(schema.inLanguage).toBe("km");
    expect(schema.mainEntity.numberOfItems).toBe(30);
    expect(schema.mainEntity.itemListElement[0].position).toBe(13);
    expect(schema.mainEntity.itemListElement[0].url).toBe(`${SITE}/km/theses/a`);
  });
});
