"use server";
// app/admin/catalogs/copy-actions.ts
// Server actions for managing individual physical copy records.
//
// Invariants enforced here (and, after migration 0095, also by the DB):
//   • copy statuses come from COPY_STATUS_VALUES (lib/catalog.ts);
//   • barcodes / accession numbers are unique among live (non-withdrawn) copies;
//   • catalog_books.copies_total / copies_available are recomputed from copy
//     rows after every mutation — they are never accepted from a form;
//   • bulk creation is a single INSERT: either every copy is created or none.

import { revalidateCatalogBook } from "@/lib/cache/revalidate";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/requireAdmin";
import { logAdminAction } from "@/app/actions/audit";
import {
  type CopyStatus,
  type GeneratedCopy,
  COPY_STATUS_VALUES,
  normalizeCopyStatus,
  computeCopyStats,
  validateBarcode,
  cleanText,
  findInternalDuplicates,
} from "@/lib/catalog";

// ── Types ──────────────────────────────────────────────────────────────────────

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
  // Added by migration 0095 — may be absent (undefined) until it is applied.
  copy_number?: number | null;
  accession_number?: string | null;
  condition?: string | null;
}

export type CopyActionResult =
  | { success: true; message?: string; added?: number }
  | { success: false; error: string };

type ServiceClient = Awaited<ReturnType<typeof requirePermission>>["supabase"];

// Columns that only exist after migration 0095. Writes retry without them when
// PostgREST reports an unknown column (PGRST204). Remove after 0095 is applied.
const POST_0095_COLUMNS = ["copy_number", "accession_number", "condition"] as const;

function stripPost0095<T extends Record<string, unknown>>(row: T): T {
  const clone = { ...row };
  for (const col of POST_0095_COLUMNS) delete clone[col];
  return clone;
}

function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  // PGRST204: column not found in schema cache (INSERT/UPDATE); 42703: SQL-level unknown column.
  return error.code === "PGRST204" || error.code === "42703";
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

/** Recompute the derived counters on catalog_books from live copy rows. */
async function recountBook(supabase: ServiceClient, bookId: string): Promise<{ slug: string | null }> {
  const [{ data: copies }, { data: book }] = await Promise.all([
    supabase.from("catalog_copies").select("status").eq("catalog_book_id", bookId),
    supabase.from("catalog_books").select("slug").eq("id", bookId).single(),
  ]);
  const stats = computeCopyStats(copies ?? []);
  await supabase
    .from("catalog_books")
    .update({ copies_total: stats.total, copies_available: stats.available })
    .eq("id", bookId);
  return { slug: book?.slug ?? null };
}

async function refreshCaches(supabase: ServiceClient, bookId: string) {
  const { slug } = await recountBook(supabase, bookId);
  revalidateCatalogBook(slug);
  revalidatePath("/admin/catalogs");
}

function parseStatus(raw: FormDataEntryValue | null): CopyStatus {
  const s = raw?.toString() ?? "available";
  return (COPY_STATUS_VALUES as readonly string[]).includes(s) ? (s as CopyStatus) : normalizeCopyStatus(s);
}

type ParsedCopyForm =
  | { ok: true; row: Record<string, unknown>; barcode: string | null; accession: string | null }
  | { ok: false; error: string };

function parseCopyForm(formData: FormData): ParsedCopyForm {
  const barcodeRes = validateBarcode(formData.get("barcode")?.toString());
  if (!barcodeRes.ok) return { ok: false, error: barcodeRes.error };

  const fields = {
    call_number:      cleanText(formData.get("call_number"), "call_number"),
    shelf_location:   cleanText(formData.get("shelf_location"), "shelf_location"),
    holding_library:  cleanText(formData.get("holding_library"), "holding_library"),
    notes:            cleanText(formData.get("notes"), "notes"),
    accession_number: cleanText(formData.get("accession_number"), "accession_number"),
    condition:        cleanText(formData.get("condition"), "condition"),
  };
  for (const res of Object.values(fields)) {
    if (!res.ok) return { ok: false, error: res.error };
  }
  const v = (k: keyof typeof fields) => (fields[k] as { ok: true; value: string | null }).value;

  const copyNumberRaw = formData.get("copy_number")?.toString().trim();
  const copyNumber = copyNumberRaw ? Number(copyNumberRaw) : null;
  if (copyNumber !== null && (!Number.isInteger(copyNumber) || copyNumber < 1 || copyNumber > 9999)) {
    return { ok: false, error: "Copy number must be a whole number between 1 and 9999." };
  }

  return {
    ok: true,
    barcode: barcodeRes.barcode,
    accession: v("accession_number"),
    row: {
      barcode: barcodeRes.barcode,
      call_number: v("call_number"),
      shelf_location: v("shelf_location"),
      holding_library: v("holding_library") ?? "PTEC Library",
      status: parseStatus(formData.get("status")),
      notes: v("notes"),
      accession_number: v("accession_number"),
      condition: v("condition"),
      copy_number: copyNumber,
    },
  };
}

