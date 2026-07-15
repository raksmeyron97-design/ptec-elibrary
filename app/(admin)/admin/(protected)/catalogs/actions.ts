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
  parseCatalogCsv,
  validateIsbn,
  validatePublicationYear,
  cleanText,
  cleanLongText,
  computeCopyStats,
} from "@/lib/catalog";
import { logAdminAction } from "@/app/actions/audit";

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

function parseCoverUrl(formData: FormData): { set: boolean; value: string | null } {
  const raw = formData.get("cover_url")?.toString().trim();
  if (!raw) return { set: false, value: null };
  if (raw === "__remove__") return { set: true, value: null };
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return { set: false, value: null };
    return { set: true, value: u.toString() };
  } catch {
    return { set: false, value: null };
  }
}

// ── addCatalogBook ─────────────────────────────────────────────────────────────
export async function addCatalogBook(formData: FormData): Promise<BookActionResult> {
  const { supabase, userId } = await requirePermission("books", "write");

  const parsed = parseBookForm(formData);
  if (!parsed.ok) return { success: false, error: parsed.error, fieldErrors: parsed.fieldErrors };

  const cover = parseCoverUrl(formData);
  const baseSlug = catalogSlugify(parsed.fields.title as string) || `book-${Date.now().toString(36)}`;

  // Copies start at 0 — counters are derived from catalog_copies rows.
  const record = {
    ...parsed.fields,
    cover_url: cover.set ? cover.value : null,
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
      await logAdminAction(userId, "addCatalogBook", "catalog_books", book.id, { title: parsed.fields.title });
      revalidateCatalogBook(book.slug);
      revalidatePath("/admin/catalogs");
      return { success: true, book };
    }
    lastError = error;
    if (error?.code !== "23505") break;
  }
  return { success: false, error: `Failed to add book: ${lastError?.message ?? "unknown error"}` };
}

// ── updateCatalogBook ──────────────────────────────────────────────────────────
export async function updateCatalogBook(bookId: string, formData: FormData): Promise<BookActionResult> {
  const { supabase, userId } = await requirePermission("books", "write");

  const parsed = parseBookForm(formData);
  if (!parsed.ok) return { success: false, error: parsed.error, fieldErrors: parsed.fieldErrors };

  const cover = parseCoverUrl(formData);
  const coverUpdate: Record<string, string | null> = cover.set ? { cover_url: cover.value } : {};

  // NOTE: copies_total / copies_available deliberately absent — derived data.
  const { data: book, error } = await supabase
    .from("catalog_books")
    .update({
      ...parsed.fields,
      keywords: parseTags(formData, "keywords"),
      ...coverUpdate,
    })
    .eq("id", bookId)
    .select("id, slug, shelf_location, accession_number")
    .single();

  if (error) {
    if (error.code === "23505") return { success: false, error: "Another book already uses this slug." };
    return { success: false, error: `Update failed: ${error.message}` };
  }

  await logAdminAction(userId, "updateCatalogBook", "catalog_books", book.id, { title: parsed.fields.title });
  revalidateCatalogBook(book.slug);
  revalidatePath("/admin/catalogs");

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
    .from("catalog_books").select("slug, title").eq("id", bookId).single();
  const { error } = await supabase.from("catalog_books").delete().eq("id", bookId);
  if (error) throw new Error(`Hard delete failed: ${error.message}`);
  await logAdminAction(userId, "hardDeleteCatalogBook", "catalog_books", bookId, { title: book?.title });
  revalidateCatalogBook(book?.slug);
  revalidatePath("/admin/catalogs");
}

