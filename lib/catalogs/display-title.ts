// lib/catalogs/display-title.ts
//
// A catalogue title as a PAGE shows it. Pure.
//
// PMB and Koha records carry ISBD punctuation — a space BEFORE the colon that
// separates a subtitle ("Teacher Noticing : Bridging and Broadening…"), and
// the same for the parallel-title semicolon. That spacing is a cataloguing
// convention, not English typography, and it reached <title>, the H1 and the
// JSON-LD name verbatim (docs/seo/AUDIT-VERIFICATION.md F9).
//
// DISPLAY ONLY. The stored title is untouched: the Koha write path compares
// the form, the row and Koha field by field (lib/koha/catalog-writes.ts), so a
// normalised title reaching the admin form would be saved back and read as a
// change. Names are deliberately NOT re-ordered here — "Schack Edna O." has no
// comma to go by, and Khmer names are family-name first, so inversion is a
// librarian's decision (docs/seo/name-cleanup.csv).

export function catalogDisplayTitle(title: string | null | undefined): string {
  return (title ?? "")
    .replace(/\s+([:;])(?=\s)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
