"use server";
// app/admin/catalogs/copy-actions.ts
// Server actions for managing individual physical copy records.

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { logAdminAction } from "@/app/actions/audit";

// ── Types ──────────────────────────────────────────────────────────────────────
export type CopyStatus = "available" | "checked_out" | "lost" | "damaged" | "on_order";

export interface CatalogCopy {
  id: string;
  catalog_book_id: string;
  barcode: string | null;
  call_number: string | null;
  shelf_location: string | null;
  holding_library: string;
  status: CopyStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ── fetchCopiesForBook ─────────────────────────────────────────────────────────
export async function fetchCopiesForBook(bookId: string): Promise<CatalogCopy[]> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("catalog_copies")
    .select("*")
    .eq("catalog_book_id", bookId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to fetch copies: ${error.message}`);
  return (data ?? []) as CatalogCopy[];
}

// ── addCopy ────────────────────────────────────────────────────────────────────
export async function addCopy(bookId: string, formData: FormData) {
  const { supabase, userId } = await requireAdmin();

  const barcode         = formData.get("barcode")?.toString().trim()         || null;
  const call_number     = formData.get("call_number")?.toString().trim()     || null;
  const shelf_location  = formData.get("shelf_location")?.toString().trim()  || null;
  const holding_library = formData.get("holding_library")?.toString().trim() || "PTEC Library";
  const status          = (formData.get("status")?.toString() ?? "available") as CopyStatus;
  const notes           = formData.get("notes")?.toString().trim()           || null;

  const { data, error } = await supabase
    .from("catalog_copies")
    .insert({ catalog_book_id: bookId, barcode, call_number, shelf_location, holding_library, status, notes })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") throw new Error("A copy with this barcode already exists.");
    throw new Error(`Failed to add copy: ${error.message}`);
  }

  await logAdminAction(userId, "addCatalogCopy", "catalog_copies", data.id, { bookId, barcode });

  revalidatePath("/catalogs");
  revalidatePath(`/catalogs`);
  revalidatePath("/admin/catalogs");
}

// ── updateCopyStatus ───────────────────────────────────────────────────────────
export async function updateCopyStatus(copyId: string, status: CopyStatus, note?: string) {
  const { supabase, userId } = await requireAdmin();

  const { error } = await supabase
    .from("catalog_copies")
    .update({ status, notes: note ?? null })
    .eq("id", copyId);

  if (error) throw new Error(`Failed to update copy: ${error.message}`);

  await logAdminAction(userId, "updateCopyStatus", "catalog_copies", copyId, { status });

  revalidatePath("/catalogs");
  revalidatePath("/admin/catalogs");
}

// ── updateCopy (full edit) ─────────────────────────────────────────────────────
export async function updateCopy(copyId: string, formData: FormData) {
  const { supabase, userId } = await requireAdmin();

  const barcode         = formData.get("barcode")?.toString().trim()         || null;
  const call_number     = formData.get("call_number")?.toString().trim()     || null;
  const shelf_location  = formData.get("shelf_location")?.toString().trim()  || null;
  const holding_library = formData.get("holding_library")?.toString().trim() || "PTEC Library";
  const status          = (formData.get("status")?.toString() ?? "available") as CopyStatus;
  const notes           = formData.get("notes")?.toString().trim()           || null;

  const { error } = await supabase
    .from("catalog_copies")
    .update({ barcode, call_number, shelf_location, holding_library, status, notes })
    .eq("id", copyId);

  if (error) {
    if (error.code === "23505") throw new Error("Barcode already used by another copy.");
    throw new Error(`Failed to update copy: ${error.message}`);
  }

  await logAdminAction(userId, "updateCatalogCopy", "catalog_copies", copyId, { status });

  revalidatePath("/catalogs");
  revalidatePath("/admin/catalogs");
}

// ── deleteCopy ─────────────────────────────────────────────────────────────────
export async function deleteCopy(copyId: string) {
  const { supabase, userId } = await requireAdmin();

  const { error } = await supabase
    .from("catalog_copies")
    .delete()
    .eq("id", copyId);

  if (error) throw new Error(`Failed to delete copy: ${error.message}`);

  await logAdminAction(userId, "deleteCatalogCopy", "catalog_copies", copyId);

  revalidatePath("/catalogs");
  revalidatePath("/admin/catalogs");
}

// ── bulkAddCopies ──────────────────────────────────────────────────────────────
// Adds N copies at once; barcodes provided as newline-separated list.
export async function bulkAddCopies(
  bookId: string,
  barcodes: string[],
  defaults: { call_number?: string; shelf_location?: string; holding_library?: string }
) {
  const { supabase, userId } = await requireAdmin();

  const records = barcodes
    .map((b) => b.trim())
    .filter(Boolean)
    .map((barcode) => ({
      catalog_book_id: bookId,
      barcode,
      call_number:     defaults.call_number     || null,
      shelf_location:  defaults.shelf_location  || null,
      holding_library: defaults.holding_library || "PTEC Library",
      status:          "available" as CopyStatus,
    }));

  if (records.length === 0) throw new Error("No barcodes provided");

  const { data, error } = await supabase
    .from("catalog_copies")
    .upsert(records, { onConflict: "barcode", ignoreDuplicates: true })
    .select("id");

  if (error) throw new Error(`Bulk add failed: ${error.message}`);

  await logAdminAction(userId, "bulkAddCatalogCopies", "catalog_copies", undefined, {
    bookId,
    count: data?.length ?? 0,
  });

  revalidatePath("/catalogs");
  revalidatePath("/admin/catalogs");

  return { added: data?.length ?? 0 };
}