// ── importCatalogCsv ───────────────────────────────────────────────────────────
export async function importCatalogCsv(formData: FormData) {
  const { supabase, userId } = await requirePermission("books", "write");
  const csvText = formData.get("csv_text")?.toString();
  if (!csvText) throw new Error("No CSV data provided");
  const rows = parseCatalogCsv(csvText);
  if (rows.length === 0) throw new Error("No valid rows found in CSV");

  // Group rows by book (title + author)
  const bookGroups = new Map<string, typeof rows>();
  for (const r of rows) {
    const groupKey = `${r.title.toLowerCase().trim()}|${r.author.toLowerCase().trim()}`;
    if (!bookGroups.has(groupKey)) {
      bookGroups.set(groupKey, []);
    }
    bookGroups.get(groupKey)!.push(r);
  }

  let importedBooksCount = 0;
  const problems: string[] = [];

  for (const groupRows of bookGroups.values()) {
    const mainRow = groupRows[0];

    // Validate the fields that have hard rules; skip bad rows with a report
    // instead of silently importing garbage.
    const isbn = validateIsbn(mainRow.isbn);
    if (!isbn.ok) { problems.push(`"${mainRow.title}": ${isbn.error}`); continue; }
    const year = validatePublicationYear(mainRow.year || null);
    if (!year.ok) { problems.push(`"${mainRow.title}": ${year.error}`); continue; }

    const baseSlug = catalogSlugify(mainRow.title);
    const suffix = isbn.normalized || catalogSlugify(mainRow.author);
    const slug = baseSlug
      ? (suffix ? `${baseSlug}-${catalogSlugify(suffix)}` : baseSlug)
      : `book-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Every unique barcode in the group becomes one physical copy.
    const barcodes = new Set<string>();
    for (const r of groupRows) {
      const bcode = r.barcode?.trim() || r.accession_number?.trim();
      if (bcode) barcodes.add(bcode);
    }

    const bookRecord = {
      title: mainRow.title,
      author: mainRow.author,
      slug,
      isbn: isbn.normalized,
      publisher: mainRow.publisher || null,
      year: year.year,
      language: mainRow.language || "km",
      category: mainRow.category || null,
      department: mainRow.department || null,
      shelf_location: mainRow.shelf_location || null,
      // Derived — recounted from copies after the copy insert below.
      copies_total: 0,
      copies_available: 0,
      description: mainRow.description || null,
      accession_number: mainRow.accession_number || null,
      cover_url: mainRow.cover_url || null,
      cover_color: pickCatalogColor(mainRow.title),
      keywords: mainRow.keywords ? mainRow.keywords.split(",").map(k => k.trim()).filter(Boolean) : [],
      created_by: userId,
    };

    const { data: bookData, error: bookError } = await supabase
      .from("catalog_books")
      .upsert(bookRecord, { onConflict: "slug", ignoreDuplicates: false })
      .select("id")
      .single();

    if (bookError || !bookData) {
      problems.push(`"${mainRow.title}": ${bookError?.message ?? "insert failed"}`);
      continue;
    }

    importedBooksCount++;

    const copyRecords = Array.from(barcodes).map((bcode) => ({
      catalog_book_id: bookData.id,
      barcode: bcode,
      call_number: null,
      shelf_location: mainRow.shelf_location || null,
      holding_library: "PTEC Library",
      status: "available",
    }));

    if (copyRecords.length > 0) {
      const { error: copyError } = await supabase
        .from("catalog_copies")
        .upsert(copyRecords, { onConflict: "barcode", ignoreDuplicates: true });
      if (copyError) {
        problems.push(`"${mainRow.title}" copies: ${copyError.message}`);
      }
    }

    // Recount the derived counters from the actual copy rows.
    const { data: liveCopies } = await supabase
      .from("catalog_copies").select("status").eq("catalog_book_id", bookData.id);
    const stats = computeCopyStats(liveCopies ?? []);
    await supabase
      .from("catalog_books")
      .update({ copies_total: stats.total, copies_available: stats.available })
      .eq("id", bookData.id);
  }

  await logAdminAction(userId, "importCatalogCsv", "catalog_books", undefined, {
    count: importedBooksCount, problems: problems.slice(0, 10),
  });
  revalidateCatalogBook();
  revalidatePath("/admin/catalogs");
  return { imported: importedBooksCount, problems };
}
