"use server";

// app/admin/books/actions.ts
import { revalidateLocalizedPath as revalidatePath, revalidateBook } from "@/lib/cache/revalidate";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { requirePermission } from "@/lib/auth/requireAdmin";
import { slugify } from "@/lib/books";
import { zimaDelete } from "@/lib/zima";
import { logAdminAction } from "@/app/actions/audit";
import { createAdminNotification } from "@/lib/admin-notifications";
import { indexPdfPagesSafe } from "@/lib/pdf-page-index";
import { notifyNewBookPublished } from "@/lib/push-events";
import { EBOOKS_BASE_PATH } from "@/lib/admin/ebooks-url";
import { findBookDuplicates } from "@/lib/books/duplicate-detection/service";
import { normalizeTaxonomyValue } from "@/lib/books/duplicate-detection/normalize";

/** Parse comma-separated tag string from FormData into a clean string[] */
function parseTags(fd: FormData, field: "tags" | "keywords"): string[] {
  return (fd.get(field) as string ?? "")
    .split(",")
    .map(t => t.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function requiredText(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

// Publication years must be plausible: no earlier than 1900 and at most one
// year in the future (forthcoming titles). Blank/invalid input defaults to
// the current year, matching previous behaviour.
function validatedYear(raw: unknown): number {
  const current = new Date().getFullYear();
  const year = Number(raw);
  if (!raw || Number.isNaN(year)) return current;
  if (!Number.isInteger(year) || year < 1900 || year > current + 1) {
    throw new Error(`Publication year must be between 1900 and ${current + 1}`);
  }
  return year;
}

function pickCoverColor(title: string): string {
  const coverColors = [
    "bg-[#0f766e]", "bg-[#2563eb]", "bg-[#7c3aed]", "bg-[#16a34a]",
    "bg-[#db2777]", "bg-[#0891b2]", "bg-[#ca8a04]", "bg-[#ea580c]",
    "bg-[#dc2626]", "bg-[#4f46e5]",
  ];
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  return coverColors[Math.abs(hash) % coverColors.length];
}


// ── saveBookRecord ────────────────────────────────────────────────
export interface BookInput {
  title: string;
  author: string;
  department: string;
  category: string;
  language: string;
  fileUrl: string;
  summary?: string;
  isbn?: string;
  publisher?: string;
  year?: string | number;
  pages?: string | number;
  fileSizeKb?: string | number;
  coverUrl?: string;
  tags?: string;
  categoryId?: string;
  departmentId?: string;
  contentHash?: string;
  /** Zima folder the files were written to (migration 0128). Recorded, never
   *  recomputed: the uid in it is random and the title slug is truncated. */
  storageFolder?: string;
  /** "published" (default) goes live immediately; "pending_review" waits in /admin/review */
  status?: "published" | "pending_review";
  /**
   * Library policy (migration 0131): may readers take the file away?
   *
   * Undefined means "not specified by this client", which takes the column
   * default (true) — an older form build, or the bulk importer, must never
   * restrict a book by omission.
   */
  allowDownload?: boolean;
  /** Optional librarian wording shown in place of the download action. */
  downloadDisabledReason?: string | null;
  license?: string;
  /** Canonical author chosen in the picker. When present and real, the book
   *  attaches to that exact row instead of upserting one by name — which is
   *  how "John Smith" stops becoming three people. Never trusted blindly: an
   *  id that does not exist falls back to the name path. */
  authorId?: string;
  /**
   * A librarian's explicit decision to save despite a BLOCKING duplicate.
   *
   * Only an ISBN collision can be overridden, and only into the review queue —
   * see assertNotDuplicate(). A byte-identical PDF has no legitimate override:
   * there is no second record to make of the same file.
   */
  duplicateOverride?: { acknowledgedBookId: string; reason: string };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Escape LIKE metacharacters so a taxonomy name is matched as literal text. */
function likeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

/**
 * Find an existing category/department by name, case- and padding-insensitively.
 *
 * `.eq("name", …)` is case-sensitive, so "education" typed into a form that
 * already had "Education" inserted a second row — and then the two split the
 * collection between them on every listing page. Matching folds the case;
 * nothing is renamed or merged, and a genuinely new value is still created
 * with the casing the librarian typed.
 */
async function findTaxonomyByName(
  supabase: Awaited<ReturnType<typeof requirePermission>>["supabase"],
  table: "categories" | "departments",
  name: string,
): Promise<{ id: string } | null> {
  const { data: exact } = await supabase.from(table).select("id").eq("name", name).maybeSingle();
  if (exact) return exact;

  const { data: folded } = await supabase
    .from(table)
    .select("id, name")
    .ilike("name", likeLiteral(name))
    .limit(5);
  const target = normalizeTaxonomyValue(name);
  const hit = (folded ?? []).find((row: { name: string }) => normalizeTaxonomyValue(row.name) === target);
  return hit ? { id: (hit as { id: string }).id } : null;
}

/**
 * The server's own duplicate refusal — the one that actually prevents a row.
 *
 * The upload form checks before it uploads so a librarian is not made to wait
 * for a 40 MB transfer before being told, but that check is advisory: the
 * client can be stale, raced, or simply not run. This is the same detector,
 * on the same rules, at the moment of insert.
 *
 * Two blocking signals, treated differently on purpose:
 *
 *   * content_hash — byte-identical PDF. Never overridable. The file is
 *     already in the library; a second record of it is not a decision anyone
 *     needs to make. (The partial unique index on book_files.content_hash is
 *     the backstop behind this for two requests that race.)
 *   * isbn — the same registered identifier. Overridable, because a librarian
 *     can be looking at a genuine cataloguing error in the EXISTING record.
 *     The override does not publish: it routes to /admin/review with the
 *     acknowledgement recorded, so a second person sees it.
 */
async function assertNotDuplicate(
  supabase: Awaited<ReturnType<typeof requirePermission>>["supabase"],
  userId: string,
  input: BookInput,
  resolved: { title: string; author: string; year: number },
): Promise<{ status: "published" | "pending_review"; overrodeBookId: string | null }> {
  const requestedStatus = input.status === "pending_review" ? "pending_review" : "published";

  let assessment;
  try {
    assessment = await findBookDuplicates(supabase, {
      title: resolved.title,
      author: resolved.author,
      isbn: input.isbn ?? null,
      publisher: input.publisher ?? null,
      year: resolved.year,
      contentHash: input.contentHash?.trim() || null,
    });
  } catch (error) {
    // A detector that cannot run must not become a detector that says "clean".
    // It also must not take the upload down: the content-hash unique index
    // still stands behind this, so the save proceeds and the failure is loud.
    console.error("[saveBookRecord] duplicate re-check failed:", error);
    return { status: requestedStatus, overrodeBookId: null };
  }

  const top = assessment.top;
  if (!top || !assessment.blocked) return { status: requestedStatus, overrodeBookId: null };

  const overrideId = input.duplicateOverride?.acknowledgedBookId?.trim() ?? "";
  const overrideMatches = UUID_PATTERN.test(overrideId) && overrideId === top.bookId;

  if (top.signals.includes("content_hash")) {
    await logAdminAction(userId, "book.duplicate_blocked", "books", top.bookId, {
      signal: "content_hash",
      confidence: top.confidence,
      score: top.score,
      attemptedTitle: resolved.title,
    });
    throw new Error(
      `This exact PDF is already in the library as "${top.title}". Open that record instead of adding a second copy.`,
    );
  }

  if (!overrideMatches) {
    await logAdminAction(userId, "book.duplicate_blocked", "books", top.bookId, {
      signal: top.signals[0] ?? "isbn",
      confidence: top.confidence,
      score: top.score,
      attemptedTitle: resolved.title,
    });
    throw new Error(
      `ISBN ${input.isbn?.trim()} is already registered to "${top.title}". Correct the ISBN, or confirm this is a different edition to send it for review.`,
    );
  }

  await logAdminAction(userId, "book.duplicate_override", "books", top.bookId, {
    signal: top.signals[0] ?? "isbn",
    confidence: top.confidence,
    score: top.score,
    reason: input.duplicateOverride?.reason ?? "unspecified",
    attemptedTitle: resolved.title,
  });
  // An acknowledged duplicate never goes straight to the public library.
  return { status: "pending_review", overrodeBookId: top.bookId };
}

export async function saveBookRecord(input: BookInput): Promise<{ error: string } | { success: true; slug: string }> {
  try {
  const { supabase, user } = await requirePermission("books", "write");

  const title      = input.title?.trim();
  const author     = input.author?.trim();
  const department = input.department?.trim();
  const category   = input.category?.trim();
  const language   = input.language?.trim();
  const summary    = input.summary?.trim() || "";
  const fileUrl    = input.fileUrl?.trim();

  if (!title)      throw new Error("title is required");
  if (!author)     throw new Error("author is required");
  if (!department) throw new Error("department is required");
  if (!category)   throw new Error("category is required");
  if (!language)   throw new Error("language is required");
  if (!fileUrl)    throw new Error("fileUrl is required");

  const isbn       = input.isbn?.trim() || null;
  const publisher  = input.publisher?.trim() || null;
  const year       = validatedYear(input.year);

  // THE authoritative duplicate refusal. Deliberately before the slug loop and
  // every insert: a blocked save must leave nothing behind.
  const { status: effectiveStatus, overrodeBookId } = await assertNotDuplicate(
    supabase,
    user.id,
    input,
    { title, author, year },
  );
  const pages      = Number(input.pages) || 1;
  const fileSizeKb = Number(input.fileSizeKb) || 0;
  const coverUrl   = input.coverUrl?.trim() || null;

  let slug       = slugify(title);
  const coverColor = pickCoverColor(title);

  let slugIsUnique = false;
  let slugSuffix = 1;
  let checkSlug = slug;

  while (!slugIsUnique) {
    const { data: existingBook } = await supabase
      .from("books")
      .select("id")
      .eq("slug", checkSlug)
      .maybeSingle();

    if (existingBook) {
      checkSlug = `${slug}-${slugSuffix}`;
      slugSuffix++;
    } else {
      slugIsUnique = true;
      slug = checkSlug;
    }
  }

  // Canonical author reuse. A picked id is verified to exist before it is
  // trusted — a client-supplied uuid must never become a foreign key on the
  // word of the client — and anything else falls back to the upsert-by-name
  // path this form has always used.
  let authorId: string | null = null;
  const pickedAuthorId = input.authorId?.trim();
  if (pickedAuthorId && UUID_PATTERN.test(pickedAuthorId)) {
    const { data: picked } = await supabase
      .from("authors")
      .select("id")
      .eq("id", pickedAuthorId)
      .maybeSingle();
    if (picked) authorId = picked.id;
  }
  if (!authorId) {
    const { data: authorRow, error: authorError } = await supabase
      .from("authors")
      .upsert({ name: author }, { onConflict: "name" })
      .select("id")
      .single();
    if (authorError) throw new Error(`Author error: ${authorError.message}`);
    authorId = authorRow.id;
  }

  // Look up existing category first; only insert if not found
  let categoryId: string;
  const providedCategoryId = input.categoryId?.trim();

  if (providedCategoryId) {
    categoryId = providedCategoryId;
  } else {
    const existingCat = await findTaxonomyByName(supabase, "categories", category);

    if (existingCat) {
      categoryId = existingCat.id;
    } else {
      const { data: newCat, error: catInsertErr } = await supabase
        .from("categories")
        .insert({ name: category, slug: slugify(category) })
        .select("id")
        .single();
      if (catInsertErr) {
        // Race condition — retry select
        const { data: retryCat } = await supabase
          .from("categories").select("id").eq("name", category).single();
        if (!retryCat) throw new Error(`Category error: ${catInsertErr.message}`);
        categoryId = retryCat.id;
      } else {
        categoryId = newCat.id;
      }
    }
  }

  // Look up existing department first; only insert if not found
  let departmentId: string;
  const providedDepartmentId = input.departmentId?.trim();

  if (providedDepartmentId) {
    departmentId = providedDepartmentId;
  } else {
    const existingDept = await findTaxonomyByName(supabase, "departments", department);

    if (existingDept) {
      departmentId = existingDept.id;
    } else {
      const { data: newDept, error: deptInsertErr } = await supabase
        .from("departments")
        .insert({ name: department, slug: slugify(department) })
        .select("id")
        .single();
      if (deptInsertErr) {
        const { data: retryDept } = await supabase
          .from("departments").select("id").eq("name", department).single();
        if (!retryDept) return { error: `Department error: ${deptInsertErr.message}` };
        departmentId = retryDept.id;
      } else {
        departmentId = newDept.id;
      }
    }
  }

  const tagsArr = (input.tags ?? "")
    .split(",")
    .map((t: string) => t.trim())
    .filter(Boolean)
    .slice(0, 20);

  const { data: book, error: bookError } = await supabase
    .from("books")
    .insert({
      title,
      slug,
      description:  summary,
      author_id:    authorId,
      category_id:  categoryId,
      department_id: departmentId,
      language,
      published_at: `${year}-01-01`,
      is_published: effectiveStatus !== "pending_review",
      // Only reference the status/license columns (migrations 0061/0062)
      // when actually set — keeps this insert working even pre-migration.
      ...(effectiveStatus === "pending_review" ? { status: "pending_review" } : {}),
      ...(input.license?.trim() ? { license: input.license.trim() } : {}),
      department,
      isbn,
      publisher,
      pages,
      cover_color:  coverColor,
      cover_url:    coverUrl,
      storage_folder: input.storageFolder?.trim() || null,
      // Only written when the client actually decided (migration 0131). An
      // absent key takes the column default — true — so the bulk importer and
      // any older form build keep producing downloadable books, and the insert
      // still works on a database the migration has not reached.
      ...(input.allowDownload === false
        ? {
            allow_download: false,
            download_disabled_reason: input.downloadDisabledReason?.trim() || null,
          }
        : input.allowDownload === true
          ? { allow_download: true, download_disabled_reason: null }
          : {}),
      tags: tagsArr,
    })
    .select("id, slug")
    .single();
  if (bookError) throw new Error(`Book error: ${bookError.message}`);

  const { error: fileError } = await supabase.from("book_files").insert({
    book_id:        book.id,
    format:         "pdf",
    file_url:       fileUrl,
    file_size_kb:   fileSizeKb,
    download_count: 0,
    content_hash:   input.contentHash?.trim() || null,
  });
  if (fileError) {
    // Don't leave a published book row with no file behind
    await supabase.from("books").delete().eq("id", book.id);
    // Unique-index backstop for a duplicate that raced past the upload check
    if (fileError.code === "23505" && fileError.message.includes("content_hash")) {
      throw new Error("This PDF was just uploaded as another book — duplicate file rejected.");
    }
    throw new Error(`File error: ${fileError.message}`);
  }

  await logAdminAction(user.id, "book.create", "books", book.id, {
    title,
    status: effectiveStatus,
    ...(input.allowDownload === false ? { allowDownload: false } : {}),
    ...(overrodeBookId ? { duplicateOf: overrodeBookId } : {}),
  });
  if (effectiveStatus === "pending_review") {
    await createAdminNotification("new_book", `Book submitted for review: "${title}"`, undefined, "/admin/review");
  } else {
    await createAdminNotification("new_book", `New book added: "${title}"`, undefined, `/books/${book.slug}`);
    after(() => notifyNewBookPublished({ id: book.id, title, slug: book.slug }));
  }

  revalidateBook(book.slug, { affectsHome: true });

  // Full-text page indexing (book_pages, migration 0066). Runs after the
  // response is sent so the admin isn't kept waiting on PDF parsing; failures
  // only log — scripts/extract-pdf-text.ts remains the repair safety net.
  after(() => indexPdfPagesSafe("book", book.id, fileUrl));

  return { success: true, slug: book.slug };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// ── deleteBook — also removes PDF + cover from Storage ───────────
export async function deleteBook(bookId: string) {
  const { supabase, user } = await requirePermission("books", "write");

  // ── 1. Fetch book_files + cover_url before deleting ──────────
  const { data: bookFiles } = await supabase
    .from("book_files")
    .select("id, file_url")
    .eq("book_id", bookId);

  const { data: bookData } = await supabase
    .from("books")
    .select("cover_url, slug")
    .eq("id", bookId)
    .single();

  // ── 2. Collect file URLs to delete from storage ──────────────
  const fileUrls: string[] = [];
  for (const f of bookFiles ?? []) {
    if (f.file_url) fileUrls.push(f.file_url);
  }
  if (bookData?.cover_url) fileUrls.push(bookData.cover_url);

  // ── 3. Delete DB records ──────────────────────────────────────
  // Clear dependent logs and relations first to avoid foreign key errors
  const bookFileIds = bookFiles?.map((f) => f.id) || [];
  if (bookFileIds.length > 0) {
    await supabase.from("download_logs").delete().in("book_file_id", bookFileIds);
  }

  await Promise.all([
    supabase.from("view_logs").delete().eq("content_type", "book").eq("content_id", bookId),
    supabase.from("reviews").delete().eq("book_id", bookId),
    supabase.from("saved_books").delete().eq("book_id", bookId),
    supabase.from("reading_progress").delete().eq("book_id", bookId),
    // Full-text page index + chunk embeddings (no FK — polymorphic record_id, migrations 0066/0082)
    supabase.from("book_pages").delete().eq("record_type", "book").eq("record_id", bookId),
    supabase.from("book_chunks").delete().eq("record_type", "book").eq("record_id", bookId),
  ]);

  await supabase.from("book_files").delete().eq("book_id", bookId);
  const { error } = await supabase.from("books").delete().eq("id", bookId);
  if (error) throw new Error(`Delete failed: ${error.message}`);

  // ── 4. Delete files from Zima (non-fatal; no-ops for legacy R2 URLs) ──
  for (const url of fileUrls) {
    await zimaDelete(url).catch(() => null);
  }

  await logAdminAction(user.id, "book.delete", "books", bookId);

  // Include the deleted book's own detail page — leaving it cached would keep
  // serving a page for a record that no longer exists.
  revalidateBook(bookData?.slug, { affectsHome: true });
  revalidatePath("/admin");
  revalidatePath(EBOOKS_BASE_PATH);
}

// ── updateBook — handles cover URL update ────────────────────────
export async function updateBook(bookId: string, formData: FormData) {
  const { supabase, user } = await requirePermission("books", "write");

  const title      = requiredText(formData, "title");
  const author     = requiredText(formData, "author");
  const department = requiredText(formData, "department");
  const category   = requiredText(formData, "category");
  const language   = requiredText(formData, "language");
  const summary    = formData.get("summary")?.toString().trim() || "";

  const isbn      = formData.get("isbn")?.toString().trim() || null;
  const publisher = formData.get("publisher")?.toString().trim() || null;
  const license   = formData.get("license")?.toString().trim() || null;
  const year  = validatedYear(formData.get("year"));
  const pages = Number(formData.get("pages")) || 1;

  // Download policy (migration 0131). The form posts `allowDownload` as "1"/"0"
  // on every submit; a payload without the key at all (an older build, or a
  // caller that only means to change metadata) leaves the librarian's setting
  // exactly as it found it rather than resetting it to "allowed".
  const allowDownloadRaw = formData.get("allowDownload");
  const allowDownload =
    allowDownloadRaw === null ? null : allowDownloadRaw.toString() === "1";
  const downloadReason = formData.get("downloadDisabledReason")?.toString().trim() || null;

  // SEO overrides (migration 0112): blank → null so the builder auto-generates.
  const seoTitle       = formData.get("seo_title")?.toString().trim() || null;
  const seoDescription = formData.get("seo_description")?.toString().trim() || null;
  const ogImage        = formData.get("og_image")?.toString().trim() || null;

  // coverUrl handling:
  //   "__remove__" → set cover_url to null
  //   "https://…"  → set new cover URL
  //   absent/""    → keep existing (don't update cover_url)
  const coverUrlRaw = formData.get("coverUrl")?.toString().trim();
  const coverUpdate: { cover_url?: string | null } = {};
  if (coverUrlRaw === "__remove__") {
    coverUpdate.cover_url = null;
  } else if (coverUrlRaw && coverUrlRaw.startsWith("http")) {
    coverUpdate.cover_url = coverUrlRaw;
  }
  // else: no change to cover_url

  // Same canonical-author rule as the upload form: a verified picked id wins,
  // otherwise upsert by name.
  let editAuthorId: string | null = null;
  const pickedEditAuthorId = formData.get("authorId")?.toString().trim();
  if (pickedEditAuthorId && UUID_PATTERN.test(pickedEditAuthorId)) {
    const { data: picked } = await supabase
      .from("authors")
      .select("id")
      .eq("id", pickedEditAuthorId)
      .maybeSingle();
    if (picked) editAuthorId = picked.id;
  }
  if (!editAuthorId) {
    const { data: authorRow, error: authorError } = await supabase
      .from("authors")
      .upsert({ name: author }, { onConflict: "name" })
      .select("id")
      .single();
    if (authorError) throw new Error(`Author error: ${authorError.message}`);
    editAuthorId = authorRow.id;
  }

  // Look up existing category first; only insert if not found
  let categoryId: string;
  const providedCategoryId = formData.get("categoryId")?.toString().trim();

  if (providedCategoryId) {
    categoryId = providedCategoryId;
  } else {
    const existingCat = await findTaxonomyByName(supabase, "categories", category);

    if (existingCat) {
      categoryId = existingCat.id;
    } else {
      const { data: newCat, error: catInsertErr } = await supabase
        .from("categories")
        .insert({ name: category, slug: slugify(category) })
        .select("id")
        .single();
      if (catInsertErr) {
        const { data: retryCat } = await supabase
          .from("categories").select("id").eq("name", category).single();
        if (!retryCat) throw new Error(`Category error: ${catInsertErr.message}`);
        categoryId = retryCat.id;
      } else {
        categoryId = newCat.id;
      }
    }
  }

  // Look up existing department first; only insert if not found
  let departmentId: string;
  const providedDepartmentId = formData.get("departmentId")?.toString().trim();

  if (providedDepartmentId) {
    departmentId = providedDepartmentId;
  } else {
    const existingDept = await findTaxonomyByName(supabase, "departments", department);

    if (existingDept) {
      departmentId = existingDept.id;
    } else {
      const { data: newDept, error: deptInsertErr } = await supabase
        .from("departments")
        .insert({ name: department, slug: slugify(department) })
        .select("id")
        .single();
      if (deptInsertErr) {
        const { data: retryDept } = await supabase
          .from("departments").select("id").eq("name", department).single();
        if (!retryDept) throw new Error(`Department error: ${deptInsertErr.message}`);
        departmentId = retryDept.id;
      } else {
        departmentId = newDept.id;
      }
    }
  }

  // Previous value, for the audit trail below. `select("allow_download")` on a
  // database without the column errors rather than returning undefined, so the
  // read is tolerated and degrades to "unknown" (null) — which only costs the
  // before/after detail in one audit row, never the update itself.
  let previousAllowDownload: boolean | null = null;
  if (allowDownload !== null) {
    const { data: prev } = await supabase
      .from("books")
      .select("allow_download")
      .eq("id", bookId)
      .maybeSingle();
    previousAllowDownload = (prev?.allow_download as boolean | undefined) ?? null;
  }

  const bookUpdate = {
      title,
      description:  summary,
      author_id:    editAuthorId,
      category_id:  categoryId,
      department_id: departmentId,
      language,
      published_at: `${year}-01-01`,
      department, // keep text column for now during transition
      isbn,
      publisher,
      pages,
      tags: parseTags(formData, "tags"),
      seo_title: seoTitle,
      seo_description: seoDescription,
      og_image: ogImage,
      ...(license ? { license } : {}),
      ...(allowDownload === null
        ? {}
        : {
            allow_download: allowDownload,
            // The restriction message only exists while the restriction does.
            download_disabled_reason: allowDownload ? null : downloadReason,
          }),
      ...coverUpdate, // only included if cover changed/removed
  };

  const runUpdate = (payload: Record<string, unknown>) =>
    supabase.from("books").update(payload).eq("id", bookId).select("id, slug").single();

  let { data: book, error: bookError } = await runUpdate(bookUpdate);

  // A database that has not received 0131 rejects the whole UPDATE. Retry
  // without the two policy columns so ordinary metadata editing survives — but
  // only tell the librarian it worked if they were not actually trying to
  // restrict the book, because silently discarding that decision would leave
  // them believing a download is blocked when it is not.
  if (bookError && (bookError.code === "42703" || bookError.code === "PGRST204")) {
    if (allowDownload === false) {
      throw new Error(
        "Download permission could not be saved: this database has not had migration 0131 applied yet. " +
          "Nothing was changed — apply the migration and try again.",
      );
    }
    const withoutPolicy: Record<string, unknown> = { ...bookUpdate };
    delete withoutPolicy.allow_download;
    delete withoutPolicy.download_disabled_reason;
    ({ data: book, error: bookError } = await runUpdate(withoutPolicy));
  }
  if (bookError) throw new Error(`Book update failed: ${bookError.message}`);
  if (!book) throw new Error("Book update failed: the record no longer exists.");

  await logAdminAction(user.id, "book.update", "books", bookId, { title });

  // A change to who may take the file away is a security-relevant decision, not
  // a metadata edit, so it gets its own audit row with the before/after values.
  // Written only when the value actually moved. `previousAllowDownload` is null
  // only when the column could not be read at all (pre-0131), where there is no
  // transition to report.
  if (
    allowDownload !== null &&
    previousAllowDownload !== null &&
    allowDownload !== previousAllowDownload
  ) {
    await logAdminAction(user.id, "book.download_permission", "books", bookId, {
      title,
      from: previousAllowDownload,
      to: allowDownload,
    });
  }

  revalidateBook(book.slug, { affectsHome: true });
  revalidatePath("/admin");
  revalidatePath(EBOOKS_BASE_PATH);
  redirect(`/books/${book.slug}`);
}

// ── addCategory — create a new category (admin only, bypasses RLS) ──
export async function addCategory(name: string): Promise<{ id?: string; name?: string; error?: string }> {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("books", "write");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Forbidden" };
  }
  const { supabase, user } = admin;

  const trimmed = name.trim();
  if (!trimmed) return { error: "Category name is required" };

  // Check if already exists
  const { data: existing } = await supabase
    .from("categories")
    .select("id, name")
    .eq("name", trimmed)
    .maybeSingle();

  if (existing) return existing;

  // Insert new
  const { data: newCat, error: insertErr } = await supabase
    .from("categories")
    .insert({ name: trimmed, slug: slugify(trimmed) })
    .select("id, name")
    .single();

  if (insertErr) {
    // Race condition — retry select
    const { data: retryCat } = await supabase
      .from("categories")
      .select("id, name")
      .eq("name", trimmed)
      .single();
    if (retryCat) return retryCat;
    return { error: `Failed to add category: ${insertErr.message}` };
  }

  await logAdminAction(user.id, "category.create", "categories", newCat.id, { name: newCat.name });

  return newCat;
}

// ── addDepartment — create a new department (admin only, bypasses RLS) ──
export async function addDepartment(name: string): Promise<{ id?: string; name?: string; error?: string }> {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("books", "write");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Forbidden" };
  }
  const { supabase, user } = admin;

  const trimmed = name.trim();
  if (!trimmed) return { error: "Department name is required" };

  // Check if already exists
  const { data: existing } = await supabase
    .from("departments")
    .select("id, name")
    .eq("name", trimmed)
    .maybeSingle();

  if (existing) return existing;

  // Insert new
  const { data: newDept, error: insertErr } = await supabase
    .from("departments")
    .insert({ name: trimmed, slug: slugify(trimmed) })
    .select("id, name")
    .single();

  if (insertErr) {
    const { data: retryDept } = await supabase
      .from("departments")
      .select("id, name")
      .eq("name", trimmed)
      .single();
    if (retryDept) return retryDept;
    return { error: `Failed to add department: ${insertErr.message}` };
  }

  await logAdminAction(user.id, "department.create", "departments", newDept.id, { name: newDept.name });

  return newDept;
}

// ── Taxonomy Management (Update & Delete) ──────────────────────────

export async function updateCategory(id: string, newName: string): Promise<{ success?: boolean; error?: string }> {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("books", "write");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Forbidden" };
  }
  const { supabase, user } = admin;

  const trimmed = newName.trim();
  if (!trimmed) return { error: "Category name is required" };

  // Check for duplicates
  const { data: existing } = await supabase.from("categories").select("id").eq("name", trimmed).neq("id", id).maybeSingle();
  if (existing) return { error: "A category with this name already exists" };

  const { error } = await supabase.from("categories").update({ name: trimmed, slug: slugify(trimmed) }).eq("id", id);
  if (error) return { error: `Failed to update category: ${error.message}` };

  await logAdminAction(user.id, "category.update", "categories", id, { newName: trimmed });
  revalidatePath("/admin");
  return { success: true };
}

export async function deleteCategory(id: string): Promise<{ success?: boolean; error?: string }> {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("books", "write");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Forbidden" };
  }
  const { supabase, user } = admin;

  // Check if any book is using this category
  const { count, error: countErr } = await supabase.from("books").select("id", { count: "exact", head: true }).eq("category_id", id);
  if (countErr) return { error: countErr.message };
  if (count && count > 0) return { error: `Cannot delete this category because it is used by ${count} book(s).` };

  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) return { error: `Failed to delete category: ${error.message}` };

  await logAdminAction(user.id, "category.delete", "categories", id);
  revalidatePath("/admin");
  return { success: true };
}

export async function updateDepartment(id: string, newName: string): Promise<{ success?: boolean; error?: string }> {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("books", "write");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Forbidden" };
  }
  const { supabase, user } = admin;

  const trimmed = newName.trim();
  if (!trimmed) return { error: "Department name is required" };

  // Check for duplicates
  const { data: existing } = await supabase.from("departments").select("id").eq("name", trimmed).neq("id", id).maybeSingle();
  if (existing) return { error: "A department with this name already exists" };

  const { error } = await supabase.from("departments").update({ name: trimmed, slug: slugify(trimmed) }).eq("id", id);
  if (error) return { error: `Failed to update department: ${error.message}` };

  // Also update text column in books for backward compatibility
  await supabase.from("books").update({ department: trimmed }).eq("department_id", id);

  await logAdminAction(user.id, "department.update", "departments", id, { newName: trimmed });
  revalidatePath("/admin");
  return { success: true };
}

export async function deleteDepartment(id: string): Promise<{ success?: boolean; error?: string }> {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("books", "write");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Forbidden" };
  }
  const { supabase, user } = admin;

  // Check if any book is using this department
  const { count, error: countErr } = await supabase.from("books").select("id", { count: "exact", head: true }).eq("department_id", id);
  if (countErr) return { error: countErr.message };
  if (count && count > 0) return { error: `Cannot delete this department because it is used by ${count} book(s).` };

  const { error } = await supabase.from("departments").delete().eq("id", id);
  if (error) return { error: `Failed to delete department: ${error.message}` };

  await logAdminAction(user.id, "department.delete", "departments", id);
  revalidatePath("/admin");
  return { success: true };
}
