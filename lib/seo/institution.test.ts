// lib/seo/institution.test.ts
//
// Entity-consistency invariants for how this application names PTEC's
// structure (SEO V3 §28; docs/PTEC-ENTITY-MAPPING.md §3, docs/SEO-V3-AUDIT.md D-7).
//
// The rule being enforced: `research_faculties` holds programme TRACKS, not
// PTEC's three academic faculties, so no public surface may present those
// values under a bare "Faculty" label. The public thesis listing did exactly
// that — with a hardcoded English string, on a bilingual page.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  PROGRAM_TRACK_LABELS,
  PTEC_DEPARTMENTS,
  PTEC_FACULTIES,
  PTEC_LIBRARY_DEPARTMENT,
} from "@/lib/seo/institution";

const ROOT = process.cwd();
const en = JSON.parse(readFileSync(join(ROOT, "messages/en.json"), "utf8"));
const km = JSON.parse(readFileSync(join(ROOT, "messages/km.json"), "utf8"));

describe("PTEC's published structure", () => {
  it("has three academic faculties, distinct and non-empty", () => {
    expect(PTEC_FACULTIES).toHaveLength(3);
    expect(new Set(PTEC_FACULTIES).size).toBe(3);
    for (const f of PTEC_FACULTIES) expect(f.startsWith("Faculty of ")).toBe(true);
  });

  it("has seven departments, distinct and non-empty", () => {
    expect(PTEC_DEPARTMENTS).toHaveLength(7);
    expect(new Set(PTEC_DEPARTMENTS).size).toBe(7);
    for (const d of PTEC_DEPARTMENTS) expect(d.startsWith("Department of ")).toBe(true);
  });

  it("names the library's own department as one of the seven", () => {
    expect(PTEC_DEPARTMENTS).toContain(PTEC_LIBRARY_DEPARTMENT);
  });

  it("keeps faculties and departments as separate concepts", () => {
    // Five programme tracks are seeded in migration 0055 under the name
    // "research_faculties". None of them is one of PTEC's academic faculties —
    // that non-overlap IS the finding, and if it ever changes the mapping
    // document is wrong.
    const tracks = [
      "Primary Education",
      "Lower Secondary Education",
      "Early Childhood Education",
      "School Management",
      "Educational Management and Leadership",
    ];
    for (const t of tracks) expect(PTEC_FACULTIES).not.toContain(t);
  });
});

describe("public labelling of research_faculties", () => {
  it('the hedged label is used, never a bare "Faculty"', () => {
    expect(PROGRAM_TRACK_LABELS.en).toBe("Faculty / Major");
    expect(PROGRAM_TRACK_LABELS.en).not.toBe("Faculty");
    expect(PROGRAM_TRACK_LABELS.km).not.toHaveLength(0);
  });

  it("both message catalogues carry the hedged label for the public facet", () => {
    expect(en.theses.appliedFilters.faculty).toBe(PROGRAM_TRACK_LABELS.en);
    expect(km.theses.appliedFilters.faculty).toBe(PROGRAM_TRACK_LABELS.km);
  });

  it("the public thesis listing translates its filter chips instead of hardcoding English", () => {
    const src = readFileSync(join(ROOT, "app/[locale]/(public)/theses/page.tsx"), "utf8");
    // A hardcoded label on a bilingual public page is both an i18n defect and,
    // for this facet specifically, the wrong claim about PTEC's structure.
    for (const literal of ['label: "Faculty"', 'label: "Program"', 'label: "Search"']) {
      expect(src).not.toContain(literal);
    }
    expect(src).toContain('tFilters("faculty")');
  });

  it("no Khmer applied-filter label is left in English", () => {
    const enLabels = en.theses.appliedFilters as Record<string, string>;
    const kmLabels = km.theses.appliedFilters as Record<string, string>;
    expect(Object.keys(kmLabels).sort()).toEqual(Object.keys(enLabels).sort());
    for (const [key, value] of Object.entries(kmLabels)) {
      expect(value.trim().length).toBeGreaterThan(0);
      // Every one of these has a real Khmer rendering; an untranslated copy
      // would be byte-identical to the English.
      expect(value).not.toBe(enLabels[key]);
    }
  });
});
