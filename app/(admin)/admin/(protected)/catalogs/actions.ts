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
  catalogRecordSlug,
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
import { coverFetchMessage, fetchCoverSource } from "@/lib/isbn/cover-source";
import { zimaRelativePath } from "@/lib/zima";
import {
  createInKoha,
  kohaOwnsLinkedRecords,
  kohaStaffLinksFor,
  kohaWritesRecords,
  readKohaRecord,
  updateInKoha,
} from "@/lib/koha/catalog-writes";
import { pickWritable, type FieldConflict } from "@/lib/koha/biblio-write";
import type { WritableField } from "@/lib/koha/marc-write";
import type { KohaError } from "@/lib/koha/errors";

/** Koha's duplicate check matched (Phase 5): a librarian decides, the action never guesses. */
export type KohaDuplicate = {
  biblioId: number | null;
  title: string | null;
  author: string | null;
  /** The e-Library record already linked to that Koha record, if any. */
  existingBookId: string | null;
  recordUrl: string | null;
  /** Found by the recheck after a lost answer: most likely the record the last save created. */
  possiblyOurs: boolean;
};

export type BookActionResult =
  | {
      success: true;
      book: { id: string; slug: string; shelf_location: string | null; accession_number: string | null };
      /** Set when the record was written to Koha: where its copies are added. */
      koha?: { biblioId: number; recordUrl: string | null; addItemUrl: string | null };
    }
  | {
      success: false;
      error: string;
      fieldErrors?: Record<string, string>;
      kohaDuplicate?: KohaDuplicate;
      /** Koha created the record but the e-Library could not save its row: resubmit with this to finish. */
      kohaCreatedId?: number;
      /** Koha's answer was lost: the next submit first looks for the record this one may have made. */
      kohaAmbiguous?: boolean;
    };

const KOHA_FIELD_LABEL: Record<WritableField, string> = {
  title: "Title", author: "Author", isbn: "ISBN", publisher: "Publisher",
  year: "Publication year", language: "Language", category: "Category",
};

function kohaFailure(error: KohaError, ambiguous: boolean, what: "create" | "save"): string {
  if (ambiguous) {
    return what === "create"
      ? "Koha did not answer in time, so the e-Library cannot tell whether the record was created there. Nothing was saved here. Press Save again: it first looks in Koha for a record with exactly this title, and offers to use it instead of creating a second one."
      : "Koha did not answer in time, so the e-Library cannot tell whether your change reached it. Nothing was saved here. Reload this record in a minute: if Koha took the change it will show; if not, make it again.";
  }
  if (error.kind === "forbidden") {
    return "Koha refused: the e-Library's Koha account may not edit records. The Koha administrator sets PTEC_API_LEVEL=cataloguing and runs scripts/ptec-configure.sh (docs/KOHA-WRITES.md).";
  }
  if (error.failureKind === "config") return `Koha is not reachable as configured: ${error.message}`;
  return `Koha did not accept the record: ${error.kohaReason ?? error.message}`;
}

function conflictErrors(conflicts: FieldConflict[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of conflicts) {
    out[c.field] = `Changed in Koha to “${c.koha ?? "(empty)"}” since this page was loaded. Reload to see it, then make your change again if it is still needed.`;
  }
  return out;
}

/**
 * Live-availability probe for the slug field on both catalog wizards.
 *
 * Read-only and permission-gated like its posts counterpart. What "taken"
 * means differs by wizard, which is why both surface it as a note rather than
 * a block: on add, addCatalogBook() resolves a collision with a numeric suffix
 * (two physical books legitimately share a title); on edit, the update rejects
 * it outright and the cataloguer is told after the save attempt.
 */
export async function checkCatalogSlugAvailable(
  slug: string,
  ignoreId?: string,
): Promise<boolean> {
  const { supabase } = await requirePermission("catalog", "read");
  const clean = catalogRecordSlug(slug);
  if (!clean) return false;
  const { data } = await supabase.from("catalog_books").select("id").eq("slug", clean).limit(1);
  // A record editing its own slug must not report itself as a clash.
  return !(data ?? []).some((row: { id: string }) => row.id !== ignoreId);
}

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

