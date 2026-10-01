// lib/theses/open-access.ts
//
// Whether a thesis's full text is PUBLIC (SEO Phase 3.4, decisions D4, D12).
// Pure and browser-safe; the one rule for the full-text route, the
// `citation_pdf_url` tag and the admin preview.
//
// Public means served to anyone, signed in or not, at
// /theses/<slug>/fulltext.pdf, and named to Google Scholar. It is a
// librarian's decision recorded on the row (0163): `access = 'open'`, with a
// licence and the authors' consent — the database refuses `open` without
// both. The signed-in download (lib/theses/download-permission.ts) is a
// different door with its own rules and is not changed by any of this.
//
// Conservative in one direction: an admin BLOCK override also closes the
// public door, so "block" keeps meaning "nobody gets this file".

import { thesisLicense } from "@/lib/theses/license";

export type ThesisOpenAccessRow = {
  access?: string | null;
  license?: string | null;
  access_consent_at?: string | null;
  is_published?: boolean | null;
  file_url?: string | null;
  download_override?: string | null;
};

/** Is this thesis's full text public? Every condition must hold. */
export function thesisIsOpenAccess(row: ThesisOpenAccessRow): boolean {
  return (
    row.access === "open" &&
    row.is_published === true &&
    Boolean(row.file_url?.trim()) &&
    Boolean(row.access_consent_at) &&
    thesisLicense(row.license) !== null &&
    row.download_override !== "block"
  );
}

/** The public full-text path for a thesis, in the abstract page's directory. */
export function thesisFulltextPath(slug: string, locale: string): string {
  return `${locale === "km" ? "/km" : ""}/theses/${slug}/fulltext.pdf`;
}
