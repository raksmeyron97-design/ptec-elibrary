// Rule-drafted rights basis (WI-5). Pure; a DRAFT, never a decision.
//
// Only who MADE the book decides, never its title: "Ministry of Education"
// in a title is a subject, on the title page as the publisher it is a fact.
//   1. MoEYS as publisher or author  → government_public
//   2. PTEC as publisher or author   → ptec_original
//   3. a commercial signal — a named commercial publisher or a commercial
//      ISBN registrant, the vocabulary of lib/rights/publisher-signals.ts —
//      → commercial
//   4. anything else                 → unknown (including open-access NGOs and
//      stated licences: those are for a librarian to confirm, not a rule)
// `source` names the rule, so the review page can filter and bulk-confirm one
// rule's output as an explicit, countable set.

import { classifyRights } from "@/lib/rights/publisher-signals";
import type { RightsBasis } from "@/lib/books/rights";

export type RightsDraftInput = {
  publisher?: string | null;
  authors?: readonly (string | null | undefined)[] | null;
  isbn?: string | null;
};

export type RightsDraft = { basis: RightsBasis; source: string };

const MOEYS = ["ministry of education", "moeys", "ក្រសួងអប់រំ", "អប់រំ យុវជន និងកីឡា"];
// Not the generic "teacher education college": Cambodia has several.
const PTEC_PHRASES = ["phnom penh teacher education", "វិទ្យាស្ថានគរុកោសល្យរាជធានីភ្នំពេញ", "វ.គ.ភ"];
const PTEC_ACRONYM = /\bptec\b/i;

const norm = (s: string | null | undefined) => (s ?? "").normalize("NFC").toLowerCase();
const isMoeys = (s: string) => MOEYS.some((m) => s.includes(m));
const isPtec = (s: string) => PTEC_PHRASES.some((p) => s.includes(p)) || PTEC_ACRONYM.test(s);

export function draftRightsBasis(input: RightsDraftInput): RightsDraft {
  const publisher = norm(input.publisher);
  const authors = (input.authors ?? []).map((a) => norm(a)).filter(Boolean);

  if (publisher && isMoeys(publisher)) return { basis: "government_public", source: "rule:moeys_publisher" };
  if (authors.some(isMoeys)) return { basis: "government_public", source: "rule:moeys_author" };
  if (publisher && isPtec(publisher)) return { basis: "ptec_original", source: "rule:ptec_publisher" };
  if (authors.some(isPtec)) return { basis: "ptec_original", source: "rule:ptec_author" };

  // The commercial vocabulary, asked about the artefact's own facts only.
  const verdict = classifyRights({ publisher: input.publisher, isbn: input.isbn });
  if (verdict.rightsClass === "commercial-likely") {
    return {
      basis: "commercial",
      source: verdict.reason.startsWith("ISBN") ? "rule:commercial_isbn" : "rule:commercial_publisher",
    };
  }
  return { basis: "unknown", source: "rule:none" };
}

/**
 * Review order (Gate 4 §4.5 as briefed: primary grades 1–6, Khmer and maths
 * first). Lower ranks first. A title's own words decide ORDER only — never
 * the basis.
 */
export function rightsReviewRank(title: string | null | undefined): number {
  const t = (title ?? "").normalize("NFC");
  const khmer = /[ក-៿]/.test(t);
  const folded = t.replace(/[០-៩]/g, (d) => String(d.charCodeAt(0) - 0x17e0));
  const primary = /ថ្នាក់ទី\s*[1-6](?!\d)|grade\s*[1-6]\b/i.test(folded);
  const maths = /គណិត|math/i.test(t);
  if (primary && khmer && maths) return 0;
  if (primary && khmer) return 1;
  if (primary && maths) return 2;
  if (primary) return 3;
  if (khmer) return 4;
  return 5;
}
