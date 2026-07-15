"use server";
// app/admin/catalogs/actions.ts
// Server actions for the bibliographic record (catalog_books).
//
// Inventory data lives on catalog_copies (see copy-actions.ts). The
// copies_total / copies_available columns on catalog_books are derived — they
// are recomputed from copy rows, never accepted from a form.

import { revalidatePath } from "next/cache";
import { revalidateCatalogBook } from "@/lib/cache/revalidate";
import { requirePermission } from "@/lib/auth/requireAdmin";
import {
  catalogSlugify,
  pickCatalogColor,
  validateIsbn,
  validatePublicationYear,
  cleanText,
  cleanLongText,
} from "@/lib/catalog";
import { logAdminAction } from "@/app/actions/audit";
import { rateLimit } from "@/lib/rate-limit";
import {
  parseCoverInput,
  processCatalogCover,
  uploadCatalogCover,
  deleteCatalogCoverIfOwned,
  coverSourceFromUrl,
  type CoverInput,
} from "@/lib/catalog-cover";
import { zimaRelativePath } from "@/lib/zima";

export type BookActionResult =
  | { success: true; book: { id: string; slug: string; shelf_location: string | null; accession_number: string | null } }
  | { success: false; error: string; fieldErrors?: Record<string, string> };

/** Parse comma-separated tag string from FormData into a clean string[] */
function parseTags(fd: FormData, field: "tags" | "keywords"): string[] {
  return (fd.get(field) as string ?? "")
    .split(",")
    .map(t => t.trim())
    .filter(Boolean)
    .slice(0, 20);
}

const LANGUAGES = new Set(["km", "en", "fr", "zh", "other"]);

type ParsedBook =
  | { ok: true; fields: Record<string, unknown> }
  | { ok: false; error: string; fieldErrors: Record<string, string> };

/** Shared validation for add + update. Returns normalized column values. */
function parseBookForm(formData: FormData): ParsedBook {
  const fieldErrors: Record<string, string> = {};

  const title = cleanText(formData.get("title"), "title");
  if (!title.ok) fieldErrors.title = title.error;
  else if (!title.value) fieldErrors.title = "Title is required.";

  const author = cleanText(formData.get("author"), "author");
  if (!author.ok) fieldErrors.author = author.error;
  else if (!author.value) fieldErrors.author = "Author is required.";

  const languageRaw = formData.get("language")?.toString() ?? "";
  if (!LANGUAGES.has(languageRaw)) fieldErrors.language = "Choose a language from the list.";

  const isbn = validateIsbn(formData.get("isbn")?.toString());
  if (!isbn.ok) fieldErrors.isbn = isbn.error;

  const year = validatePublicationYear(formData.get("year")?.toString() || null);
  if (!year.ok) fieldErrors.year = year.error;

  const simple: Record<string, ReturnType<typeof cleanText>> = {
    publisher:        cleanText(formData.get("publisher"), "publisher"),
    category:         cleanText(formData.get("category"), "category"),
    department:       cleanText(formData.get("department"), "department"),
    shelf_location:   cleanText(formData.get("shelf_location"), "shelf_location"),
    accession_number: cleanText(formData.get("accession_number"), "accession_number"),
  };
  for (const [key, res] of Object.entries(simple)) {
    if (!res.ok) fieldErrors[key] = res.error;
  }

  const description = cleanLongText(formData.get("description"), "description");
  if (!description.ok) fieldErrors.description = description.error;

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: Object.values(fieldErrors)[0], fieldErrors };
  }

  const val = (k: keyof typeof simple) => (simple[k] as { ok: true; value: string | null }).value;
  return {
    ok: true,
    fields: {
      title: (title as { ok: true; value: string }).value,
      author: (author as { ok: true; value: string }).value,
      language: languageRaw,
      isbn: (isbn as { ok: true; normalized: string | null }).normalized,
      year: (year as { ok: true; year: number | null }).year,
      publisher: val("publisher"),
      category: val("category"),
      department: val("department"),
      shelf_location: val("shelf_location"),
      accession_number: val("accession_number"),
      description: (description as { ok: true; value: string | null }).value,
    },
  };
}

// ── Cover resolution ───────────────────────────────────────────────────────────
// Turns the form's cover intent (keep / upload / external / generated) into the
// concrete cover_url update. Uploads happen HERE, before the DB write, so a
// failed upload never leaves a half-saved record — the admin's form values stay
// on screen and they can retry or fall back to the generated cover.

type ResolvedCover =
  | { ok: true; input: CoverInput; update: { cover_url: string | null } | null; uploadedUrl: string | null }
  | { ok: false; error: string; fieldErrors: Record<string, string> };

