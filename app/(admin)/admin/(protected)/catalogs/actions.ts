"use server";
// app/admin/catalogs/actions.ts

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { catalogSlugify, pickCatalogColor, parseCatalogCsv } from "@/lib/catalog";
import { logAdminAction } from "@/app/actions/audit";

// ── Auth guard ─────────────────────────────────────────────────────────────────
async function requireAdmin() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const supabase = createServiceClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") throw new Error("Forbidden");

  return { supabase, userId: user.id };
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
export async function addCatalogBook(formData: FormData) {
  const { supabase, userId } = await requireAdmin();

  const title     = req(formData, "title");
  const author    = req(formData, "author");
  const language  = req(formData, "language");

  const description      = opt(formData, "description");
  const isbn             = opt(formData, "isbn");
  const cover_url        = opt(formData, "cover_url");
  const category         = opt(formData, "category");
  const department       = opt(formData, "department");
  const shelf_location   = opt(formData, "shelf_location");
  const accession_number = opt(formData, "accession_number");

  const year             = Number(formData.get("year"))           || null;
  const copies_total     = Math.max(1, Number(formData.get("copies_total")) || 1);
  const copies_available = Math.min(copies_total, Math.max(0, Number(formData.get("copies_available")) || copies_total));

  const slug        = catalogSlugify(title);
  const cover_color = pickCatalogColor(title);

  const { data: book, error } = await supabase
    .from("catalog_books")
    .insert({
      title, author, slug, language, description, isbn, cover_url, cover_color,
      category, department, shelf_location, accession_number,
      year, copies_total, copies_available,
      created_by: userId,
    })
    .select("id, slug")
    .single();

  if (error) {
    if (error.code === "23505") throw new Error("A book with this title already exists.");
    throw new Error(`Failed to add book: ${error.message}`);
  }

  await logAdminAction(userId, "addCatalogBook", "catalog_books", book.id, { title });

  revalidatePath("/catalogs");
  revalidatePath("/admin/catalogs");
  redirect(`/catalogs/${book.slug}`);
}

// ── updateCatalogBook ──────────────────────────────────────────────────────────
export async function updateCatalogBook(bookId: string, formData: FormData) {
  const { supabase, userId } = await requireAdmin();

  const title     = req(formData, "title");
  const author    = req(formData, "author");
  const language  = req(formData, "language");

  const description      = opt(formData, "description");
  const isbn             = opt(formData, "isbn");
  const category         = opt(formData, "category");
  const department       = opt(formData, "department");
  const shelf_location   = opt(formData, "shelf_location");
  const accession_number = opt(formData, "accession_number");

  const year         = Number(formData.get("year"))       || null;
  const copies_total = Math.max(1, Number(formData.get("copies_total")) || 1);

  // cover_url: "__remove__" clears it, new URL updates it, blank = keep existing
  const coverRaw = formData.get("cover_url")?.toString().trim();
  const coverUpdate: Record<string, string | null> = {};
  if (coverRaw === "__remove__")             coverUpdate.cover_url = null;
  else if (coverRaw?.startsWith("http"))     coverUpdate.cover_url = coverRaw;

  const { data: book, error } = await supabase
    .from("catalog_books")
    .update({
      title, author, language, description, isbn, category, department,
      shelf_location, accession_number, year, copies_total,
      ...coverUpdate,
    })
    .eq("id", bookId)
    .select("id, slug")
    .single();

  if (error) throw new Error(`Update failed: ${error.message}`);

  await logAdminAction(userId, "updateCatalogBook", "catalog_books", book.id, { title });

  revalidatePath("/catalogs");
  revalidatePath(`/catalogs/${book.slug}`);
  revalidatePath("/admin/catalogs");
  redirect(`/catalogs/${book.slug}`);
}

