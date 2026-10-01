// lib/seo/description-template.ts
//
// Which descriptions are the SAME template with different fill-ins (SEO
// Phase 5.1, finding F3). A bulk import writes "This Grade 4 Mathematics
// textbook from MoEYS…" four hundred times with the grade and subject
// swapped; each copy reads as a description, and together they are one
// sentence the library repeats. Pure.
//
// The fingerprint removes what a template fills in — the record's own title,
// subject and author, and every number (grades, years, page counts, in either
// script) — then hashes the set of 3-word shingles left. Two records with the
// same fingerprint say the same thing about different books.

/** The text with the record's own fill-ins removed, lowercased, numbers as #. */
export function descriptionResidue(
  description: string,
  fills: { title?: string | null; subject?: string | null; author?: string | null },
): string {
  let text = description.normalize("NFC").toLowerCase();
  for (const fill of [fills.title, fills.subject, fills.author]) {
    const f = fill?.normalize("NFC").toLowerCase().trim();
    if (f && f.length >= 2) text = text.split(f).join(" ");
  }
  return text
    .replace(/[0-9០-៩]+/g, "#")
    .replace(/[^\p{L}\p{M}#]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * The template fingerprint of a description: a hash of its sorted 3-word
 * shingles after the fill-ins are removed, or "empty" when nothing is left.
 * Khmer has no spaces, so a Khmer description shingles on its runs.
 */
export function templateKey(
  description: string | null | undefined,
  fills: { title?: string | null; subject?: string | null; author?: string | null } = {},
): string {
  const residue = description?.trim() ? descriptionResidue(description, fills) : "";
  const words = residue.split(" ").filter(Boolean);
  if (words.length === 0) return "empty";
  if (words.length < 3) return fnv1a(words.join(" "));
  const shingles = new Set<string>();
  for (let i = 0; i + 3 <= words.length; i += 1) shingles.add(words.slice(i, i + 3).join(" "));
  return fnv1a([...shingles].sort().join("|"));
}

/** Sizes of each template cluster, keyed by fingerprint. */
export function clusterSizes(keys: readonly string[]): Map<string, number> {
  const sizes = new Map<string, number>();
  for (const key of keys) sizes.set(key, (sizes.get(key) ?? 0) + 1);
  return sizes;
}

/** Is a stored date the year-only placeholder of an import (1 January of the
 *  year the record was created)? It flags; it never corrects. */
export function isPlaceholderDate(publishedAt: string | null | undefined, createdAt: string | null | undefined): boolean {
  const m = publishedAt?.match(/^(\d{4})-01-01/);
  if (!m || !createdAt) return false;
  return Number(m[1]) === new Date(createdAt).getUTCFullYear();
}
