import { describe, expect, it } from "vitest";
import { thesisFulltextPath, thesisIsOpenAccess, type ThesisOpenAccessRow } from "./open-access";

const open: ThesisOpenAccessRow = {
  access: "open",
  license: "cc_by",
  access_consent_at: "2026-09-30T00:00:00Z",
  is_published: true,
  file_url: "https://storage.example/research/x.pdf",
  download_override: "inherit",
};

describe("thesisIsOpenAccess", () => {
  it("is public when a librarian recorded access, licence and consent", () => {
    expect(thesisIsOpenAccess(open)).toBe(true);
  });
  it("is restricted by default and whenever any condition is missing", () => {
    expect(thesisIsOpenAccess({ ...open, access: "restricted" })).toBe(false);
    expect(thesisIsOpenAccess({ ...open, access: undefined })).toBe(false);
    expect(thesisIsOpenAccess({ ...open, license: "unknown" })).toBe(false);
    expect(thesisIsOpenAccess({ ...open, license: null })).toBe(false);
    expect(thesisIsOpenAccess({ ...open, access_consent_at: null })).toBe(false);
    expect(thesisIsOpenAccess({ ...open, is_published: false })).toBe(false);
    expect(thesisIsOpenAccess({ ...open, file_url: "  " })).toBe(false);
  });
  it("an admin block closes the public door too", () => {
    expect(thesisIsOpenAccess({ ...open, download_override: "block" })).toBe(false);
  });
  it("all-rights-reserved with consent is still a recorded licence", () => {
    expect(thesisIsOpenAccess({ ...open, license: "all_rights_reserved" })).toBe(true);
  });
});

describe("thesisFulltextPath", () => {
  it("sits in the abstract page's directory, per locale", () => {
    expect(thesisFulltextPath("my-thesis", "en")).toBe("/theses/my-thesis/fulltext.pdf");
    expect(thesisFulltextPath("my-thesis", "km")).toBe("/km/theses/my-thesis/fulltext.pdf");
  });
});
