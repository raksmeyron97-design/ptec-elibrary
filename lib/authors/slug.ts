// lib/authors/slug.ts
//
// The ONE rule for turning a book author's name into their public
// /authors/<slug> segment, and the write that guarantees the column is never
// left NULL.
//
// WHY THIS EXISTS
//
// `public.authors.slug` (migration 0125) was populated by a one-time SQL
// backfill and by nothing else: the admin book save upserts an author with
// `{ name }` alone, so every author created after 0125 ran kept slug = NULL.
// The categories and departments upserts on either side of it both write a
// slug; authors was simply missed.
//
// That NULL is not cosmetic. `author_profiles_public` (0126) — the view
// middleware's slug gate reads — is `where slug is not null`, so a slug-less
// author is invisible to the gate and middleware rewrites their URL to a hard
// 404 before the page (which CAN resolve them, by scanning names) ever runs.
// Measured on production 2026-09-07: 154 of 157 authors had slug = NULL, so
// 154 of the 157 author URLs in app/sitemap.ts and on the /authors hub
// answered 404 — dead internal links, and submitted-URL-404s in Search
// Console.
//
// The derivation is `unicodeSlug()` and NOT the SQL `author_slugify()` from
// 0125: that function replaces every non-[:alnum:] run with a hyphen, and
// Khmer dependent vowels and signs are combining marks, not alnum — so it
// shreds "ឡុង រក្សា" into "ឡ-ង-រក-ស". 74 of this library's 157 authors have
// Khmer names, and the sitemap and the hub already advertise the
// unicodeSlug() form for every one of them. Deriving here, in the one place
// the app already defines a slug, keeps a single algorithm rather than a SQL
// copy that drifts — the same call migration 0130 made for normalizeTitle().

import { unicodeSlug } from "@/lib/slug";

/**
 * The public slug for an author name, or null when the name yields nothing
 * addressable (unicodeSlug refuses a digits-only remnant).
 */
export function authorSlug(name: string | null | undefined): string | null {
  return unicodeSlug((name ?? "").trim()) || null;
}

/** The narrow slice of the Supabase client this module needs. */
type AuthorSlugWriter = {
  from: (table: "authors") => {
    update: (values: { slug: string }) => {
      eq: (column: "id", value: string) => {
        is: (column: "slug", value: null) => PromiseLike<{ error: unknown }>;
      };
    };
  };
};

/**
 * Give `authorId` a slug if — and only if — it does not have one.
 *
 * Filtered on `slug is null` rather than written unconditionally on purpose.
 * An admin may correct an author's slug (app/sitemap.ts prefers the stored
 * value precisely so a correction takes effect), and re-deriving from the name
 * on every book save would silently undo that correction and retire a live
 * URL. A no-op for a row that already has one, so it is safe to call on every
 * save and safe to re-run.
 */
export async function ensureAuthorSlug(
  supabase: AuthorSlugWriter,
  authorId: string,
  name: string,
): Promise<void> {
  const slug = authorSlug(name);
  if (!slug) return;
  await supabase.from("authors").update({ slug }).eq("id", authorId).is("slug", null);
}

/**
 * The slug an author URL may be ADVERTISED under — in app/sitemap.ts, on the
 * /authors hub, and anywhere else that links a profile — or null when the
 * author has no addressable page.
 *
 * The distinction between `undefined` and `null` is the whole function, and it
 * is not a style choice:
 *
 *   • `undefined` — the reader did not get a `slug` column back, which before
 *     migration 0125 means the column does not exist. `author_profiles_public`
 *     (0126) does not exist either then, so middleware's gate fails open and
 *     any name-derived URL resolves. Keeping the name-derived fallback here is
 *     what stops a deploy window from emptying the sitemap of every author.
 *
 *   • `null` — the column exists and this row's value is missing. The gate's
 *     view is `where slug is not null`, so this author's URL is rewritten to a
 *     hard 404 at the edge no matter what we derive. Advertising it anyway is
 *     how 154 dead links reached the hub and 154 submitted-URL-404s reached
 *     the sitemap; returning null keeps the promise the subjects hub already
 *     keeps (getIndexableSubjects, docs/SEO-V2-AUDIT.md F-1) — never advertise
 *     a URL the application will not serve.
 *
 * The repair for a null is to give the row a slug (scripts/backfill-author-
 * slugs.ts), not to widen this rule.
 */
export function addressableAuthorSlug(
  storedSlug: string | null | undefined,
  name: string | null | undefined,
): string | null {
  if (storedSlug === undefined) return authorSlug(name);
  const stored = storedSlug?.trim();
  return stored || null;
}
