"use server";

/**
 * Server Actions for the admin-managed homepage photo gallery (0118).
 *
 * Every mutation here re-checks requirePermission("homepage_photos", "write")
 * — the admin layout's role gate is a navigation guard, not an authorization
 * boundary, and a Server Action is a public HTTP endpoint. Reads use the
 * service client so the admin table can see hidden rows, which the RLS policy
 * ("active only") deliberately hides from anon.
 */

import { requirePermission } from "@/lib/auth/requireAdmin";
import { logAdminAction } from "@/app/actions/audit";
import { revalidateHomepagePhotos } from "@/lib/cache/revalidate";
import {
  storeHomepagePhoto,
  removeHomepagePhotoFile,
} from "@/lib/storage/homepage-photos";
import {
  isPhotoCategory,
  type HomepagePhoto,
  type PhotoMetadataInput,
} from "@/lib/types/homepage-photo";

export type ActionResult = { success: true } | { error: string };

const CAPTION_MAX = 200;
const ALT_MAX = 300;
/** One page of the admin grid. Above this the section needs pagination, and a
 *  homepage gallery with hundreds of photos is a content problem, not a UI one. */
const MAX_PHOTOS = 60;

const SELECT =
  "id, created_at, updated_at, storage_key, public_url, width, height, blur_data_url, " +
  "display_order, is_active, caption_km, caption_en, alt_text_km, alt_text_en, category, uploaded_by";

// ── Validation ───────────────────────────────────────────────────────────────

/** Trim → cap → null. Empty strings become null so the DB never stores "". */
function text(data: FormData, key: string, max: number): string | null {
  const value = (data.get(key) as string | null)?.trim() ?? "";
  return value ? value.slice(0, max) : null;
}

/**
 * Parse the metadata half of the form.
 *
 * Alt text is required in at least one language: this gallery exists to show
 * people, and an unlabelled photo of people is invisible to a screen-reader
 * user. The client form enforces it too — this is the check that actually
 * counts.
 */
function parseMetadata(data: FormData): PhotoMetadataInput | { error: string } {
  const rawCategory = (data.get("category") as string | null) ?? "general";
  if (!isPhotoCategory(rawCategory)) return { error: "Unknown category" };

  const alt_text_km = text(data, "alt_text_km", ALT_MAX);
  const alt_text_en = text(data, "alt_text_en", ALT_MAX);
  if (!alt_text_km && !alt_text_en) {
    return { error: "Alt text is required in at least one language" };
  }

  return {
    caption_km: text(data, "caption_km", CAPTION_MAX),
    caption_en: text(data, "caption_en", CAPTION_MAX),
    alt_text_km,
    alt_text_en,
    category: rawCategory,
  };
}

// ── Reads ────────────────────────────────────────────────────────────────────

/**
 * Every photo, hidden ones included — the admin grid.
 * Ordered exactly like the public gallery so what an editor drags is what a
 * visitor sees.
 */
export async function getAllPhotos(): Promise<HomepagePhoto[]> {
  const { supabase: db } = await requirePermission("homepage_photos", "read");
  const { data, error } = await db
    .from("homepage_photos")
    .select(SELECT)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(MAX_PHOTOS);

  if (error) {
    console.error("[homepage-photos] admin read failed:", error.message);
    return [];
  }
  return (data ?? []) as unknown as HomepagePhoto[];
}

// ── Mutations ────────────────────────────────────────────────────────────────

/**
 * Upload one photo and create its row.
 *
 * New photos land at the END of the order (max + 1) rather than the front:
 * the first three slots drive the hero mosaic, so silently promoting an
 * unreviewed upload into the site's most prominent image is the wrong default.
 */
export async function uploadPhoto(formData: FormData): Promise<ActionResult> {
  const { supabase: db, userId } = await requirePermission("homepage_photos", "write");

  const metadata = parseMetadata(formData);
  if ("error" in metadata) return metadata;

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "No file provided" };

  const { count } = await db
    .from("homepage_photos")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) >= MAX_PHOTOS) {
    return { error: `The gallery is full (${MAX_PHOTOS} photos). Delete one first.` };
  }

  const stored = await storeHomepagePhoto(file);
  if ("error" in stored) return stored;

  const { data: last } = await db
    .from("homepage_photos")
    .select("display_order")
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await db.from("homepage_photos").insert({
    storage_key: stored.storageKey,
    public_url: stored.publicUrl,
    width: stored.width,
    height: stored.height,
    blur_data_url: stored.blurDataUrl,
    display_order: (last?.display_order ?? -1) + 1,
    is_active: true,
    ...metadata,
    uploaded_by: userId,
  });

  if (error) {
    // The row is what makes the file reachable, so an insert failure means the
    // upload never happened as far as the site is concerned — take the orphan
    // back out of storage rather than leaving a file nothing references.
    await removeHomepagePhotoFile(stored.publicUrl);
    console.error("[homepage-photos] insert failed:", error.message);
    return { error: "Could not save the photo" };
  }

  await logAdminAction(userId, "homepage_photo_upload", "homepage_photos", stored.storageKey);
  revalidateHomepagePhotos();
  return { success: true };
}

