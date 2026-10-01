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
 * Unicode-aware URL slug. Generates URL-friendly slugs for any script
 * (Khmer, English, or mixed bilingual titles).
 * Keeps letters (\p{L}), combining marks (\p{M}), and digits (\p{N}).
 * Replaces spaces, zero-width spaces, and punctuation with hyphens.
 * May return "".
 */
export function unicodeSlug(value: string): string {
  const unicode = value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  // A digits-and-hyphens-only remnant of a stripped title ("-2") is worse
  // than empty — let callers hit their explicit fallback instead.
  if (!/\p{L}/u.test(unicode) && unicode.length < 3) return "";
  return unicode;
}

/**
 * Does `value` look like a slug unicodeSlug() would emit? Lowercase letters
 * in any script, combining marks, digits, single hyphens between segments.
 *
 * This lives beside the builder on purpose: the admin post/thesis forms run
 * every keystroke through unicodeSlug(), so a validator that only accepted
 * /^[a-z0-9-]+$/ rejected the slug its own form had just generated, and no
 * Khmer-titled post or thesis could be saved at all.
 */
export function isValidSlug(value: string): boolean {
  return value === value.toLowerCase() && /^[\p{L}\p{M}\p{N}]+(-[\p{L}\p{M}\p{N}]+)*$/u.test(value);
}

// ── New-record slugs (SEO Phase 2.8, finding F16, decision D8) ──────────────
//
// A slug derived from a whole title can be enormous: one production thesis
// URL is 953 characters percent-encoded, because a Khmer letter is nine
// encoded characters and the title ran to a paragraph, and 320 sitemap URLs
// exceed 500. A NEW record's slug is therefore capped to its first few words.
// Existing slugs are never recomputed (D8): these helpers are called only
// where a record is CREATED from its title, never on edit and never for a
// lookup — `slugify()`/`unicodeSlug()` also identify existing rows, and
// changing them would move every one of those URLs.

/** Default word cap for a new record's slug. NEXT_PUBLIC_SEO_SLUG_MAX_WORDS
 *  overrides it — public because the admin forms derive a slug in the
 *  browser and the server must agree with them. The ICU word dictionary
 *  counts Khmer words, which have no spaces between them. */
export const NEW_SLUG_MAX_WORDS = 8;
/** Hard ceiling in characters, for a single "word" too long on its own. At
 *  nine encoded characters per Khmer letter, 60 keeps a slug under ~540. */
export const NEW_SLUG_MAX_CHARS = 60;

function configuredMaxWords(): number {
  // A direct `process.env.NEXT_PUBLIC_…` reference, which Next inlines into
  // the client bundle at build time.
  const raw = process.env.NEXT_PUBLIC_SEO_SLUG_MAX_WORDS;
  const n = Number(raw?.trim());
  return Number.isInteger(n) && n >= 1 ? n : NEW_SLUG_MAX_WORDS;
}

/**
 * The first `maxWords` words of a slug, and never more than `maxChars`
 * characters, cut at a word boundary where one exists and at a grapheme
 * boundary otherwise — never inside a Khmer cluster, never on a hyphen.
 */
export function capSlug(
  slug: string,
  { maxWords = configuredMaxWords(), maxChars = NEW_SLUG_MAX_CHARS }: { maxWords?: number; maxChars?: number } = {},
): string {
  if (!slug) return slug;
  const tidy = (s: string) => s.replace(/-+$/u, "");
  const words = new Intl.Segmenter(/\p{Script=Khmer}/u.test(slug) ? "km" : "en", { granularity: "word" });
  let end = 0;
  let count = 0;
  for (const seg of words.segment(slug)) {
    if (!seg.isWordLike) continue;
    const segEnd = seg.index + seg.segment.length;
    if (count + 1 > maxWords || [...slug.slice(0, segEnd)].length > maxChars) break;
    count += 1;
    end = segEnd;
  }
  if (end > 0) return tidy(slug.slice(0, end));
  // One word longer than the ceiling: cut on a grapheme boundary.
  let out = "";
  for (const { segment } of new Intl.Segmenter("km", { granularity: "grapheme" }).segment(slug)) {
    if ([...out + segment].length > maxChars) break;
    out += segment;
  }
  return tidy(out) || slug;
}

/** The slug for a record being created from `title`, capped; "" when the
 *  title yields none (callers keep their own fallback). */
export function newRecordSlug(title: string): string {
  return capSlug(unicodeSlug(title));
}
