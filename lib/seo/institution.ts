// lib/seo/institution.ts
//
// PTEC's OWN institutional vocabulary, as published on www.ptec.edu.kh.
//
// This is a REFERENCE, not a data source. Nothing renders from it and nothing
// queries it. It exists so that:
//
//   1. the entity names this application uses can be checked against what the
//      institution actually calls itself (SEO V3 §28, entity consistency), and
//   2. the "faculty" ambiguity is written down once, in code, next to a test
//      that fails if a public surface starts asserting the wrong thing.
//
// ── The ambiguity ────────────────────────────────────────────────────────────
//
// "Faculty" means two different things across the two systems:
//
//   www.ptec.edu.kh   → an ACADEMIC UNIT of the college. There are three.
//   research_faculties → a TRACK/MAJOR inside a degree programme. There are five.
//
// The e-Library does not model PTEC's three academic units at all. Rendering
// `research_faculties` values under a bare "Faculty" label therefore publishes
// a claim about PTEC's structure that PTEC's own website contradicts — so the
// public thesis listing labels that facet "Faculty / Major".
//
// Full picture, including why no faculty/department landing pages exist:
// docs/PTEC-ENTITY-MAPPING.md and docs/SEO-V3-AUDIT.md D-6/D-7.
//
// Read from https://www.ptec.edu.kh on 2026-08-31. If the institution
// reorganises, update this file and the mapping document together — never
// silently.

/** PTEC's three academic units, as named on its own site. */
export const PTEC_FACULTIES = [
  "Faculty of Pedagogy and Research",
  "Faculty of Science Education",
  "Faculty of Social Sciences Education",
] as const;

/**
 * PTEC's seven departments — the `cmdp_department` term set on
 * www.ptec.edu.kh, and the filter offered by its lecturer directory.
 */
export const PTEC_DEPARTMENTS = [
  "Department of Pedagogy",
  "Department of Educational Research and Library",
  "Department of Sciences",
  "Department of Mathematics",
  "Department of Languages",
  "Department of Social Sciences",
  "Department of ICT",
] as const;

/**
 * The department that operates this library. Named here because it is the one
 * institutional relationship the library states about itself.
 */
export const PTEC_LIBRARY_DEPARTMENT = "Department of Educational Research and Library";

/**
 * Labels a public surface may use for a `research_faculties` value.
 *
 * A bare "Faculty" is excluded on purpose — see the ambiguity note above.
 * Pinned by lib/seo/institution.test.ts.
 */
export const PROGRAM_TRACK_LABELS = {
  en: "Faculty / Major",
  km: "មហាវិទ្យាល័យ / ជំនាញ",
} as const;