// ── deleteCatalogBook ──────────────────────────────────────────────────────────
export async function deleteCatalogBook(bookId: string) {
  const { supabase, userId } = await requireAdmin();

  // Soft-delete (keeps history) — or use hard delete if preferred
  const { error } = await supabase
    .from("catalog_books")
    .update({ is_active: false })
    .eq("id", bookId);

  if (error) throw new Error(`Delete failed: ${error.message}`);

  await logAdminAction(userId, "deleteCatalogBook", "catalog_books", bookId);

  revalidatePath("/catalogs");
  revalidatePath("/admin/catalogs");
}

// Hard delete variant (used from manage table)
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

  // Fetch current
  const { data: book } = await supabase
    .from("catalog_books")
    .select("copies_available, copies_total")
    .eq("id", bookId)
    .single();

  if (!book) throw new Error("Book not found");

  const newAvailable = Math.min(
    book.copies_total,
    Math.max(0, book.copies_available + delta)
  );

  // Update available count
  const { error: updateErr } = await supabase
    .from("catalog_books")
    .update({ copies_available: newAvailable })
    .eq("id", bookId);

  if (updateErr) throw new Error(`Failed to update copies: ${updateErr.message}`);

  // Log the action
  await supabase.from("catalog_copies_log").insert({
    catalog_book_id: bookId,
    admin_id: userId,
    action,
    delta,
    note: note || null,
  });

  revalidatePath("/catalogs");
  revalidatePath("/admin/catalogs");
}

// ── importCatalogCsv ───────────────────────────────────────────────────────────
export async function importCatalogCsv(formData: FormData) {
  const { supabase, userId } = await requireAdmin();

  const csvText = formData.get("csv_text")?.toString();
  if (!csvText) throw new Error("No CSV data provided");

  const rows = parseCatalogCsv(csvText);
  if (rows.length === 0) throw new Error("No valid rows found in CSV");

  const records = rows.map((r) => {
    // Build a unique, stable slug.
    // Pure Khmer / non-latin titles often slugify to an empty string, so we
    // append the accession_number (or isbn) as a suffix to guarantee uniqueness.
    const baseSlug = catalogSlugify(r.title);
    const suffix   = r.accession_number?.trim() || r.isbn?.trim() || null;
    const slug     = baseSlug
      ? (suffix ? `${baseSlug}-${catalogSlugify(suffix)}` : baseSlug)
      : suffix
        ? catalogSlugify(suffix)
        : `book-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    return {
      title:            r.title,
      author:           r.author,
      slug,
      isbn:             r.isbn             || null,
      year:             r.year             ? Number(r.year) : null,
      language:         r.language         || "km",
      category:         r.category         || null,
      department:       r.department       || null,
      shelf_location:   r.shelf_location   || null,
      copies_total:     r.copies_total     ? Number(r.copies_total) : 1,
      copies_available: r.copies_total     ? Number(r.copies_total) : 1,
      description:      r.description      || null,
      accession_number: r.accession_number || null,
      // ✅ Fix 1: cover_url was missing from the original mapping
      cover_url:        r.cover_url        || null,
      cover_color:      pickCatalogColor(r.title),
      created_by:       userId,
    };
  });

  // ✅ Fix 2: deduplicate by slug so Postgres never sees the same conflict key
  // twice in one batch — prevents "cannot affect row a second time" error.
  const seen = new Map<string, (typeof records)[number]>();
  for (const rec of records) seen.set(rec.slug, rec); // last occurrence wins
  const deduped = [...seen.values()];

  // Upsert by slug (idempotent re-import)
  const { data, error } = await supabase
    .from("catalog_books")
    .upsert(deduped, { onConflict: "slug", ignoreDuplicates: false })
    .select("id");

  if (error) throw new Error(`CSV import failed: ${error.message}`);

  await logAdminAction(userId, "importCatalogCsv", "catalog_books", undefined, { count: data?.length ?? 0 });

  revalidatePath("/catalogs");
  revalidatePath("/admin/catalogs");

  return { imported: data?.length ?? 0 };
}