const COVER_UPLOAD_LIMIT = 20;              // uploads…
const COVER_UPLOAD_WINDOW_MS = 10 * 60_000; // …per admin per 10 minutes

async function resolveCover(formData: FormData, userId: string): Promise<ResolvedCover> {
  const input = parseCoverInput(formData);

  if (input.mode === "invalid") {
    return { ok: false, error: input.error, fieldErrors: { cover: input.error } };
  }
  if (input.mode === "keep") return { ok: true, input, update: null, uploadedUrl: null };
  if (input.mode === "generated") return { ok: true, input, update: { cover_url: null }, uploadedUrl: null };
  if (input.mode === "external") return { ok: true, input, update: { cover_url: input.url }, uploadedUrl: null };

  // upload — validate, re-encode, push to Zima Storage.
  const limit = await rateLimit(`catalog-cover:${userId}`, COVER_UPLOAD_LIMIT, COVER_UPLOAD_WINDOW_MS);
  if (!limit.success) {
    const msg = "Too many cover uploads in a short time. Wait a few minutes and try again.";
    return { ok: false, error: msg, fieldErrors: { cover: msg } };
  }

  const processed = await processCatalogCover(await input.file.arrayBuffer(), input.file.name);
  if (!processed.ok) {
    return { ok: false, error: processed.error.message, fieldErrors: { cover: processed.error.message } };
  }

  try {
    const title = formData.get("title")?.toString() ?? "";
    const url = await uploadCatalogCover(processed.cover, title);
    return { ok: true, input, update: { cover_url: url }, uploadedUrl: url };
  } catch (err) {
    console.error("[catalog] cover upload failed:", err);
    const msg =
      "Your book information is still on this form, but the cover could not be uploaded to PTEC Storage. Retry the upload or save with an auto-generated cover.";
    return { ok: false, error: msg, fieldErrors: { cover: msg } };
  }
}

/** Audit payload for a cover change — sources + storage keys only, never credentials. */
function coverAudit(previousUrl: string | null, nextUrl: string | null) {
  const from = coverSourceFromUrl(previousUrl);
  const to = coverSourceFromUrl(nextUrl);
  return {
    from,
    to,
    previousKey: previousUrl ? zimaRelativePath(previousUrl) : null,
    newKey: nextUrl ? zimaRelativePath(nextUrl) : null,
  };
}

// ── addCatalogBook ─────────────────────────────────────────────────────────────
export async function addCatalogBook(formData: FormData): Promise<BookActionResult> {
  const { supabase, userId } = await requirePermission("books", "write");

  const parsed = parseBookForm(formData);
  if (!parsed.ok) return { success: false, error: parsed.error, fieldErrors: parsed.fieldErrors };

  // Cover is resolved (and, for uploads, pushed to Zima Storage) only after the
  // bibliographic fields validate — an invalid form never uploads anything.
  const cover = await resolveCover(formData, userId);
  if (!cover.ok) return { success: false, error: cover.error, fieldErrors: cover.fieldErrors };

  const baseSlug = catalogSlugify(parsed.fields.title as string) || `book-${Date.now().toString(36)}`;

  // Copies start at 0 — counters are derived from catalog_copies rows.
  const record = {
    ...parsed.fields,
    cover_url: cover.update?.cover_url ?? null,
    cover_color: pickCatalogColor(parsed.fields.title as string),
    copies_total: 0,
    copies_available: 0,
    keywords: parseTags(formData, "keywords"),
    created_by: userId,
  };

  // Slug collisions get a numeric suffix instead of a hard failure — two
  // physical books can legitimately share a title (different editions).
  let lastError: { code?: string; message: string } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
    const { data: book, error } = await supabase
      .from("catalog_books")
      .insert({ ...record, slug })
      .select("id, slug, shelf_location, accession_number")
      .single();

    if (!error && book) {
      await logAdminAction(userId, "addCatalogBook", "catalog_books", book.id, {
        title: parsed.fields.title,
        cover: coverAudit(null, record.cover_url),
      });
      revalidateCatalogBook(book.slug);
      revalidatePath("/admin/catalogs");
      return { success: true, book };
    }
    lastError = error;
    if (error?.code !== "23505") break;
  }

  // The insert failed after a successful upload — remove the orphan.
  if (cover.uploadedUrl) await deleteCatalogCoverIfOwned(cover.uploadedUrl);
  return { success: false, error: `Failed to add book: ${lastError?.message ?? "unknown error"}` };
}

