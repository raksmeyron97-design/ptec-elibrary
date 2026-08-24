// lib/homepage-photos.ts
//
// Public read path for the admin-managed homepage gallery (migration 0118).
//
// Read with the ANON client through unstable_cache, the same shape as
// lib/collection-stats.ts and lib/home-data.ts: no cookie access, so the
// homepage stays prerenderable, and RLS ("active rows only") is enforced by
// the database rather than by a `.eq()` the next caller could forget.
//
// Cached under the "homepage-photos" tag. Every mutation in
// app/actions/homepage-photos.ts calls revalidateHomepagePhotos().

import { unstable_cache } from "next/cache";
import { createPublicClient } from "./supabase/public";
import { TAGS } from "./cache/revalidate";
import {
  localizePhoto,
  isPhotoCategory,
  type PublicHomepagePhoto,
} from "./types/homepage-photo";

const REVALIDATE = 300; // seconds — matches the other homepage fetchers

/** Hard ceiling on what the homepage will render. The gallery uses three
 *  photos in the mosaic and three in the narrative cards; anything past that
 *  is counted for the "+N more" badge but never serialized into the page. */
export const HOMEPAGE_PHOTO_LIMIT = 12;

type Row = {
  id: string;
  public_url: string;
  width: number | null;
  height: number | null;
  blur_data_url: string | null;
  caption_km: string | null;
  caption_en: string | null;
  alt_text_km: string | null;
  alt_text_en: string | null;
  category: string;
};

const SELECT =
  "id, public_url, width, height, blur_data_url, caption_km, caption_en, alt_text_km, alt_text_en, category";

/** Locale-independent fetch, so one cache entry serves both /en and /km —
 *  localisation happens after the cache, in getHomepagePhotos(). */
const getActivePhotoRowsCached = unstable_cache(
  async (): Promise<Row[]> => {
    const db = createPublicClient();
    const { data, error } = await db
      .from("homepage_photos")
      .select(SELECT)
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(HOMEPAGE_PHOTO_LIMIT);

    if (error) {
      // The gallery is decorative; a failed read must degrade to "no photos",
      // never take the homepage down.
      console.error("[homepage-photos] read failed:", error.message);
      return [];
    }
    return (data ?? []) as Row[];
  },
  ["homepage-photos-active"],
  { revalidate: REVALIDATE, tags: [TAGS.homepagePhotos] },
);

/**
 * Active photos for the given locale, in display order.
 * Returns `[]` when the table is empty or unreachable — every consumer must
 * render nothing rather than an empty frame in that case.
 */
export async function getHomepagePhotos(locale: string): Promise<PublicHomepagePhoto[]> {
  const rows = await getActivePhotoRowsCached();
  return rows.map((row) =>
    localizePhoto(
      {
        ...row,
        category: isPhotoCategory(row.category) ? row.category : "general",
      },
      locale,
    ),
  );
}
