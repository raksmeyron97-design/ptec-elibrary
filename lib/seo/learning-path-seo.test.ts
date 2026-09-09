import { describe, it, expect } from "vitest";
import {
  pathLocalizedTitle,
  pathLocalizedDescription,
  pathCanonicalUrl,
  buildPathMetadata,
  pathCourseJsonLd,
  pathsCollectionJsonLd,
  buildPathsListingMetadata,
  FALLBACK_OG_IMAGE,
  type LearningPathSeoInput,
} from "./learning-path-seo";

const SITE = "https://library.ptec.edu.kh";

const math: LearningPathSeoInput = {
  slug: "foundation-of-mathematics",
  title: "Foundations of Mathematics for Teacher Trainees",
  titleKm: "មូលដ្ឋានគ្រឹះគណិតវិទ្យា",
  description: "Curriculum knowledge and teaching methods for mathematics.",
  descriptionKm: "ចំណេះដឹងកម្មវិធីសិក្សា និងវិធីសាស្ត្របង្រៀនគណិតវិទ្យា។",
  audience: "Year 1 Trainee",
  modules: [
    { title: "Number sense", steps: [{ title: "Book A", estMinutes: 30 }, { title: "Book B", estMinutes: 20 }] },
    { title: "Geometry", titleKm: "ធរណីមាត្រ", steps: [{ title: "Thesis C" }] },
  ],
};

describe("localized fields", () => {
  it("uses Khmer strings for the km locale, English for en", () => {
    expect(pathLocalizedTitle(math, "km")).toBe("មូលដ្ឋានគ្រឹះគណិតវិទ្យា");
    expect(pathLocalizedTitle(math, "en")).toBe("Foundations of Mathematics for Teacher Trainees");
    expect(pathLocalizedDescription(math, "km")).toContain("គណិតវិទ្យា");
  });

  it("falls back to a localized generated description when none is stored", () => {
    const en = pathLocalizedDescription({ ...math, description: null }, "en");
    const km = pathLocalizedDescription({ ...math, descriptionKm: null }, "km");
    expect(en).toContain("curated learning path");
    expect(km).toContain("ផ្លូវសិក្សា");
  });
});

describe("buildPathMetadata", () => {
  it("Khmer page canonical points to /km and is not English content", () => {
    const md = buildPathMetadata(math, "km");
    expect(md.alternates?.canonical).toBe(`${SITE}/km/paths/foundation-of-mathematics`);
    expect(md.title).toBe("មូលដ្ឋានគ្រឹះគណិតវិទ្យា");
    expect(md.openGraph?.locale).toBe("km_KH");
  });
});

describe("pathCourseJsonLd", () => {
  it("emits a truthful Course with provider, level, duration and modules", () => {
    const schema = pathCourseJsonLd(math, "en") as any;
    expect(schema["@type"]).toBe("Course");
    expect(schema.url).toBe(`${SITE}/paths/foundation-of-mathematics`);
    expect(schema.provider.name).toContain("Phnom Penh Teacher Education College");
    expect(schema.educationalLevel).toBe("Year 1 Trainee");
    expect(schema.timeRequired).toBe("PT50M"); // 30 + 20; the step with no duration is skipped
    expect(schema.hasPart).toHaveLength(2);
  });

  it("omits timeRequired when no real step durations exist (no invention)", () => {
    const schema = pathCourseJsonLd(
      { ...math, modules: [{ title: "M", steps: [{ title: "s" }] }] },
      "en",
    ) as any;
    expect(schema.timeRequired).toBeUndefined();
  });

  it("uses the Khmer name/description + km inLanguage for the km locale", () => {
    const schema = pathCourseJsonLd(math, "km") as any;
    expect(schema.name).toBe("មូលដ្ឋានគ្រឹះគណិតវិទ្យា");
    expect(schema.inLanguage).toBe("km");
    expect(schema.url).toBe(`${SITE}/km/paths/foundation-of-mathematics`);
  });
});

describe("pathsCollectionJsonLd", () => {
  it("lists every path with locale-correct Course items", () => {
    const schema = pathsCollectionJsonLd({
      locale: "km",
      name: "ផ្លូវសិក្សា",
      description: "…",
      paths: [math],
    }) as any;
    expect(schema.url).toBe(`${SITE}/km/paths`);
    expect(schema.mainEntity.numberOfItems).toBe(1);
    expect(schema.mainEntity.itemListElement[0].item.name).toBe("មូលដ្ឋានគ្រឹះគណិតវិទ្យា");
    expect(schema.mainEntity.itemListElement[0].url).toBe(`${SITE}/km/paths/foundation-of-mathematics`);
  });
});

describe("pathCanonicalUrl", () => {
  it("is locale-correct", () => {
    expect(pathCanonicalUrl("x", "en")).toBe(`${SITE}/paths/x`);
    expect(pathCanonicalUrl("x", "km")).toBe(`${SITE}/km/paths/x`);
  });
});

describe("buildPathsListingMetadata — the /paths collection listing", () => {
  const copy = { title: "Teacher Learning Paths", description: "Curated reading paths." };

  it("always carries a social image", () => {
    // Every other public listing falls back to the shared site card through
    // buildListingMetadata. /paths uses THIS builder, which never received the
    // fallback, so it was the one listing on the site emitting no og:image at
    // all — verified live 2026-09-09. A share of /paths rendered as a bare URL.
    const meta = buildPathsListingMetadata("en", copy);
    expect(meta.openGraph?.images).toEqual([
      { url: FALLBACK_OG_IMAGE, alt: expect.any(String) },
    ]);
    expect(meta.twitter?.images).toEqual([FALLBACK_OG_IMAGE]);
  });

  it("carries the social image in Khmer too", () => {
    const meta = buildPathsListingMetadata("km", copy);
    expect(meta.openGraph?.images).toEqual([
      { url: FALLBACK_OG_IMAGE, alt: expect.any(String) },
    ]);
  });

  it("marks an empty collection noindex, follow", () => {
    // With zero published paths the page renders only "No learning paths
    // published yet" — a soft-404 that was indexable and in the sitemap.
    const meta = buildPathsListingMetadata("en", { ...copy, isEmpty: true });
    expect(meta.robots).toEqual({ index: false, follow: true });
  });

  it("leaves a populated collection indexable (robots omitted)", () => {
    expect(buildPathsListingMetadata("en", copy).robots).toBeUndefined();
    expect(buildPathsListingMetadata("en", { ...copy, isEmpty: false }).robots).toBeUndefined();
  });

  it("keeps canonical + reciprocal hreflang in both locales", () => {
    const en = buildPathsListingMetadata("en", { ...copy, isEmpty: true });
    const km = buildPathsListingMetadata("km", { ...copy, isEmpty: true });
    expect(en.alternates?.canonical).toBe(`${SITE}/paths`);
    expect(km.alternates?.canonical).toBe(`${SITE}/km/paths`);
    expect(en.openGraph?.url).toBe(`${SITE}/paths`);
    expect(km.openGraph?.url).toBe(`${SITE}/km/paths`);
  });
});
