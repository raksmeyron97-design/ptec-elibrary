// lib/slug.ts — shared slug builders.
//
// URL slugs are ASCII-first: Latin titles keep producing exactly the slugs
// they always did. Titles with no usable Latin content (Khmer books, posts,
// catalog records) previously collapsed to junk fallbacks like "post", "-2"
// or "book-1781238129420"; they now keep their own script. That is safe
// end-to-end — middleware decodes the path segment before the slug gate,
// Next delivers route params percent-decoded, and <Link> encodes hrefs —
// and Khmer words in the URL are what Google displays (decoded) in Khmer
// search results.
//
// Storage keys must stay ASCII (Zima/R2 object keys): use asciiSlug().

/**
 * Normalize a [slug] route param before using it in a DB lookup. Next.js
 * delivers non-ASCII segments percent-encoded to page components (while
 * generateMetadata receives them decoded), so a Khmer slug arrives as
 * "%E1%9E%A2…" and would never match the stored value. Identity for the
 * ASCII slugs that dominate the catalog; malformed escapes fall through raw.
 */
export function decodeSlugParam(raw: string): string {
  if (!raw.includes("%")) return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Latin-only slug — the historical behavior. May return "". */
export function asciiSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Unicode-aware URL slug. Prefers the ASCII slug; when a title has no real
 * Latin content, keeps its letters/digits in any script. Zero-width spaces
 * (Khmer word boundaries) and whitespace become hyphens. May return "".
 */
export function unicodeSlug(value: string): string {
  const ascii = asciiSlug(value);
  if (ascii.length >= 3) return ascii;
  const unicode = value
    .toLowerCase()
    .trim()
    .replace(/[\u200B\s_]+/g, "-")
    // \p{M} keeps combining marks — Khmer dependent vowels and the coeng
    // subscript marker are category M, and dropping them corrupts the word.
    .replace(/[^\p{L}\p{M}\p{N}-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  // A digits-and-hyphens-only remnant of a stripped title ("-2") is worse
  // than empty — let callers hit their explicit fallback instead.
  if (!/\p{L}/u.test(unicode) && unicode.length < 3) return ascii;
  return unicode;
}