/**
 * Shared validation for add + update. Returns normalized column values.
 * `authorOptional`: a record Koha owns may have no author (122 of the PMB
 * titles have none), and requiring one would make the rest of it uneditable.
 */
function parseBookForm(formData: FormData, opts: { authorOptional?: boolean } = {}): ParsedBook {
  const fieldErrors: Record<string, string> = {};

  const title = cleanText(formData.get("title"), "title");
  if (!title.ok) fieldErrors.title = title.error;
  else if (!title.value) fieldErrors.title = "Title is required.";

  const author = cleanText(formData.get("author"), "author");
  if (!author.ok) fieldErrors.author = author.error;
  else if (!author.value && !opts.authorOptional) fieldErrors.author = "Author is required.";

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
    ddc:              cleanText(formData.get("ddc"), "ddc"),
    shelf_location:   cleanText(formData.get("shelf_location"), "shelf_location"),
    accession_number: cleanText(formData.get("accession_number"), "accession_number"),
  };
  for (const [key, res] of Object.entries(simple)) {
    if (!res.ok) fieldErrors[key] = res.error;
  }

  const description = cleanLongText(formData.get("description"), "description");
  if (!description.ok) fieldErrors.description = description.error;

  // SEO overrides (migration 0112): validated like any other text; blank → null
  // so the catalog detail page auto-generates its title/description/cover.
  const seoTitle = cleanText(formData.get("seo_title"), "seo_title");
  if (!seoTitle.ok) fieldErrors.seo_title = seoTitle.error;
  const seoDescription = cleanLongText(formData.get("seo_description"), "seo_description");
  if (!seoDescription.ok) fieldErrors.seo_description = seoDescription.error;
  const ogImage = cleanText(formData.get("og_image"), "og_image");
  if (!ogImage.ok) fieldErrors.og_image = ogImage.error;

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: Object.values(fieldErrors)[0], fieldErrors };
  }

  const val = (k: keyof typeof simple) => (simple[k] as { ok: true; value: string | null }).value;
  return {
    ok: true,
    fields: {
      title: (title as { ok: true; value: string }).value,
      author: (author as { ok: true; value: string | null }).value || null,
      language: languageRaw,
      isbn: (isbn as { ok: true; normalized: string | null }).normalized,
      year: (year as { ok: true; year: number | null }).year,
      publisher: val("publisher"),
      category: val("category"),
      department: val("department"),
      ddc: val("ddc"),
      shelf_location: val("shelf_location"),
      accession_number: val("accession_number"),
      description: (description as { ok: true; value: string | null }).value,
      seo_title: (seoTitle as { ok: true; value: string | null }).value,
      seo_description: (seoDescription as { ok: true; value: string | null }).value,
      og_image: (ogImage as { ok: true; value: string | null }).value,
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

  // upload / import — validate, re-encode, push to Zima Storage. An imported
  // cover is fetched here, on save, so an abandoned form never stores a file.
  const limit = await rateLimit(`catalog-cover:${userId}`, COVER_UPLOAD_LIMIT, COVER_UPLOAD_WINDOW_MS);
  if (!limit.success) {
    const msg = "Too many cover uploads in a short time. Wait a few minutes and try again.";
    return { ok: false, error: msg, fieldErrors: { cover: msg } };
  }

  let bytes: ArrayBuffer;
  let name: string;
  if (input.mode === "import") {
    const fetched = await fetchCoverSource(input.url, { fetch: (u, i) => fetch(u, i) });
    if (!fetched.ok) {
      const msg = `${coverFetchMessage(fetched.reason)} Choose another cover option, or save with the auto-generated cover.`;
      return { ok: false, error: msg, fieldErrors: { cover: msg } };
    }
    bytes = fetched.bytes;
    name = "found-cover.jpg";
  } else {
    bytes = await input.file.arrayBuffer();
    name = input.file.name;
  }

  const processed = await processCatalogCover(bytes, name);
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
  const { supabase, userId } = await requirePermission("catalog", "write");

  const parsed = parseBookForm(formData);
  if (!parsed.ok) return { success: false, error: parsed.error, fieldErrors: parsed.fieldErrors };

  // Cover is resolved (and, for uploads, pushed to Zima Storage) only after the
  // bibliographic fields validate — an invalid form never uploads anything.
  const cover = await resolveCover(formData, userId);
  if (!cover.ok) return { success: false, error: cover.error, fieldErrors: cover.fieldErrors };

  // The wizard submits the slug it previewed, so what the cataloguer saw is
  // what gets saved. It is still re-derived server-side: the field is the
  // suggestion, never the authority. Blank (or an older client that sends no
  // slug at all) falls back to the title exactly as before.
  const requestedSlug = catalogRecordSlug(formData.get("slug")?.toString() ?? "");
  const baseSlug =
    requestedSlug ||
    catalogRecordSlug(parsed.fields.title as string) ||
    `book-${Date.now().toString(36)}`;

  // ── Koha first (Phase 5) ──
  // With KOHA_INTEGRATION=write the record is created in Koha, and the
  // e-Library saves its own row only from what Koha accepted. Koha's duplicate
  // check is answered by a person; a timed-out create is never repeated here.
  let koha: { biblioId: number; fields: ReturnType<typeof pickWritable> } | null = null;
  if (kohaWritesRecords()) {
    const adopt = Number(formData.get("koha_adopt_biblio_id") ?? "");
    if (Number.isInteger(adopt) && adopt > 0) {
      // A previous submit created the Koha record and failed to save this row:
      // finish that one, from what Koha holds, instead of creating another.
      const { data: already } = await supabase.from("catalog_books")
        .select("id, slug, shelf_location, accession_number").eq("koha_biblio_id", adopt).maybeSingle();
      if (already) return { success: true, book: already, koha: { biblioId: adopt, ...linksOrNull(adopt) } };
      const held = await readKohaRecord(adopt);
      if (held.kind !== "found") {
        if (cover.uploadedUrl) await deleteCatalogCoverIfOwned(cover.uploadedUrl);
        return { success: false, error: held.kind === "gone" ? `Koha has no record ${adopt} any more.` : kohaFailure(held.error, false, "create") };
      }
      koha = { biblioId: adopt, fields: held.fields };
    } else {
      const confirmNotDuplicate = formData.get("koha_confirm_not_duplicate") === "1";
      const created = await createInKoha(
        { ...pickWritable(parsed.fields), ddc: (parsed.fields.ddc as string | null) ?? null },
        { confirmNotDuplicate, recheckExisting: formData.get("koha_recheck") === "1" },
      );
      if (created.kind !== "created") {
        if (cover.uploadedUrl) await deleteCatalogCoverIfOwned(cover.uploadedUrl);
        if (created.kind === "duplicate") {
          const { data: existing } = created.biblioId
            ? await supabase.from("catalog_books").select("id").eq("koha_biblio_id", created.biblioId).maybeSingle()
            : { data: null };
          return {
            success: false,
            error: "Koha already has a record that looks like this one.",
            kohaDuplicate: {
              biblioId: created.biblioId, title: created.title, author: created.author,
              existingBookId: existing?.id ?? null,
              recordUrl: created.biblioId ? kohaStaffLinksFor(created.biblioId)?.record ?? null : null,
              possiblyOurs: created.possiblyOurs === true,
            },
          };
        }
        return { success: false, error: kohaFailure(created.error, created.ambiguous, "create"), kohaAmbiguous: created.ambiguous };
      }
      koha = { biblioId: created.biblioId, fields: created.fields };
      if (confirmNotDuplicate) {
        await logAdminAction(userId, "koha_duplicate_override", "catalog_books", undefined, {
          kohaBiblioId: created.biblioId, title: parsed.fields.title,
        });
      }
    }
  }

  // Copies start at 0 — counters are derived from catalog_copies rows.
  const record = {
    ...parsed.fields,
    // What Koha holds wins over the form it was built from.
    ...(koha ? { ...koha.fields, koha_biblio_id: koha.biblioId } : {}),
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
        ...(koha ? { kohaBiblioId: koha.biblioId } : {}),
      });
      revalidateCatalogBook(book.slug);
      revalidatePath("/admin/catalogs");
      return { success: true, book, ...(koha ? { koha: { biblioId: koha.biblioId, ...linksOrNull(koha.biblioId) } } : {}) };
    }
    lastError = error;
    if (error?.code !== "23505") break;
  }

  // The insert failed after a successful upload — remove the orphan.
  if (cover.uploadedUrl) await deleteCatalogCoverIfOwned(cover.uploadedUrl);
  if (koha) {
    return {
      success: false,
      kohaCreatedId: koha.biblioId,
      error: `The record was created in Koha (record ${koha.biblioId}), but the e-Library could not save its copy: ${lastError?.message ?? "unknown error"}. Press Save again to finish — it will not create a second record in Koha.`,
    };
  }
  return { success: false, error: `Failed to add book: ${lastError?.message ?? "unknown error"}` };
}