/** Edit captions, alt text and category. Never touches the file or the order. */
export async function updatePhotoMetadata(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase: db, userId } = await requirePermission("homepage_photos", "write");

  const metadata = parseMetadata(formData);
  if ("error" in metadata) return metadata;

  const { error } = await db.from("homepage_photos").update(metadata).eq("id", id);
  if (error) {
    console.error("[homepage-photos] update failed:", error.message);
    return { error: "Could not save the changes" };
  }

  await logAdminAction(userId, "homepage_photo_update", "homepage_photos", id);
  revalidateHomepagePhotos();
  return { success: true };
}

/**
 * Persist a new order.
 *
 * Takes the full ordered id list and rewrites every row's `display_order` to
 * its index, rather than shuffling neighbours pairwise. That makes the write
 * idempotent and self-healing: whatever duplicate or gapped values the table
 * had before, one save leaves it dense and 0-based.
 *
 * Ids not present in the table are ignored; ids missing from the list keep
 * their old order and are pushed behind the reordered block on the next read.
 */
export async function updatePhotoOrder(photoIds: string[]): Promise<ActionResult> {
  const { supabase: db, userId } = await requirePermission("homepage_photos", "write");

  if (!Array.isArray(photoIds) || photoIds.length === 0) {
    return { error: "Nothing to reorder" };
  }
  if (photoIds.length > MAX_PHOTOS) return { error: "Too many photos" };

  const unique = [...new Set(photoIds.filter((id) => typeof id === "string" && id))];

  // Sequential, not Promise.all: PostgREST opens a connection per request and
  // 60 concurrent updates from one action is how a serverless function
  // exhausts the pooler. The list is short and this runs on an admin click.
  for (const [index, id] of unique.entries()) {
    const { error } = await db
      .from("homepage_photos")
      .update({ display_order: index })
      .eq("id", id);
    if (error) {
      console.error("[homepage-photos] reorder failed:", error.message);
      revalidateHomepagePhotos();
      return { error: "Could not save the new order" };
    }
  }

  await logAdminAction(userId, "homepage_photo_reorder", "homepage_photos", `${unique.length} photos`);
  revalidateHomepagePhotos();
  return { success: true };
}

/** Show / hide a photo without deleting it or losing its place in the order. */
export async function togglePhotoActive(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  const { supabase: db, userId } = await requirePermission("homepage_photos", "write");

  const { error } = await db
    .from("homepage_photos")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) {
    console.error("[homepage-photos] toggle failed:", error.message);
    return { error: "Could not change the visibility" };
  }

  await logAdminAction(
    userId,
    isActive ? "homepage_photo_show" : "homepage_photo_hide",
    "homepage_photos",
    id,
  );
  revalidateHomepagePhotos();
  return { success: true };
}

/**
 * Delete the row and its stored file.
 *
 * Row first, file second: a deleted row with a surviving file is an orphan an
 * admin can clear from /admin/storage, while a deleted file with a surviving
 * row is a broken image on the homepage. Only one of those is recoverable
 * without a deploy.
 */
export async function deletePhoto(id: string): Promise<ActionResult> {
  const { supabase: db, userId } = await requirePermission("homepage_photos", "write");

  const { data: photo } = await db
    .from("homepage_photos")
    .select("public_url, storage_key")
    .eq("id", id)
    .maybeSingle();

  if (!photo) return { error: "Photo not found" };

  const { error } = await db.from("homepage_photos").delete().eq("id", id);
  if (error) {
    console.error("[homepage-photos] delete failed:", error.message);
    return { error: "Could not delete the photo" };
  }

  await removeHomepagePhotoFile(photo.public_url);
  await logAdminAction(userId, "homepage_photo_delete", "homepage_photos", photo.storage_key);
  revalidateHomepagePhotos();
  return { success: true };
}