/**
 * Reject values already used by live copies of ANY book (barcodes are
 * library-wide). `excludeCopyId` skips the copy being edited.
 */
async function findExistingDuplicates(
  supabase: ServiceClient,
  field: "barcode" | "accession_number",
  values: string[],
  excludeCopyId?: string,
): Promise<string[]> {
  if (values.length === 0) return [];
  let query = supabase
    .from("catalog_copies")
    .select(`id, ${field}`)
    .in(field, values)
    .neq("status", "withdrawn");
  if (excludeCopyId) query = query.neq("id", excludeCopyId);
  const { data, error } = await query;
  if (error) {
    // Pre-0095 the accession_number column may not exist yet — nothing to collide with.
    if (isMissingColumnError(error)) return [];
    throw new Error(`Duplicate check failed: ${error.message}`);
  }
  return [...new Set((data ?? []).map((r) => (r as Record<string, string | null>)[field]).filter(Boolean))] as string[];
}

async function assertUnique(
  supabase: ServiceClient,
  rows: { barcode: string | null; accession: string | null }[],
  excludeCopyId?: string,
): Promise<string | null> {
  const barcodes = rows.map((r) => r.barcode);
  const accessions = rows.map((r) => r.accession);

  const internalBarcodeDupes = findInternalDuplicates(barcodes);
  if (internalBarcodeDupes.length > 0) {
    return `Duplicate barcode within this batch: ${internalBarcodeDupes.join(", ")}. Every copy needs its own barcode.`;
  }
  const internalAccessionDupes = findInternalDuplicates(accessions);
  if (internalAccessionDupes.length > 0) {
    return `Duplicate accession number within this batch: ${internalAccessionDupes.join(", ")}.`;
  }

  const [dupBarcodes, dupAccessions] = await Promise.all([
    findExistingDuplicates(supabase, "barcode", barcodes.filter(Boolean) as string[], excludeCopyId),
    findExistingDuplicates(supabase, "accession_number", accessions.filter(Boolean) as string[], excludeCopyId),
  ]);
  if (dupBarcodes.length > 0) {
    return `Barcode already in use: ${dupBarcodes.join(", ")}. Barcodes must be unique across the whole library.`;
  }
  if (dupAccessions.length > 0) {
    return `Accession number already in use: ${dupAccessions.join(", ")}.`;
  }
  return null;
}

function friendlyDbError(error: { code?: string; message: string }): string {
  if (error.code === "23505") {
    return "A copy with this barcode or accession number already exists.";
  }
  if (error.code === "23514") {
    return "The copy status is not one of the allowed values.";
  }
  return `Database error: ${error.message}`;
}

