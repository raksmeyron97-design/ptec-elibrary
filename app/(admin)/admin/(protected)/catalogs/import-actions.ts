"use server";
// app/admin/catalogs/import-actions.ts
// Server actions for the CSV import wizard.
//
// Trust boundary: the client parses + validates for instant preview UX, but
// every value that reaches the database is re-normalized and re-validated
// HERE from the raw CSV cell values. The server never accepts a client-side
// verdict ("row is valid", "not a duplicate", "URL is safe").
//
// Import shape: the client sends the raw rows in group-aligned batches
// (≤ IMPORT_LIMITS.batchRows source rows per call). Batch-by-batch processing
// gives real progress, keeps each request well inside serverless time limits,
// and makes cancellation safe (stop between batches — completed batches stay,
// and the results screen reports exactly what was written).
//
// Idempotency: startCatalogImport() records the source hash; re-submitting the
// same file within the active window is rejected unless the admin explicitly
// forces a re-import. Within a run, duplicate-skip semantics make a re-sent
// batch a no-op for existing books, and barcode/accession uniqueness blocks
// duplicate copies.
//
// Job persistence uses catalog_import_jobs (migration 0096). The code is
// pre-migration-safe: when the table is missing (42P01 / PGRST205) the import
// still runs and is fully audited via admin_audit_log — only history rows and
// the cross-session duplicate-submission guard degrade.

import { revalidatePath } from "next/cache";
import { revalidateCatalogBook } from "@/lib/cache/revalidate";
import { requirePermission } from "@/lib/auth/requireAdmin";
import { logAdminAction } from "@/app/actions/audit";
import { catalogSlugify, pickCatalogColor, computeCopyStats } from "@/lib/catalog";
import {
  validateRow,
  markInFileDuplicates,
  buildImportGroups,
  refreshRowStatus,
  IMPORT_LIMITS,
  type BookImportField,
  type DuplicateMatch,
  type DuplicateStrategy,
  type ImportGroup,
  type ImportOptions,
  type ImportRowResult,
  type ValidatedRow,
} from "@/lib/catalog-import";

type ServiceClient = Awaited<ReturnType<typeof requirePermission>>["supabase"];

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === "42P01" || error.code === "PGRST205");
}
function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === "PGRST204" || error.code === "42703");
}

// ── Context: reference values used by the mapping/validation steps ────────────

export type CatalogImportContext = {
  categories: string[];
  departments: string[];
  shelfLocations: string[];
  totalBooks: number;
};

export async function getCatalogImportContext(): Promise<CatalogImportContext> {
  const { supabase } = await requirePermission("books", "write");
  const { data } = await supabase
    .from("catalog_books")
    .select("category, department, shelf_location");
  const rows = (data ?? []) as { category: string | null; department: string | null; shelf_location: string | null }[];
  const distinct = (key: "category" | "department" | "shelf_location") =>
    [...new Set(rows.map((r) => r[key]).filter(Boolean) as string[])].sort();
  return {
    categories: distinct("category"),
    departments: distinct("department"),
    shelfLocations: distinct("shelf_location"),
    totalBooks: rows.length,
  };
}

// ── Duplicate check (bulk, one call for the whole preview) ───────────────────

export type DuplicateCheckRequest = {
  /** Normalized ISBNs (digits only). */
  isbns: string[];
  /** Lower-cased "title|author" keys. */
  titleAuthors: string[];
  barcodes: string[];
  accessions: string[];
};

export type DuplicateCheckResult = {
  /** normalized isbn → existing book */
  byIsbn: Record<string, DuplicateMatch>;
  /** "title|author" (lower-cased) → existing book */
  byTitleAuthor: Record<string, DuplicateMatch>;
  /** barcodes already used by live copies */
  usedBarcodes: string[];
  /** accession numbers already used by live copies */
  usedAccessions: string[];
};

