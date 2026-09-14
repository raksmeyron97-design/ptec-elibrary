// lib/authors/filter-key.ts
// The one string an author row is matched against by the /authors filter, and
// the one normalisation a typed query goes through. Both sides MUST use this
// function, or "Dawson" and "dawson" (or "Rodríguez" typed as "rodriguez")
// stop matching. Pure: the server stamps rows with it, the client filter
// normalises the query with it.
//
// Only Latin combining accents (U+0300–U+036F) are folded. Khmer vowel signs
// and subscripts are combining marks too, and stripping every \p{M} would
// shred a Khmer name into a consonant skeleton — the same trap the ingestion
// gate's normalizeTitle() documents.
export function authorFilterKey(...parts: Array<string | null | undefined>): string {
  return parts
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .normalize("NFC")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