function linksOrNull(biblioId: number): { recordUrl: string | null; addItemUrl: string | null } {
  const links = kohaStaffLinksFor(biblioId);
  return { recordUrl: links?.record ?? null, addItemUrl: links?.addItem ?? null };
}

// ── updateCatalogBook ──────────────────────────────────────────────────────────
export async function updateCatalogBook(bookId: string, formData: FormData): Promise<BookActionResult> {
  const { supabase, userId } = await requirePermission("catalog", "write");

  // The row as it stands, read BEFORE the update. Three things depend on it:
  // the replaced cover object (deleted only after the DB write succeeds, and
  // only if it belonged to this record), the outgoing slug, which becomes a
  // redirect if the cataloguer changed it, and — for a record Koha owns — the
  // values the e-Library last synced, which the Koha write is checked against.
  // `select("*")` so a database without 0157 still answers (no koha column).
  const { data: current, error: readError } = await supabase.from("catalog_books").select("*").eq("id", bookId).single();
  if (readError) return { success: false, error: `Update failed: ${readError.message}` };
  const kohaBiblioId = kohaOwnsLinkedRecords() && Number.isInteger(current.koha_biblio_id) ? (current.koha_biblio_id as number) : null;

  const parsed = parseBookForm(formData, { authorOptional: kohaBiblioId !== null });
  if (!parsed.ok) return { success: false, error: parsed.error, fieldErrors: parsed.fieldErrors };
  if (kohaBiblioId !== null) {
    // Derived from the copies in Koha; the form shows them read-only.
    delete parsed.fields.ddc;
    delete parsed.fields.department;
  }

  const cover = await resolveCover(formData, userId);
  if (!cover.ok) return { success: false, error: cover.error, fieldErrors: cover.fieldErrors };

  // ── Koha first (Phase 5) ──
  let kohaWrite: { fields: ReturnType<typeof pickWritable>; changed: string[] } | null = null;
  if (kohaBiblioId !== null && kohaWritesRecords()) {
    const outcome = await updateInKoha(kohaBiblioId, pickWritable(current), pickWritable(parsed.fields));
    if (outcome.kind !== "updated" && outcome.kind !== "unchanged") {
      if (cover.uploadedUrl) await deleteCatalogCoverIfOwned(cover.uploadedUrl);
      if (outcome.kind === "conflict") {
        const fieldErrors = conflictErrors(outcome.conflicts);
        const names = outcome.conflicts.map((c) => KOHA_FIELD_LABEL[c.field]).join(", ");
        return { success: false, error: `Not saved: ${names} changed in Koha since this page was loaded.`, fieldErrors };
      }
      if (outcome.kind === "gone") return { success: false, error: `Koha has no record ${kohaBiblioId} any more. Nothing was saved; the nightly sync will unlist this record.` };
      if (outcome.kind === "locked") return { success: false, error: `Koha has locked record ${kohaBiblioId} against edits. Nothing was saved.` };
      return { success: false, error: kohaFailure(outcome.error, outcome.ambiguous, "save") };
    }
    kohaWrite = { fields: outcome.fields, changed: outcome.kind === "updated" ? outcome.changed : [] };
  }
  const previousCoverUrl: string | null = cover.update ? current?.cover_url ?? null : null;
  const previousSlug: string | null = current?.slug ?? null;

  // A blank slug field means "leave it alone" — the wizard only submits a slug
  // when the cataloguer opened the field, and an empty one must never wipe a
  // live URL.
  const requestedSlug = catalogRecordSlug(formData.get("slug")?.toString() ?? "");
  const slugChanged = Boolean(requestedSlug) && requestedSlug !== previousSlug;

  // NOTE: copies_total / copies_available deliberately absent — derived data.
  const { data: book, error } = await supabase
    .from("catalog_books")
    .update({
      ...parsed.fields,
      // What Koha now holds — including any Koha-side change to a field this
      // librarian did not touch — so the e-Library matches Koha at once.
      ...(kohaWrite?.fields ?? {}),
      keywords: parseTags(formData, "keywords"),
      ...(cover.update ?? {}),
      ...(slugChanged ? { slug: requestedSlug } : {}),
    })
    .eq("id", bookId)
    .select("id, slug, shelf_location, accession_number")
    .single();

  if (error) {
    // Never orphan a fresh upload when the save it belonged to failed.
    if (cover.uploadedUrl) await deleteCatalogCoverIfOwned(cover.uploadedUrl);
    const inKoha = kohaWrite?.changed.length ? " Your change IS saved in Koha; the next sync (within 15 minutes) shows it here." : "";
    if (error.code === "23505") {
      // Field-scoped, so it lands on the slug control rather than only in the
      // banner — the cataloguer should not have to hunt for which field.
      const message = "Another book already uses this slug.";
      return { success: false, error: message + inKoha, fieldErrors: { slug: message } };
    }
    return { success: false, error: `Update failed: ${error.message}.${inKoha}` };
  }

  // The rename succeeded — leave the old URL pointing at this record so
  // bookmarks, shelf-label QR codes and search-engine signal survive it
  // (migration 0120; middleware turns the row into a 301).
  if (slugChanged && previousSlug) {
    // Any redirect already aimed at this record keeps pointing at it, so an
    // a → b → c rename sequence collapses to a → c and b → c rather than
    // forming a chain. A row FROM the new slug would loop the page onto
    // itself — that happens when a record is renamed and then renamed back.
    await supabase.from("catalog_slug_redirects").delete().eq("old_slug", book.slug);
    const { error: redirectErr } = await supabase
      .from("catalog_slug_redirects")
      .upsert({ old_slug: previousSlug, book_id: book.id }, { onConflict: "old_slug" });
    // The save already succeeded; a missing redirect table must not fail it.
    // Log loudly instead — the consequence is a 404 on the old URL, not a lost
    // edit, and the admin has already been told the record saved.
    if (redirectErr) {
      console.error("[catalog] slug redirect not recorded:", redirectErr.message);
    }
  }

  await logAdminAction(userId, "updateCatalogBook", "catalog_books", book.id, {
    title: parsed.fields.title,
    ...(kohaBiblioId !== null ? { kohaBiblioId, kohaChanged: kohaWrite?.changed ?? null } : {}),
    ...(slugChanged ? { slugFrom: previousSlug, slugTo: book.slug } : {}),
    ...(cover.update ? { cover: coverAudit(previousCoverUrl, cover.update.cover_url) } : {}),
  });
  revalidateCatalogBook(book.slug);
  // The old URL is now a redirect — its cached 200 has to go too.
  if (slugChanged && previousSlug) revalidateCatalogBook(previousSlug);
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
  const { supabase, userId } = await requirePermission("catalog", "write");
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
  const { supabase, userId } = await requirePermission("catalog", "write");
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
  const { supabase, userId } = await requirePermission("catalog", "write");
  const { data: book } = await supabase
    .from("catalog_books").select("*").eq("id", bookId).single();
  // Koha holds the record: deleting the e-Library's row would only have the
  // next sync create it again. Unlisting hides it; deleting is done in Koha.
  if (book?.koha_biblio_id != null && kohaOwnsLinkedRecords()) {
    throw new Error("This record comes from Koha, so it cannot be deleted here. Unlist it to hide it, or delete it in Koha.");
  }
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