const CHUNK = 200;
function chunk<T>(arr: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function lookupDuplicates(
  supabase: ServiceClient,
  req: DuplicateCheckRequest,
): Promise<DuplicateCheckResult> {
  const result: DuplicateCheckResult = { byIsbn: {}, byTitleAuthor: {}, usedBarcodes: [], usedAccessions: [] };

  // Existing bibliographic records. The whole physical catalog is small
  // (the admin page already loads every row for its stats), so one columns-only
  // read and in-memory case-insensitive matching is both simplest and correct.
  const { data: books } = await supabase
    .from("catalog_books")
    .select("id, title, author, isbn, slug")
    .eq("is_active", true);

  const wantIsbn = new Set(req.isbns.filter(Boolean));
  const wantTA = new Set(req.titleAuthors.filter(Boolean));
  for (const b of (books ?? []) as { id: string; title: string; author: string | null; isbn: string | null; slug: string }[]) {
    const isbn = b.isbn?.replace(/[\s-]+/g, "").toUpperCase() ?? "";
    if (isbn && wantIsbn.has(isbn) && !result.byIsbn[isbn]) {
      result.byIsbn[isbn] = { existingBookId: b.id, existingTitle: b.title, existingSlug: b.slug, matchedBy: "isbn" };
    }
    const ta = `${b.title.trim().toLowerCase()}|${(b.author ?? "").trim().toLowerCase()}`;
    if (wantTA.has(ta) && !result.byTitleAuthor[ta]) {
      result.byTitleAuthor[ta] = { existingBookId: b.id, existingTitle: b.title, existingSlug: b.slug, matchedBy: "title_author" };
    }
  }

  // Barcode / accession collisions among live (non-withdrawn) copies.
  for (const part of chunk(req.barcodes.filter(Boolean))) {
    const { data, error } = await supabase
      .from("catalog_copies").select("barcode").in("barcode", part).neq("status", "withdrawn");
    if (!error) result.usedBarcodes.push(...new Set((data ?? []).map((r: { barcode: string | null }) => r.barcode).filter(Boolean) as string[]));
  }
  for (const part of chunk(req.accessions.filter(Boolean))) {
    const { data, error } = await supabase
      .from("catalog_copies").select("accession_number").in("accession_number", part).neq("status", "withdrawn");
    // Pre-0095 the copies table has no accession_number column — nothing to collide with.
    if (!error) result.usedAccessions.push(...new Set((data ?? []).map((r: { accession_number: string | null }) => r.accession_number).filter(Boolean) as string[]));
    else if (!isMissingColumn(error)) throw new Error(`Duplicate check failed: ${error.message}`);
  }

  return result;
}

export async function checkCatalogDuplicates(req: DuplicateCheckRequest): Promise<DuplicateCheckResult> {
  const { supabase } = await requirePermission("books", "write");
  // Bound the request so a hostile client can't turn this into a table scan storm.
  if (req.isbns.length > IMPORT_LIMITS.maxRows || req.titleAuthors.length > IMPORT_LIMITS.maxRows ||
      req.barcodes.length > IMPORT_LIMITS.maxRows || req.accessions.length > IMPORT_LIMITS.maxRows) {
    throw new Error(`Too many values — at most ${IMPORT_LIMITS.maxRows} rows per import.`);
  }
  return lookupDuplicates(supabase, req);
}

// ── Import job lifecycle ──────────────────────────────────────────────────────

export type StartImportRequest = {
  fileName: string | null;
  sourceType: "file" | "paste";
  /** SHA-256 hex of the source text (computed client-side, recorded for audit + duplicate-submission detection). */
  sourceHash: string;
  totalRows: number;
  options: ImportOptions;
  /** Re-import the same file on purpose. */
  force?: boolean;
};

export type StartImportResult =
  | { ok: true; importId: string }
  | { ok: false; code: "DUPLICATE_SUBMISSION" | "LIMITS" | "ERROR"; error: string };

const DUPLICATE_SUBMISSION_WINDOW_MS = 15 * 60 * 1000;

export async function startCatalogImport(req: StartImportRequest): Promise<StartImportResult> {
  const { supabase, userId } = await requirePermission("books", "write");

  if (!Number.isInteger(req.totalRows) || req.totalRows < 1 || req.totalRows > IMPORT_LIMITS.maxRows) {
    return { ok: false, code: "LIMITS", error: `Imports are limited to ${IMPORT_LIMITS.maxRows} rows.` };
  }
  if (!/^[a-f0-9]{16,64}$/i.test(req.sourceHash)) {
    return { ok: false, code: "ERROR", error: "Invalid source hash." };
  }

  const fileName = (req.fileName ?? "").slice(0, 200) || null;
  const importId = crypto.randomUUID();

  // Duplicate-submission guard (works fully once 0096 is applied).
  const since = new Date(Date.now() - DUPLICATE_SUBMISSION_WINDOW_MS).toISOString();
  const { data: recent, error: jobsError } = await supabase
    .from("catalog_import_jobs")
    .select("id, status, created_at")
    .eq("requested_by", userId)
    .eq("source_hash", req.sourceHash)
    .gte("created_at", since)
    .limit(1);

  if (!jobsError && recent && recent.length > 0 && !req.force) {
    const j = recent[0] as { status: string };
    return {
      ok: false,
      code: "DUPLICATE_SUBMISSION",
      error: j.status === "processing"
        ? "This exact file is already being imported."
        : "This exact file was imported in the last 15 minutes. Choose “Import again anyway” if this is intentional.",
    };
  }

  if (!jobsError || isMissingTable(jobsError)) {
    if (!jobsError) {
      await supabase.from("catalog_import_jobs").insert({
        id: importId,
        requested_by: userId,
        source_file_name: fileName,
        source_type: req.sourceType,
        source_hash: req.sourceHash,
        status: "processing",
        total_rows: req.totalRows,
        options: {
          duplicateStrategy: req.options.duplicateStrategy,
          includeWarnings: req.options.includeWarnings,
          defaultOneCopy: req.options.defaultOneCopy,
          strictReferenceValues: req.options.strictReferenceValues,
        },
      });
    }
  } else {
    return { ok: false, code: "ERROR", error: `Could not start import: ${jobsError.message}` };
  }

  await logAdminAction(userId, "catalogImportStarted", "catalog_books", undefined, {
    importId,
    fileName,
    sourceType: req.sourceType,
    sourceHashPrefix: req.sourceHash.slice(0, 12),
    totalRows: req.totalRows,
    duplicateStrategy: req.options.duplicateStrategy,
  });

  return { ok: true, importId };
}

// ── Batch import ──────────────────────────────────────────────────────────────

export type ImportBatchRequest = {
  importId: string;
  /** Raw mapped cell values per row — the server re-validates everything. */
  rows: { rowNumber: number; original: Partial<Record<BookImportField, string>> }[];
  options: ImportOptions;
};

export type ImportBatchResult =
  | { ok: true; results: ImportRowResult[] }
  | { ok: false; error: string; results: ImportRowResult[] };

// Copy-insert columns that only exist after migration 0095.
function stripPost0095(row: Record<string, unknown>): Record<string, unknown> {
  const clone = { ...row };
  delete clone.copy_number;
  delete clone.accession_number;
  delete clone.condition;
  return clone;
}

async function insertCopies(
  supabase: ServiceClient,
  bookId: string,
  copies: { barcode: string | null; accession_number: string | null; shelf_location: string | null }[],
  usedBarcodes: Set<string>,
  usedAccessions: Set<string>,
): Promise<{ created: number; skipped: string[] }> {
  if (copies.length === 0) return { created: 0, skipped: [] };

  // Copy numbers continue after the book's existing copies.
  const { data: existing } = await supabase
    .from("catalog_copies")
    .select("*")
    .eq("catalog_book_id", bookId);
  const existingRows = (existing ?? []) as { copy_number?: number | null }[];
  let nextNo = Math.max(0, existingRows.length, ...existingRows.map((c) => c.copy_number ?? 0)) + 1;

  const skipped: string[] = [];
  const records: Record<string, unknown>[] = [];
  for (const c of copies) {
    // Blocking duplicates: never silently reuse a live barcode/accession.
    if (c.barcode && usedBarcodes.has(c.barcode)) {
      skipped.push(`barcode ${c.barcode} already in use`);
      continue;
    }
    if (c.accession_number && usedAccessions.has(c.accession_number)) {
      skipped.push(`accession ${c.accession_number} already in use`);
      continue;
    }
    if (c.barcode) usedBarcodes.add(c.barcode);
    if (c.accession_number) usedAccessions.add(c.accession_number);
    records.push({
      catalog_book_id: bookId,
      copy_number: nextNo++,
      barcode: c.barcode,
      accession_number: c.accession_number,
      call_number: null,
      shelf_location: c.shelf_location,
      holding_library: "PTEC Library",
      status: "available",
      condition: null,
      notes: null,
    });
  }

  if (records.length === 0) return { created: 0, skipped };

  let { data, error } = await supabase.from("catalog_copies").insert(records).select("id");
  if (error && isMissingColumn(error)) {
    ({ data, error } = await supabase.from("catalog_copies").insert(records.map(stripPost0095)).select("id"));
  }
  if (error) throw new Error(error.message);

  // Keep the derived counters correct even before 0095's trigger exists.
  const { data: live } = await supabase
    .from("catalog_copies").select("status").eq("catalog_book_id", bookId);
  const stats = computeCopyStats(live ?? []);
  await supabase
    .from("catalog_books")
    .update({ copies_total: stats.total, copies_available: stats.available })
    .eq("id", bookId);

  return { created: data?.length ?? 0, skipped };
}

/** Fill-missing-fields-only update (never overwrites non-empty metadata). */
async function fillMissingFields(
  supabase: ServiceClient,
  bookId: string,
  n: ValidatedRow["normalized"],
): Promise<boolean> {
  const { data: existing } = await supabase
    .from("catalog_books")
    .select("isbn, publisher, year, category, department, shelf_location, description, accession_number, cover_url, keywords")
    .eq("id", bookId)
    .single();
  if (!existing) return false;

  const patch: Record<string, unknown> = {};
  if (!existing.isbn && n.isbn) patch.isbn = n.isbn;
  if (!existing.publisher && n.publisher) patch.publisher = n.publisher;
  if (!existing.year && n.year) patch.year = n.year;
  if (!existing.category && n.category) patch.category = n.category;
  if (!existing.department && n.department) patch.department = n.department;
  if (!existing.shelf_location && n.shelf_location) patch.shelf_location = n.shelf_location;
  if (!existing.description && n.description) patch.description = n.description;
  if (!existing.accession_number && n.accession_number) patch.accession_number = n.accession_number;
  if (!existing.cover_url && n.cover_url) patch.cover_url = n.cover_url;
  if ((existing.keywords ?? []).length === 0 && n.keywords.length > 0) patch.keywords = n.keywords;

  if (Object.keys(patch).length === 0) return false;
  const { error } = await supabase.from("catalog_books").update(patch).eq("id", bookId);
  return !error;
}

export async function runCatalogImportBatch(req: ImportBatchRequest): Promise<ImportBatchResult> {
  const { supabase, userId } = await requirePermission("books", "write");
  const results: ImportRowResult[] = [];

  if (!Array.isArray(req.rows) || req.rows.length === 0) {
    return { ok: false, error: "Empty batch.", results };
  }
  // A batch is group-aligned client-side, but a hostile client could send more;
  // cap defensively (largest legal group = maxCopiesPerBook rows).
  if (req.rows.length > IMPORT_LIMITS.maxCopiesPerBook + IMPORT_LIMITS.batchRows) {
    return { ok: false, error: "Batch too large.", results };
  }

  const strategy: DuplicateStrategy = ["skip", "update", "create"].includes(req.options.duplicateStrategy)
    ? req.options.duplicateStrategy
    : "skip";

  // 1. Server-side re-validation of every row from the raw values.
  const validated: ValidatedRow[] = req.rows.map((r) =>
    validateRow(r.original ?? {}, r.rowNumber),
  );
  const marked = markInFileDuplicates(validated);

  for (const row of marked) {
    if (row.status === "error") {
      results.push({
        rowNumber: row.rowNumber,
        status: "failed",
        message: row.issues.filter((i) => i.severity === "error").map((i) => i.message).join(" "),
      });
    }
  }
  const importable = marked.filter((r) => r.status !== "error");

  if (!req.options.includeWarnings) {
    for (const r of importable) {
      if (r.status === "warning") results.push({ rowNumber: r.rowNumber, status: "excluded", message: "Warning rows excluded by import options." });
    }
  }
  const finalRows = req.options.includeWarnings ? importable : importable.filter((r) => r.status !== "warning");

  // 2. Fresh duplicate lookup for exactly this batch (client claims ignored).
  const dupes = await lookupDuplicates(supabase, {
    isbns: [...new Set(finalRows.map((r) => r.normalized.isbn).filter(Boolean) as string[])],
    titleAuthors: [...new Set(finalRows.map((r) => `${r.normalized.title.toLowerCase()}|${r.normalized.author.toLowerCase()}`))],
    barcodes: [...new Set(finalRows.map((r) => r.normalized.barcode).filter(Boolean) as string[])],
    accessions: [...new Set(finalRows.map((r) => r.normalized.accession_number).filter(Boolean) as string[])],
  });
  const usedBarcodes = new Set(dupes.usedBarcodes);
  const usedAccessions = new Set(dupes.usedAccessions);

  const withDupes = finalRows.map((r) => {
    const isbnHit = r.normalized.isbn ? dupes.byIsbn[r.normalized.isbn] : undefined;
    const taHit = dupes.byTitleAuthor[`${r.normalized.title.toLowerCase()}|${r.normalized.author.toLowerCase()}`];
    return refreshRowStatus({ ...r, duplicateMatch: isbnHit ?? taHit });
  });

  // 3. Group into books + copy plans and write.
  const { groups } = buildImportGroups(withDupes, { defaultOneCopy: req.options.defaultOneCopy });

  for (const g of groups) {
    try {
      const res = await importGroup(supabase, userId, g, strategy, usedBarcodes, usedAccessions);
      results.push(...res);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Import failed for this book.";
      for (const rn of g.rowNumbers) results.push({ rowNumber: rn, status: "failed", message });
    }
  }

  return { ok: true, results };
}

async function importGroup(
  supabase: ServiceClient,
  userId: string,
  g: ImportGroup,
  strategy: DuplicateStrategy,
  usedBarcodes: Set<string>,
  usedAccessions: Set<string>,
): Promise<ImportRowResult[]> {
  const n = g.book;

  // Duplicate handling.
  if (g.duplicateMatch) {
    if (strategy === "skip") {
      return g.rowNumbers.map((rn) => ({
        rowNumber: rn,
        status: "skipped_duplicate" as const,
        bookId: g.duplicateMatch!.existingBookId,
        message: g.duplicateMatch!.matchedBy === "isbn"
          ? `ISBN ${n.isbn} already belongs to “${g.duplicateMatch!.existingTitle}”.`
          : `“${g.duplicateMatch!.existingTitle}” already exists with the same title and author.`,
      }));
    }
    if (strategy === "update") {
      const bookId = g.duplicateMatch.existingBookId;
      const updated = await fillMissingFields(supabase, bookId, n);
      const { created, skipped } = await insertCopies(supabase, bookId, g.copies, usedBarcodes, usedAccessions);
      const slugRow = await supabase.from("catalog_books").select("slug").eq("id", bookId).single();
      return g.rowNumbers.map((rn, i) => ({
        rowNumber: rn,
        status: (i === 0 && updated ? "updated" : "copies_added") as ImportRowResult["status"],
        bookId,
        bookSlug: slugRow.data?.slug,
        copiesCreated: i === 0 ? created : 0,
        message: skipped.length > 0 && i === 0 ? `Skipped ${skipped.length} cop${skipped.length === 1 ? "y" : "ies"}: ${skipped.join("; ")}` : undefined,
      }));
    }
    // strategy === "create" falls through to a fresh record below.
  }

  // Insert the new bibliographic record; slug collisions get numeric suffixes.
  const baseSlug = catalogSlugify(n.title) || `book-${Date.now().toString(36)}`;
  const suffix = n.isbn ? catalogSlugify(n.isbn) : catalogSlugify(n.author);
  const preferredSlug = suffix ? `${baseSlug}-${suffix}`.slice(0, 120) : baseSlug;

  const record = {
    title: n.title,
    author: n.author,
    isbn: n.isbn,
    publisher: n.publisher,
    year: n.year,
    language: n.language,
    category: n.category,
    department: n.department,
    shelf_location: n.shelf_location,
    description: n.description,
    accession_number: n.accession_number,
    cover_url: n.cover_url,
    cover_color: pickCatalogColor(n.title),
    keywords: n.keywords,
    copies_total: 0,
    copies_available: 0,
    created_by: userId,
  };

  let bookId: string | null = null;
  let bookSlug: string | null = null;
  let lastError: { code?: string; message: string } | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const slug = attempt === 0 ? preferredSlug : `${preferredSlug}-${attempt + 1}`;
    const { data, error } = await supabase
      .from("catalog_books")
      .insert({ ...record, slug })
      .select("id, slug")
      .single();
    if (!error && data) {
      bookId = data.id;
      bookSlug = data.slug;
      break;
    }
    lastError = error;
    if (error?.code !== "23505") break;
  }
  if (!bookId) throw new Error(lastError?.message ?? "Could not create the book record.");

  const { created, skipped } = await insertCopies(supabase, bookId, g.copies, usedBarcodes, usedAccessions);

  return g.rowNumbers.map((rn, i) => ({
    rowNumber: rn,
    status: "created" as const,
    bookId: bookId!,
    bookSlug: bookSlug ?? undefined,
    copiesCreated: i === 0 ? created : 0,
    message: skipped.length > 0 && i === 0 ? `Skipped ${skipped.length} cop${skipped.length === 1 ? "y" : "ies"}: ${skipped.join("; ")}` : undefined,
  }));
}

