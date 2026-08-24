/**
 * Shared shape for the admin-managed homepage photo gallery
 * (migration 0118). Pure types + the category vocabulary — no server imports,
 * so client components can use it directly.
 */

export const PHOTO_CATEGORIES = [
  "general",
  "ptec-library",
  "o-bek-kaom",
  "events",
] as const;

export type PhotoCategory = (typeof PHOTO_CATEGORIES)[number];

/** Row shape as stored, used by the admin surfaces. */
export interface HomepagePhoto {
  id: string;
  created_at: string;
  updated_at: string;
  storage_key: string;
  public_url: string;
  width: number | null;
  height: number | null;
  blur_data_url: string | null;
  display_order: number;
  is_active: boolean;
  caption_km: string | null;
  caption_en: string | null;
  alt_text_km: string | null;
  alt_text_en: string | null;
  category: PhotoCategory;
  uploaded_by: string | null;
}

/**
 * What the PUBLIC gallery renders. Deliberately narrower than the row: it is
 * serialized into the prerendered homepage payload, and the uploader id,
 * timestamps and storage key have no business travelling to a visitor.
 */
export interface PublicHomepagePhoto {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  blurDataUrl: string | null;
  caption: string | null;
  alt: string;
  category: PhotoCategory;
}

/** Editable metadata — the write half of the row, minus storage/order fields. */
export interface PhotoMetadataInput {
  caption_km: string | null;
  caption_en: string | null;
  alt_text_km: string | null;
  alt_text_en: string | null;
  category: PhotoCategory;
}

export function isPhotoCategory(value: unknown): value is PhotoCategory {
  return typeof value === "string" && (PHOTO_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Resolve the caption/alt pair for a locale with a fallback to the other
 * language. Alt text carries meaning for a screen reader, so an empty string
 * is only ever correct for a genuinely decorative image — the admin form
 * requires at least one alt language, and this picks whichever exists.
 *
 * Pure and locale-agnostic so both the public gallery and the admin preview
 * resolve text identically.
 */
export function localizePhoto(
  photo: Pick<
    HomepagePhoto,
    "id" | "public_url" | "width" | "height" | "blur_data_url" | "category" |
    "caption_km" | "caption_en" | "alt_text_km" | "alt_text_en"
  >,
  locale: string,
): PublicHomepagePhoto {
  const km = locale === "km";
  const pick = (kmValue: string | null, enValue: string | null) =>
    (km ? kmValue || enValue : enValue || kmValue) || null;

  return {
    id: photo.id,
    url: photo.public_url,
    width: photo.width,
    height: photo.height,
    blurDataUrl: photo.blur_data_url,
    caption: pick(photo.caption_km, photo.caption_en),
    alt: pick(photo.alt_text_km, photo.alt_text_en) ?? "",
    category: photo.category,
  };
}