// ── fetchCopiesForBook ─────────────────────────────────────────────────────────
export async function fetchCopiesForBook(bookId: string): Promise<CatalogCopy[]> {
  const { supabase } = await requirePermission("books", "read");
  const { data, error } = await supabase
    .from("catalog_copies")
    .select("*")
    .eq("catalog_book_id", bookId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to fetch copies: ${error.message}`);
  const copies = (data ?? []) as CatalogCopy[];
  // Stable librarian ordering: copy number first when present, else acquisition order.
  return copies.sort((a, b) => (a.copy_number ?? 1e9) - (b.copy_number ?? 1e9));
}

// ── addCopy ────────────────────────────────────────────────────────────────────
export async function addCopy(bookId: string, formData: FormData): Promise<CopyActionResult> {
  const { supabase, userId } = await requirePermission("books", "write");

  const parsed = parseCopyForm(formData);
  if (!parsed.ok) return { success: false, error: parsed.error };

  const dupError = await assertUnique(supabase, [{ barcode: parsed.barcode, accession: parsed.accession }]);
  if (dupError) return { success: false, error: dupError };

  // Auto-assign the next copy number when the librarian left it blank.
  if (parsed.row.copy_number == null) {
    const { data: existing } = await supabase
      .from("catalog_copies")
      .select("*")
      .eq("catalog_book_id", bookId);
    const rows = (existing ?? []) as CatalogCopy[];
    const maxNo = Math.max(0, rows.length, ...rows.map((c) => c.copy_number ?? 0));
    parsed.row.copy_number = maxNo + 1;
  }

  const fullRow = { catalog_book_id: bookId, ...parsed.row };
  let { data, error } = await supabase.from("catalog_copies").insert(fullRow).select("id").single();
  if (error && isMissingColumnError(error)) {
    // Pre-0095 fallback — retry without the new inventory columns.
    ({ data, error } = await supabase.from("catalog_copies").insert(stripPost0095(fullRow)).select("id").single());
  }
  if (error) return { success: false, error: friendlyDbError(error) };

  await logAdminAction(userId, "addCatalogCopy", "catalog_copies", data!.id, {
    bookId, barcode: parsed.barcode, status: parsed.row.status,
  });
  await refreshCaches(supabase, bookId);
  return { success: true, added: 1, message: "Copy added." };
}

// ── updateCopy (full edit) ─────────────────────────────────────────────────────
export async function updateCopy(copyId: string, formData: FormData): Promise<CopyActionResult> {
  const { supabase, userId } = await requirePermission("books", "write");

  const { data: before, error: fetchErr } = await supabase
    .from("catalog_copies").select("*").eq("id", copyId).single();
  if (fetchErr || !before) return { success: false, error: "Copy not found." };

  const parsed = parseCopyForm(formData);
  if (!parsed.ok) return { success: false, error: parsed.error };

  const dupError = await assertUnique(
    supabase,
    [{ barcode: parsed.barcode, accession: parsed.accession }],
    copyId,
  );
  if (dupError) return { success: false, error: dupError };

  let { error } = await supabase.from("catalog_copies").update(parsed.row).eq("id", copyId);
  if (error && isMissingColumnError(error)) {
    ({ error } = await supabase.from("catalog_copies").update(stripPost0095(parsed.row)).eq("id", copyId));
  }
  if (error) return { success: false, error: friendlyDbError(error) };

  await logAdminAction(userId, "updateCatalogCopy", "catalog_copies", copyId, {
    bookId: before.catalog_book_id,
    previous: { barcode: before.barcode, status: before.status, call_number: before.call_number, shelf_location: before.shelf_location },
    next: { barcode: parsed.row.barcode, status: parsed.row.status, call_number: parsed.row.call_number, shelf_location: parsed.row.shelf_location },
  });
  await refreshCaches(supabase, before.catalog_book_id);
  return { success: true, message: "Copy updated." };
}

// ── updateCopyStatus (quick toggle) ────────────────────────────────────────────
export async function updateCopyStatus(copyId: string, status: CopyStatus, note?: string): Promise<CopyActionResult> {
  const { supabase, userId } = await requirePermission("books", "write");

  if (!(COPY_STATUS_VALUES as readonly string[]).includes(status)) {
    return { success: false, error: "Unknown copy status." };
  }

  const { data: before, error: fetchErr } = await supabase
    .from("catalog_copies").select("id, catalog_book_id, status, notes").eq("id", copyId).single();
  if (fetchErr || !before) return { success: false, error: "Copy not found." };

  const patch: Record<string, unknown> = { status };
  if (note !== undefined) patch.notes = note.trim() || null;

  const { error } = await supabase.from("catalog_copies").update(patch).eq("id", copyId);
  if (error) return { success: false, error: friendlyDbError(error) };

  await logAdminAction(userId, "updateCopyStatus", "catalog_copies", copyId, {
    bookId: before.catalog_book_id, previous: before.status, next: status,
  });
  await refreshCaches(supabase, before.catalog_book_id);
  return { success: true, message: "Status updated." };
}

// ── archiveCopy ────────────────────────────────────────────────────────────────
// Withdrawn copies stay in the database (audit trail, barcode history) but are
// excluded from totals and never shown publicly.
export async function archiveCopy(copyId: string, note?: string): Promise<CopyActionResult> {
  return updateCopyStatus(copyId, "withdrawn", note);
}

// ── deleteCopy (hard delete — data-entry mistakes only) ───────────────────────
export async function deleteCopy(copyId: string): Promise<CopyActionResult> {
  const { supabase, userId } = await requirePermission("books", "write");

  const { data: before } = await supabase
    .from("catalog_copies").select("*").eq("id", copyId).single();
  if (!before) return { success: false, error: "Copy not found." };

  const { error } = await supabase.from("catalog_copies").delete().eq("id", copyId);
  if (error) return { success: false, error: friendlyDbError(error) };

  await logAdminAction(userId, "deleteCatalogCopy", "catalog_copies", copyId, {
    bookId: before.catalog_book_id,
    deleted: { barcode: before.barcode, status: before.status, call_number: before.call_number },
  });
  await refreshCaches(supabase, before.catalog_book_id);
  return { success: true, message: "Copy deleted." };
}

// ── saveCopies (bulk, transactional) ──────────────────────────────────────────
// One INSERT with every row: PostgREST wraps it in a single transaction, so a
// failure (e.g. a unique violation) creates nothing. Rows arrive pre-generated
// by the client but every field is re-validated here.
export async function saveCopies(bookId: string, rows: GeneratedCopy[]): Promise<CopyActionResult> {
  const { supabase, userId } = await requirePermission("books", "write");

  if (!Array.isArray(rows) || rows.length === 0) return { success: false, error: "No copies to save." };
  if (rows.length > 100) return { success: false, error: "You can create at most 100 copies at a time." };

  // Re-validate each row server-side.
  const validated: { barcode: string | null; accession: string | null }[] = [];
  const records: Record<string, unknown>[] = [];
  for (const [i, r] of rows.entries()) {
    const fd = new FormData();
    fd.set("barcode", r.barcode ?? "");
    fd.set("call_number", r.call_number ?? "");
    fd.set("shelf_location", r.shelf_location ?? "");
    fd.set("holding_library", r.holding_library ?? "");
    fd.set("status", r.status ?? "available");
    fd.set("notes", r.notes ?? "");
    fd.set("accession_number", r.accession_number ?? "");
    fd.set("condition", r.condition ?? "");
    if (r.copy_number != null) fd.set("copy_number", String(r.copy_number));
    const parsed = parseCopyForm(fd);
    if (!parsed.ok) return { success: false, error: `Copy ${i + 1}: ${parsed.error}` };
    validated.push({ barcode: parsed.barcode, accession: parsed.accession });
    records.push({ catalog_book_id: bookId, ...parsed.row });
  }

  const dupError = await assertUnique(supabase, validated);
  if (dupError) return { success: false, error: dupError };

  let { data, error } = await supabase.from("catalog_copies").insert(records).select("id");
  if (error && isMissingColumnError(error)) {
    ({ data, error } = await supabase.from("catalog_copies").insert(records.map(stripPost0095)).select("id"));
  }
  if (error) return { success: false, error: friendlyDbError(error) };

  const added = data?.length ?? 0;
  await logAdminAction(userId, "bulkAddCatalogCopies", "catalog_copies", undefined, {
    bookId, count: added,
    barcodes: validated.map((v) => v.barcode).filter(Boolean).slice(0, 20),
  });
  await refreshCaches(supabase, bookId);
  return { success: true, added, message: `${added} ${added === 1 ? "copy" : "copies"} saved.` };
}

// ── bulkAddCopies (legacy barcode-list API, kept for CSV import) ───────────────
export async function bulkAddCopies(
  bookId: string,
  barcodes: string[],
  defaults: { call_number?: string; shelf_location?: string; holding_library?: string },
): Promise<{ added: number }> {
  const rows: GeneratedCopy[] = barcodes
    .map((b) => b.trim())
    .filter(Boolean)
    .map((barcode, i) => ({
      copy_number: i + 1,
      barcode,
      accession_number: null,
      call_number: defaults.call_number || null,
      shelf_location: defaults.shelf_location || null,
      holding_library: defaults.holding_library || "PTEC Library",
      status: "available" as CopyStatus,
      condition: null,
      notes: null,
    }));
  if (rows.length === 0) throw new Error("No barcodes provided");
  const result = await saveCopies(bookId, rows);
  if (!result.success) throw new Error(result.error);
  return { added: result.added ?? rows.length };
}
