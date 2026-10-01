/**
 * Record health in the catalogue editor: facts about the saved record, each
 * naming a consequence a reader feels. Search visibility is not among them:
 * since SEO decision P2-1 no catalogue record is indexed, so it would be a
 * check no edit could pass.
 */
import { describe, it, expect } from "vitest";
import { assessCatalogRecordHealth, type RecordHealthInput } from "@/lib/catalogs/record-health";
import { assessCatalogIndexability } from "@/lib/catalogs/indexability";

/** A row exactly as the PMB import sheets produce it. */
const PMB: RecordHealthInput = {
  title: "The Truth About Stacey",
  author: "Martin, Ann M.",
  description: "Social sciences by Martin Ann M. DDC call number: 300 MAR.",
  category: "300 វិទ្យាសាស្ត្រសង្គម",
  department: "Department of Social Sciences",
  ddc: "300 MAR",
  publisher: null,
  shelf_location: null,
  isbn: null,
  year: null,
  cover_url: null,
};

const byId = (checks: ReturnType<typeof assessCatalogRecordHealth>) =>
  Object.fromEntries(checks.map((c) => [c.id, c]));

describe("assessCatalogRecordHealth", () => {
  it("reads a PMB row as it is: shelved and filed, but missing its bibliographic details", () => {
    const h = byId(assessCatalogRecordHealth(PMB, { total: 5 }));
    expect(h.copies.ok).toBe(true);
    expect(h["call-number"].ok).toBe(true);
    expect(h.subject.ok).toBe(true);
    expect(h.isbn).toMatchObject({ ok: false, tier: "info" });
    expect(h.publication).toMatchObject({ ok: false, tier: "info" });
    expect(h.cover).toMatchObject({ ok: false, tier: "info" });
  });

  it("offers no search-visibility check, because no record can pass one (P2-1)", () => {
    const described = { ...PMB, description: "A practical guide to classroom assessment for primary teachers, with worked rubrics and case studies from Cambodian schools." };
    expect(assessCatalogIndexability({ ...described, shelfLocation: null }).visibility).toBe("noindex");
    for (const r of [PMB, { ...PMB, description: null }, described]) {
      expect(assessCatalogRecordHealth(r, { total: 1 }).map((c) => c.id)).not.toContain("search-visibility");
    }
  });

  it("a record whose every copy is withdrawn has no copies", () => {
    expect(byId(assessCatalogRecordHealth(PMB, { total: 0 })).copies.ok).toBe(false);
  });

  it("a shelf mark stands in for a call number, and blank is absent", () => {
    expect(byId(assessCatalogRecordHealth({ ...PMB, ddc: "  ", shelf_location: "Shelf A-1" }, { total: 1 }))["call-number"].ok).toBe(true);
    expect(byId(assessCatalogRecordHealth({ ...PMB, ddc: " ", shelf_location: "" }, { total: 1 }))["call-number"].ok).toBe(false);
    expect(byId(assessCatalogRecordHealth({ ...PMB, category: " " }, { total: 1 })).subject.ok).toBe(false);
  });

  it("publication needs both publisher and year", () => {
    expect(byId(assessCatalogRecordHealth({ ...PMB, publisher: "MoEYS" }, { total: 1 })).publication.ok).toBe(false);
    expect(byId(assessCatalogRecordHealth({ ...PMB, publisher: "MoEYS", year: 2019 }, { total: 1 })).publication.ok).toBe(true);
  });

  it("every check has a message in both languages", async () => {
    const en = (await import("@/messages/en.json")).default.adminCatalog.edit.health as Record<string, string>;
    const km = (await import("@/messages/km.json")).default.adminCatalog.edit.health as Record<string, string>;
    const keys = [
      "copiesOk", "copiesBad", "callNumberOk", "callNumberBad", "subjectOk", "subjectBad",
      "isbnOk", "isbnBad", "publicationOk", "publicationBad", "coverOk", "coverBad",
    ];
    for (const k of keys) {
      expect(en[k], `en ${k}`).toBeTruthy();
      expect(km[k], `km ${k}`).toBeTruthy();
    }
  });
});
