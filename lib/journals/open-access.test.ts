import { describe, expect, it } from "vitest";
import { articleIsOpenAccess } from "./open-access";

const base = { slug: "a", title: "A", pdf_url: "https://s/a.pdf", is_published: true };

describe("articleIsOpenAccess", () => {
  it("an openly licensed article with a PDF is public", () => {
    expect(articleIsOpenAccess({ ...base, license: "CC BY 4.0" })).toBe(true);
  });
  it("a librarian's explicit redistribution override counts", () => {
    expect(articleIsOpenAccess({ ...base, license: null, fulltext_redistributable: true })).toBe(true);
  });
  it("no PDF, downloads switched off, an unpublished article, or no open licence: not public", () => {
    expect(articleIsOpenAccess({ ...base, pdf_url: null, license: "CC BY 4.0" })).toBe(false);
    expect(articleIsOpenAccess({ ...base, license: "CC BY 4.0", allow_download: false })).toBe(false);
    expect(articleIsOpenAccess({ ...base, license: "CC BY 4.0", is_published: false })).toBe(false);
    expect(articleIsOpenAccess({ ...base, license: null, publisher: "Elsevier" })).toBe(false);
  });
  it("follows the download rule for PTEC's own work: no licence and no outside publisher is open", () => {
    // lib/seo/publication-seo.ts isFreelyAccessible — the same rule the
    // article's download button uses, so the two cannot disagree.
    expect(articleIsOpenAccess({ ...base, license: null, publisher: null })).toBe(true);
  });
});
