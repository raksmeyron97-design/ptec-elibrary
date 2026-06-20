"use server";
// app/admin/catalogs/actions.ts
// Only the addCatalogBook action is changed — redirect now goes to the
// add-copies step so the admin can add physical copies immediately.
// All other actions (updateCatalogBook, deleteCatalogBook, etc.) remain unchanged.

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { catalogSlugify, pickCatalogColor, parseCatalogCsv } from "@/lib/catalog";
import { logAdminAction } from "@/app/actions/audit";

/** Parse comma-separated tag string from FormData into a clean string[] */
function parseTags(fd: FormData, field: "tags" | "keywords"): string[] {
  return (fd.get(field) as string ?? "")
    .split(",")
    .map(t => t.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function req(fd: FormData, key: string) {
  const v = fd.get(key);
  if (typeof v !== "string" || !v.trim()) throw new Error(`${key} is required`);
  return v.trim();
}
function opt(fd: FormData, key: string) {
  const v = fd.get(key)?.toString().trim();
  return v || null;
}

// ── addCatalogBook ─────────────────────────────────────────────────────────────
// After saving, redirects to /admin/catalogs/add-copies/[bookId]
// so the admin can immediately add physical copy records.
export async function addCatalogBook(formData: FormData) {
  const { supabase, userId } = await requireAdmin();

  const title    = req(formData, "title");
  const author   = req(formData, "author");
  const language = req(formData, "language");

  const description      = opt(formData, "description");
  const isbn             = opt(formData, "isbn");
  const cover_url        = opt(formData, "cover_url");
  const category         = opt(formData, "category");
  const department       = opt(formData, "department");
  const shelf_location   = opt(formData, "shelf_location");
  const accession_number = opt(formData, "accession_number");
  const year             = Number(formData.get("year")) || null;

  // Copies start at 0 — the trigger will update these as copies are added
  const slug        = catalogSlugify(title);
  const cover_color = pickCatalogColor(title);

  const { data: book, error } = await supabase
    .from("catalog_books")
    .insert({
      title, author, slug, language, description, isbn, cover_url, cover_color,
      category, department, shelf_location, accession_number, year,
      copies_total: 0, copies_available: 0,
      keywords: parseTags(formData, "keywords"),
      created_by: userId,
    })
    .select("id, slug, shelf_location, accession_number")
    .single();

  if (error) {
    if (error.code === "23505") return { success: false, error: "A book with this title already exists." };
    return { success: false, error: `Failed to add book: ${error.message}` };
  }

  await logAdminAction(userId, "addCatalogBook", "catalog_books", book.id, { title });

  revalidatePath("/catalogs");
  revalidatePath("/admin/catalogs");

  // ✅ Return success instead of redirecting
  return { success: true, book };
}

// ── updateCatalogBook ──────────────────────────────────────────────────────────
export async function updateCatalogBook(bookId: string, formData: FormData) {
  const { supabase, userId } = await requireAdmin();

  const title    = req(formData, "title");
  const author   = req(formData, "author");
  const language = req(formData, "language");

  const description      = opt(formData, "description");
  const isbn             = opt(formData, "isbn");
  const category         = opt(formData, "category");
  const department       = opt(formData, "department");
  const shelf_location   = opt(formData, "shelf_location");
  const accession_number = opt(formData, "accession_number");
  const year             = Number(formData.get("year")) || null;
  const copies_total     = Math.max(1, Number(formData.get("copies_total")) || 1);

  const coverRaw = formData.get("cover_url")?.toString().trim();
  const coverUpdate: Record<string, string | null> = {};
  if (coverRaw === "__remove__")         coverUpdate.cover_url = null;
  else if (coverRaw?.startsWith("http")) coverUpdate.cover_url = coverRaw;

  const { data: book, error } = await supabase
    .from("catalog_books")
    .update({
      title, author, language, description, isbn, category, department,
      shelf_location, accession_number, year, copies_total,
      keywords: parseTags(formData, "keywords"),
      ...coverUpdate,
    })
    .eq("id", bookId)
    .select("id, slug, shelf_location, accession_number")
    .single();

  if (error) {
    if (error.code === "23505") return { success: false, error: "A book with this title already exists." };
    return { success: false, error: `Update failed: ${error.message}` };
  }

  await logAdminAction(userId, "updateCatalogBook", "catalog_books", book.id, { title });

  revalidatePath("/catalogs");
  revalidatePath(`/catalogs/${book.slug}`);
  revalidatePath("/admin/catalogs");
  
  return { success: true, book };
}

// ── deleteCatalogBook ──────────────────────────────────────────────────────────
export async function deleteCatalogBook(bookId: string) {
  const { supabase, userId } = await requireAdmin();
  const { error } = await supabase
    .from("catalog_books")
    .update({ is_active: false })
    .eq("id", bookId);
  if (error) throw new Error(`Delete failed: ${error.message}`);
  await logAdminAction(userId, "deleteCatalogBook", "catalog_books", bookId);
  revalidatePath("/catalogs");
  revalidatePath("/admin/catalogs");
}

export async function hardDeleteCatalogBook(bookId: string) {
  const { supabase, userId } = await requireAdmin();
  const { error } = await supabase.from("catalog_books").delete().eq("id", bookId);
  if (error) throw new Error(`Hard delete failed: ${error.message}`);
  await logAdminAction(userId, "hardDeleteCatalogBook", "catalog_books", bookId);
  revalidatePath("/catalogs");
  revalidatePath("/admin/catalogs");
}

// ── adjustCopies ───────────────────────────────────────────────────────────────
export async function adjustCopies(
  bookId: string,
  action: "check_in" | "check_out" | "adjustment",
  delta: number,
  note?: string
) {
  const { supabase, userId } = await requireAdmin();
  const { data: book } = await supabase
    .from("catalog_books")
    .select("copies_available, copies_total")
    .eq("id", bookId)
    .single();
  if (!book) throw new Error("Book not found");
  const newAvailable = Math.min(book.copies_total, Math.max(0, book.copies_available + delta));
  const { error: updateErr } = await supabase
    .from("catalog_books")
    .update({ copies_available: newAvailable })
    .eq("id", bookId);
  if (updateErr) throw new Error(`Failed to update copies: ${updateErr.message}`);
  await supabase.from("catalog_copies_log").insert({
    catalog_book_id: bookId, admin_id: userId, action, delta, note: note || null,
  });
  revalidatePath("/catalogs");
  revalidatePath("/admin/catalogs");
}

export async function importCatalogCsv(formData: FormData) {
  const { supabase, userId } = await requireAdmin();
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

  for (const groupRows of bookGroups.values()) {
    const mainRow = groupRows[0];
    
    const baseSlug = catalogSlugify(mainRow.title);
    const suffix = mainRow.isbn?.trim() || catalogSlugify(mainRow.author);
    const slug = baseSlug
      ? (suffix ? `${baseSlug}-${catalogSlugify(suffix)}` : baseSlug)
      : `book-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Calculate total copies
    const providedCopiesTotal = mainRow.copies_total ? Number(mainRow.copies_total) : 0;
    
    // Find all unique barcodes in this group
    const barcodes = new Set<string>();
    for (const r of groupRows) {
      const bcode = r.barcode?.trim() || r.accession_number?.trim();
      if (bcode) barcodes.add(bcode);
    }
    
    const copiesCount = Math.max(providedCopiesTotal, barcodes.size, 1);

    const bookRecord = {
      title: mainRow.title,
      author: mainRow.author,
      slug,
      isbn: mainRow.isbn || null,
      year: mainRow.year ? Number(mainRow.year) : null,
      language: mainRow.language || "km",
      category: mainRow.category || null,
      department: mainRow.department || null,
      shelf_location: mainRow.shelf_location || null,
      copies_total: copiesCount,
      copies_available: copiesCount,
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
      console.error(`Error upserting book ${slug}:`, bookError);
      continue;
    }
    
    importedBooksCount++;

    // Insert copies for the barcodes found
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
        console.error(`Error inserting copies for book ${bookData.id}:`, copyError);
      }
    }
  }

  await logAdminAction(userId, "importCatalogCsv", "catalog_books", undefined, { count: importedBooksCount });
  revalidatePath("/catalogs");
  revalidatePath("/admin/catalogs");
  return { imported: importedBooksCount };
}
