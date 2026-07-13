import { describe, it, expect } from "vitest";
import {
  publicationCanonicalUrl,
  isFreelyAccessible,
  isInstitutionalPublisher,
  publicationFallbackDescription,
  buildPublicationMetadata,
  publicationJsonLd,
  publicationsCollectionJsonLd,
  type PublicationSeoInput,
} from "./publication-seo";

const SITE = "https://library.ptec.edu.kh";

// The live ACS record, corrected to its Crossref-verified values.
const acs: PublicationSeoInput = {
  slug: "journal-of-chemical-education",
  title: "Review of Guidelines for Laboratory Design, 4th Edition",
  authors: ["Shadi Abu-Baker", "Shahrokh Ghaffari", "Mohannad Al-Saghir"],
  journalName: "Journal of Chemical Education",
  volume: "91",
  issue: "6",
  pageStart: "776",
  pageEnd: "777",
  doi: "10.1021/ed500143m",
  issn: "0021-9584",
  publicationDate: "2014-04-03",
  publisher: "American Chemical Society",
  license: null,
  copyright: "Copyright © 2014 The American Chemical Society",
  language: "en",
};

// The live record BEFORE correction (placeholder values).
const placeholder: PublicationSeoInput = {
  ...acs,
  doi: "10.1234/eds",
  license: "CC BY 44",
  publicationDate: "2026-07-04",
};

describe("rights helpers", () => {
  it("treats a third-party publisher without an open license as NOT freely accessible", () => {
    expect(isInstitutionalPublisher("American Chemical Society")).toBe(false);
    expect(isFreelyAccessible(acs)).toBe(false);
  });

  it("treats PTEC's own output as freely accessible", () => {
    expect(isFreelyAccessible({ ...acs, publisher: null })).toBe(true);
    expect(isFreelyAccessible({ ...acs, publisher: "PTEC" })).toBe(true);
  });

  it("treats a verified redistributable license as freely accessible", () => {
    expect(isFreelyAccessible({ ...acs, license: "CC BY 4.0" })).toBe(true);
  });
});

describe("publicationJsonLd", () => {
  it("suppresses the placeholder DOI and invalid license", () => {
    const schema = publicationJsonLd(placeholder, "en") as any;
    expect(schema.identifier).toBeUndefined();
    expect(schema.sameAs).toBeUndefined();
    expect(schema.license).toBeUndefined();
  });

  it("emits validated DOI + sameAs + ISSN for the corrected record", () => {
    const schema = publicationJsonLd(acs, "en") as any;
    expect(schema.identifier).toEqual([{ "@type": "PropertyValue", propertyID: "DOI", value: "10.1021/ed500143m" }]);
    expect(schema.sameAs).toBe("https://doi.org/10.1021/ed500143m");
    expect(schema.isPartOf).toMatchObject({ "@type": "Periodical", name: "Journal of Chemical Education", issn: "0021-9584" });
  });

  it("does NOT claim open access for the ACS ©article", () => {
    const schema = publicationJsonLd(acs, "en") as any;
    expect(schema.isAccessibleForFree).toBe(false);
    expect(schema.license).toBeUndefined();
    expect(schema.copyrightNotice).toContain("American Chemical Society");
  });

  it("never asserts a reviewed-book ISBN as the article identifier", () => {
    const schema = publicationJsonLd({ ...acs }, "en") as any;
    const ids = (schema.identifier ?? []) as any[];
    expect(ids.every((i) => i.propertyID !== "ISBN")).toBe(true);
  });

  it("uses the real publisher (not PTEC) and locale-correct url", () => {
    const schema = publicationJsonLd(acs, "km") as any;
    expect(schema.publisher).toMatchObject({ name: "American Chemical Society" });
    expect(schema.url).toBe(`${SITE}/km/publications/journal-of-chemical-education`);
    expect(schema.datePublished).toBe("2014-04-03");
  });
});

describe("buildPublicationMetadata", () => {
  it("is locale-correct and uses the article's real publisher", () => {
    const md = buildPublicationMetadata(acs, "km");
    expect(md.alternates?.canonical).toBe(`${SITE}/km/publications/journal-of-chemical-education`);
    expect(md.publisher).toBe("American Chemical Society");
    expect(md.openGraph?.locale).toBe("km_KH");
  });

  it("localizes the description (Khmer differs from English)", () => {
    expect(publicationFallbackDescription(acs, "km")).not.toEqual(
      publicationFallbackDescription(acs, "en"),
    );
    expect(publicationFallbackDescription(acs, "km")).toContain("អត្ថបទសិក្សា");
  });
});

describe("publicationsCollectionJsonLd", () => {
  it("emits a locale-correct CollectionPage/ItemList and validated per-item DOI", () => {
    const schema = publicationsCollectionJsonLd({
      locale: "en",
      page: 1,
      pageSize: 12,
      total: 1,
      name: "Publications",
      description: "…",
      publications: [{ slug: "journal-of-chemical-education", title: "T", authors: ["A"], journalName: "JCE", year: "2014", doi: "10.1234/eds" }],
    }) as any;
    expect(schema["@type"]).toBe("CollectionPage");
    expect(schema.url).toBe(`${SITE}/publications`);
    expect(schema.mainEntity.numberOfItems).toBe(1);
    // placeholder DOI stays out even in the collection listing
    expect(schema.mainEntity.itemListElement[0].item.identifier).toBeUndefined();
  });
});

describe("publicationCanonicalUrl", () => {
  it("is locale-correct", () => {
    expect(publicationCanonicalUrl("x", "en")).toBe(`${SITE}/publications/x`);
    expect(publicationCanonicalUrl("x", "km")).toBe(`${SITE}/km/publications/x`);
  });
});