// ── Finish / cancel ───────────────────────────────────────────────────────────

export type FinishImportRequest = {
  importId: string;
  status: "completed" | "failed" | "cancelled";
  counts: {
    created: number;
    updated: number;
    copiesCreated: number;
    skippedDuplicates: number;
    failed: number;
    excluded: number;
  };
  durationMs: number;
};

export async function finishCatalogImport(req: FinishImportRequest): Promise<void> {
  const { supabase, userId } = await requirePermission("books", "write");

  const status = ["completed", "failed", "cancelled"].includes(req.status) ? req.status : "failed";
  const c = req.counts ?? { created: 0, updated: 0, copiesCreated: 0, skippedDuplicates: 0, failed: 0, excluded: 0 };

  const { error } = await supabase
    .from("catalog_import_jobs")
    .update({
      status,
      created_count: c.created,
      updated_count: c.updated,
      copies_created: c.copiesCreated,
      skipped_count: c.skippedDuplicates,
      failed_count: c.failed,
      excluded_count: c.excluded,
      completed_at: new Date().toISOString(),
    })
    .eq("id", req.importId)
    .eq("requested_by", userId);
  if (error && !isMissingTable(error)) {
    console.error("[finishCatalogImport] job update failed:", error.message);
  }

  await logAdminAction(
    userId,
    status === "completed" ? "catalogImportCompleted" : status === "cancelled" ? "catalogImportCancelled" : "catalogImportFailed",
    "catalog_books",
    undefined,
    { importId: req.importId, ...c, durationMs: Math.max(0, Math.round(req.durationMs)) },
  );

  // One cache refresh for the whole import (not per batch).
  revalidateCatalogBook();
  revalidatePath("/admin/catalogs");
}

// Note: importCatalogCsv (actions.ts) is superseded by the wizard flow above
// and is no longer referenced by any UI.
