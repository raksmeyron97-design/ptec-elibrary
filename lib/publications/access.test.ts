import { describe, expect, it } from "vitest";
import { resolveDownloadAccess, type DownloadAccessInput } from "@/lib/publications/access";
import { isFreelyAccessible } from "@/lib/seo/publication-seo";

// The gate that decides whether a PDF leaves the server. It is exercised here
// rather than through the route because the route's job is to ASK this
// question — if the answer is right, /api/publications/[slug]/file is right,
// and if it is wrong, no amount of route testing saves it.

const base: DownloadAccessInput = {
  slug: "responsible-chemistry",
  title: "From What Chemistry Can Do to What Chemists Should Do",
  publisher: "PTEC",
  license: "CC BY 4.0",
  pdf_url: "https://cdn.example/article.pdf",
};

describe("resolveDownloadAccess", () => {
  it("allows a PTEC-published, openly licensed record", () => {
    const access = resolveDownloadAccess(base);
    expect(access).toEqual({
      canDownload: true,
      canReadOnline: true,
      reason: null,
      message: null,
    });
  });

  describe("no file", () => {
    it("refuses both download and online reading", () => {
      const access = resolveDownloadAccess({ ...base, pdf_url: null });
      expect(access.canDownload).toBe(false);
      // The distinction that matters: nothing to read is not the same as
      // "you may not read this".
      expect(access.canReadOnline).toBe(false);
      expect(access.reason).toBe("no-file");
    });

    it("treats an empty string as no file", () => {
      expect(resolveDownloadAccess({ ...base, pdf_url: "" }).reason).toBe("no-file");
    });
  });

  describe("library policy (allow_download)", () => {
    it("blocks the download but keeps online reading", () => {
      const access = resolveDownloadAccess({ ...base, allow_download: false });
      expect(access.canDownload).toBe(false);
      expect(access.canReadOnline).toBe(true);
      expect(access.reason).toBe("policy");
    });

    it("surfaces the librarian's own explanation when one was recorded", () => {
      const access = resolveDownloadAccess({
        ...base,
        allow_download: false,
        download_disabled_reason: "Print embargo until June 2027.",
      });
      expect(access.message).toBe("Print embargo until June 2027.");
    });

    it("falls back to no message when the reason is blank", () => {
      const access = resolveDownloadAccess({
        ...base,
        allow_download: false,
        download_disabled_reason: "   ",
      });
      expect(access.message).toBeNull();
    });

    // The whole point of the column defaulting to true: a record read from a
    // database where 0125 has not been applied has no allow_download key at
    // all, and must behave exactly as it did before the migration existed.
    it("treats an absent column as allowed", () => {
      expect(resolveDownloadAccess(base).canDownload).toBe(true);
      expect(resolveDownloadAccess({ ...base, allow_download: undefined }).canDownload).toBe(true);
      expect(resolveDownloadAccess({ ...base, allow_download: null }).canDownload).toBe(true);
    });

    it("reports policy rather than rights when BOTH would refuse", () => {
      // A librarian can explain their own switch; they cannot explain a
      // copyright holder's terms. The more actionable reason wins.
      const access = resolveDownloadAccess({
        ...base,
        publisher: "American Chemical Society",
        license: "© 2025 ACS. All rights reserved.",
        allow_download: false,
      });
      expect(access.reason).toBe("policy");
    });
  });

  describe("redistribution rights", () => {
    it("refuses a third-party copyrighted record with no open licence", () => {
      const access = resolveDownloadAccess({
        ...base,
        publisher: "American Chemical Society",
        license: "© 2025 ACS. All rights reserved.",
      });
      expect(access.canDownload).toBe(false);
      expect(access.reason).toBe("rights");
      // The landing page and the viewer stay available — that is what makes a
      // citation-only record different from an unavailable one.
      expect(access.canReadOnline).toBe(true);
    });

    it("honours an explicit admin override of the licence heuristic", () => {
      const access = resolveDownloadAccess({
        ...base,
        publisher: "American Chemical Society",
        license: "© 2025 ACS. All rights reserved.",
        fulltext_redistributable: true,
      });
      expect(access.canDownload).toBe(true);
    });

    it("does not let the override defeat the library's own switch", () => {
      // Rights permission is not policy permission. An admin marking a record
      // redistributable says "we may"; it does not say "we do".
      const access = resolveDownloadAccess({
        ...base,
        fulltext_redistributable: true,
        allow_download: false,
      });
      expect(access.canDownload).toBe(false);
      expect(access.reason).toBe("policy");
    });
  });

  // The rights half of the decision MUST agree with the predicate the SEO
  // builder uses to claim `isAccessibleForFree`. If these ever diverge, a
  // record advertises itself as open access in structured data while the
  // server refuses the file — or the reverse.
  describe("agreement with the SEO accessibility claim", () => {
    const cases: { publisher: string | null; license: string | null }[] = [
      { publisher: "PTEC", license: null },
      { publisher: null, license: null },
      { publisher: "American Chemical Society", license: null },
      { publisher: "American Chemical Society", license: "CC BY 4.0" },
      { publisher: "American Chemical Society", license: "© 2025 ACS" },
      { publisher: "Elsevier", license: "CC BY-NC-ND 4.0" },
    ];

    for (const { publisher, license } of cases) {
      it(`matches for publisher=${publisher ?? "null"} licence=${license ?? "null"}`, () => {
        const access = resolveDownloadAccess({ ...base, publisher, license });
        const seoSaysFree = isFreelyAccessible({
          slug: base.slug,
          title: base.title,
          publisher,
          license,
        });
        expect(access.canDownload).toBe(seoSaysFree);
      });
    }
  });
});