// ── updateCatalogBook ──────────────────────────────────────────────────────────
export async function updateCatalogBook(bookId: string, formData: FormData): Promise<BookActionResult> {
  const { supabase, userId } = await requirePermission("books", "write");

  const parsed = parseBookForm(formData);
  if (!parsed.ok) return { success: false, error: parsed.error, fieldErrors: parsed.fieldErrors };

  const cover = await resolveCover(formData, userId);
  if (!cover.ok) return { success: false, error: cover.error, fieldErrors: cover.fieldErrors };

  // Current cover, read BEFORE the update: the replaced storage object is
  // deleted only after the DB write succeeds, and only if it belonged to this
  // record (it came from this row) and lives under catalog-covers/.
  let previousCoverUrl: string | null = null;
  if (cover.update) {
    const { data: current, error: readError } = await supabase
      .from("catalog_books")
      .select("cover_url")
      .eq("id", bookId)
      .single();
    if (readError) {
      if (cover.uploadedUrl) await deleteCatalogCoverIfOwned(cover.uploadedUrl);
      return { success: false, error: `Update failed: ${readError.message}` };
    }
    previousCoverUrl = current?.cover_url ?? null;
  }

  // NOTE: copies_total / copies_available deliberately absent — derived data.
  const { data: book, error } = await supabase
    .from("catalog_books")
    .update({
      ...parsed.fields,
      keywords: parseTags(formData, "keywords"),
      ...(cover.update ?? {}),
    })
    .eq("id", bookId)
    .select("id, slug, shelf_location, accession_number")
    .single();

  if (error) {
    // Never orphan a fresh upload when the save it belonged to failed.
    if (cover.uploadedUrl) await deleteCatalogCoverIfOwned(cover.uploadedUrl);
    if (error.code === "23505") return { success: false, error: "Another book already uses this slug." };
    return { success: false, error: `Update failed: ${error.message}` };
  }

  await logAdminAction(userId, "updateCatalogBook", "catalog_books", book.id, {
    title: parsed.fields.title,
    ...(cover.update ? { cover: coverAudit(previousCoverUrl, cover.update.cover_url) } : {}),
  });
  revalidateCatalogBook(book.slug);
  revalidatePath("/admin/catalogs");

  // DB now points at the new cover — the old storage object (if ours) can go.
  // Failure here is logged and swallowed: the save itself already succeeded.
  if (cover.update && previousCoverUrl && previousCoverUrl !== cover.update.cover_url) {
    await deleteCatalogCoverIfOwned(previousCoverUrl);
  }

  return { success: true, book };
}

// ── deleteCatalogBook (soft — hides from the public catalog) ──────────────────
export async function deleteCatalogBook(bookId: string) {
  const { supabase, userId } = await requirePermission("books", "write");
  const { data: book, error } = await supabase
    .from("catalog_books")
    .update({ is_active: false })
    .eq("id", bookId)
    .select("slug")
    .single();
  if (error) throw new Error(`Delete failed: ${error.message}`);
  await logAdminAction(userId, "deleteCatalogBook", "catalog_books", bookId);
  revalidateCatalogBook(book?.slug);
  revalidatePath("/admin/catalogs");
}

/** Restore a soft-deleted record to the public catalog. */
export async function restoreCatalogBook(bookId: string) {
  const { supabase, userId } = await requirePermission("books", "write");
  const { data: book, error } = await supabase
    .from("catalog_books")
    .update({ is_active: true })
    .eq("id", bookId)
    .select("slug")
    .single();
  if (error) throw new Error(`Restore failed: ${error.message}`);
  await logAdminAction(userId, "restoreCatalogBook", "catalog_books", bookId);
  revalidateCatalogBook(book?.slug);
  revalidatePath("/admin/catalogs");
}

export async function hardDeleteCatalogBook(bookId: string) {
  const { supabase, userId } = await requirePermission("books", "write");
  const { data: book } = await supabase
    .from("catalog_books").select("slug, title, cover_url").eq("id", bookId).single();
  const { error } = await supabase.from("catalog_books").delete().eq("id", bookId);
  if (error) throw new Error(`Hard delete failed: ${error.message}`);
  // The record is gone — its uploaded cover (if ours) must not orphan in storage.
  await deleteCatalogCoverIfOwned(book?.cover_url);
  await logAdminAction(userId, "hardDeleteCatalogBook", "catalog_books", bookId, { title: book?.title });
  revalidateCatalogBook(book?.slug);
  revalidatePath("/admin/catalogs");
}

// ── importCatalogCsv ───────────────────────────────────────────────────────────
// Removed: superseded by the CSV import wizard (import-actions.ts), which
// re-validates every row server-side, supports duplicate strategies, batching,
// per-row results and import jobs. See app/(admin)/admin/(protected)/catalogs/import/.
