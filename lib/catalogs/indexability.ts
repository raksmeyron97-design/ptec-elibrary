// lib/catalogs/indexability.ts
//
// WHETHER a physical-catalogue record may be indexed and advertised — one
// pure decision, in the shape of lib/subjects/indexability.ts and for the
// same reason: the answer is needed by the page's `robots` meta and by the
// sitemap, and two copies of "is this one thick enough" is how a URL ends up
// in sitemap.xml pointing at a page that says `noindex`.
//
// ── What this is for ─────────────────────────────────────────────────────────
//
// Until now a catalogue record had no gate at all: `/catalogs/[slug]` set
// `robots: { index: false }` only on the NOT-FOUND branch, so every record
// that existed was indexable, and `app/sitemap.ts` emitted every one.
//
// That was harmless while the catalogue held six rows, all of them
// hand-catalogued. It stops being harmless with the PMB import, whose export
// carries **No., Title, Author, DDC, Barcode** — and nothing else. A page
// built from those four fields has no description, no subject, no cover and
// no abstract: it is a shelf label. Thousands of them would be exactly the
// thin-content family SEO V2 removed from subjects and SEO 3.3 §5 removed
// from shallow hubs, arriving all at once.
//
// ── The measurement behind the threshold ─────────────────────────────────────
//
// Production, 2026-09-20: all SIX live catalogue records carry their OWN
// `description` (checked by fetching each page — the auto-generated fallback
// begins "Find …", and none of the six did). A PMB-only row will carry none.
//
// So the boundary is already drawn by the data, and it needs no invented
// scoring: a record earns `index` when it says something a search result
// could be ABOUT. Every record live today passes; every PMB-only row does
// not, until a librarian enriches it.
//
// ── Two states, not three ────────────────────────────────────────────────────
//
// `lib/subjects/indexability.ts` has a third, `suppressed`, because a hub
// holding one resource is not a destination at all. A catalogue record is
// different: it is a real holding, on a real shelf, with a barcode, and a
// reader browsing the physical catalogue should still find it. So a thin
// record stays LINKED from /catalogs and stays `follow` — what is withdrawn
// is the claim that the page is worth ranking, not the page.

import {
  isDerivedDescription,
  type CatalogDescriptionSource,
} from "./derived-description";

/** The fields this decision reads. Everything is optional: a caller that did
 *  not select a column must not accidentally promote or demote a record. */
export interface CatalogRecordSignals extends CatalogDescriptionSource {
  /** The record's OWN description — never the generated meta description. */
  description?: string | null;
  /**
   * The slug of a digital book that is the same work, when one is known.
   *
   * A record that leads to full text is a useful search result whatever else
   * it carries, because the page is then an entry point rather than a
   * terminus. Nothing populates this yet — see the note in §Digital link
   * below — and the parameter exists so the gate does not have to change
   * shape when something does.
   */
  digitalBookSlug?: string | null;
}

/**
 * A description shorter than this is a label, not content.
 *
 * 40 characters is about one short sentence. Chosen as a floor rather than a
 * target: the point is to exclude `"—"`, `"n/a"` and a repeated title, not to
 * grade prose. All six production records clear it comfortably.
 */
export const CATALOG_MIN_DESCRIPTION_CHARS = 40;

export type CatalogVisibility = "index" | "noindex";

export interface CatalogIndexability {
  visibility: CatalogVisibility;
  /** Why, for the report and for the admin data-quality surface. */
  reason:
    | "has-description"
    | "links-to-full-text"
    | "record-only"
    /** Long enough, but it only restates the record. See derived-description.ts. */
    | "derived-description"
    /**
     * A description was given with none of the fields needed to tell whether
     * it merely restates them. Conservative on purpose: the alternative is
     * crediting a template nobody could check.
     */
    | "unchecked-description";
}

/**
 * May this catalogue record be indexed and advertised?
 *
 * Deliberately conservative in one direction: an ABSENT description reads as
 * thin, and a record is never promoted by a field this function was not
 * given. Demoting a rich record costs it a ranking it may not have had;
 * promoting a shelf label costs the whole domain a little thin-content
 * credibility, and there could be thousands of those.
 */
export function assessCatalogIndexability(
  record: CatalogRecordSignals,
): CatalogIndexability {
  if (record.digitalBookSlug?.trim()) {
    return { visibility: "index", reason: "links-to-full-text" };
  }
  const description = record.description?.trim() ?? "";
  if (description.length < CATALOG_MIN_DESCRIPTION_CHARS) {
    return { visibility: "noindex", reason: "record-only" };
  }

  // Long enough is not the same as saying anything. Every one of the six
  // live records cleared the length check with the record read back to
  // itself — "Social sciences by Martin Ann M. DDC call number: 300 MAR."
  // — and so would all 13,429 rows staged in the import sheets.
  if (!hasComparableFields(record)) {
    return { visibility: "noindex", reason: "unchecked-description" };
  }
  if (isDerivedDescription(record)) {
    return { visibility: "noindex", reason: "derived-description" };
  }
  return { visibility: "index", reason: "has-description" };
}

/**
 * Did the caller give us anything to compare the description AGAINST?
 *
 * Without at least one identity field there is nothing to strip, so every
 * template would read as novel and the gate would credit exactly what it
 * exists to catch. A caller that selected no identity column therefore gets
 * `noindex` — the same direction this module is conservative in everywhere
 * else, and a source scan keeps both real call sites passing the fields.
 */
function hasComparableFields(record: CatalogRecordSignals): boolean {
  return Boolean(
    record.title?.trim() ||
      record.author?.trim() ||
      record.category?.trim() ||
      record.department?.trim() ||
      record.ddc?.trim(),
  );
}

/** The `robots` value for a catalogue page. `follow` always: the record's
 *  links to its subject and its copies stay worth crawling either way. */
export function catalogRobots(record: CatalogRecordSignals): {
  index: boolean;
  follow: true;
} {
  return { index: assessCatalogIndexability(record).visibility === "index", follow: true };
}

/** Whether `app/sitemap.ts` may advertise this record. */
export function isCatalogRecordIndexable(record: CatalogRecordSignals): boolean {
  return assessCatalogIndexability(record).visibility === "index";
}
