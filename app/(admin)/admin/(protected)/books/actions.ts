"use server";

// app/admin/books/actions.ts
import { revalidateLocalizedPath as revalidatePath, revalidateBook } from "@/lib/cache/revalidate";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { slugify } from "@/lib/books";
import { zimaDelete } from "@/lib/zima";
import { logAdminAction } from "@/app/actions/audit";
import { createAdminNotification } from "@/lib/admin-notifications";
import { indexPdfPagesSafe } from "@/lib/pdf-page-index";
import { notifyNewBookPublished } from "@/lib/push-events";

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
  /** "published" (default) goes live immediately; "pending_review" waits in /admin/review */
  status?: "published" | "pending_review";
  license?: string;
}

export async function saveBookRecord(input: BookInput): Promise<{ error: string } | { success: true; slug: string }> {
  try {
  const { supabase, user } = await requireAdmin();

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

  const { data: authorRow, error: authorError } = await supabase
    .from("authors")
    .upsert({ name: author }, { onConflict: "name" })
    .select("id")
    .single();
  if (authorError) throw new Error(`Author error: ${authorError.message}`);

  // Look up existing category first; only insert if not found
  let categoryId: string;
  const providedCategoryId = input.categoryId?.trim();

  if (providedCategoryId) {
    categoryId = providedCategoryId;
  } else {
    const { data: existingCat } = await supabase
      .from("categories")
      .select("id")
      .eq("name", category)
      .maybeSingle();

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
    const { data: existingDept } = await supabase
      .from("departments")
      .select("id")
      .eq("name", department)
      .maybeSingle();

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
      author_id:    authorRow.id,
      category_id:  categoryId,
      department_id: departmentId,
      language,
      published_at: `${year}-01-01`,
      is_published: input.status !== "pending_review",
      // Only reference the status/license columns (migrations 0061/0062)
      // when actually set — keeps this insert working even pre-migration.
      ...(input.status === "pending_review" ? { status: "pending_review" } : {}),
      ...(input.license?.trim() ? { license: input.license.trim() } : {}),
      department,
      isbn,
      publisher,
      pages,
      cover_color:  coverColor,
      cover_url:    coverUrl,
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

  await logAdminAction(user.id, "book.create", "books", book.id, { title, status: input.status ?? "published" });
  if (input.status === "pending_review") {
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
  const { supabase, user } = await requireAdmin();

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
  revalidatePath("/admin/manage");
}

// ── updateBook — handles cover URL update ────────────────────────
export async function updateBook(bookId: string, formData: FormData) {
  const { supabase, user } = await requireAdmin();

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

  const { data: authorRow, error: authorError } = await supabase
    .from("authors")
    .upsert({ name: author }, { onConflict: "name" })
    .select("id")
    .single();
  if (authorError) throw new Error(`Author error: ${authorError.message}`);

  // Look up existing category first; only insert if not found
  let categoryId: string;
  const providedCategoryId = formData.get("categoryId")?.toString().trim();

  if (providedCategoryId) {
    categoryId = providedCategoryId;
  } else {
    const { data: existingCat } = await supabase
      .from("categories")
      .select("id")
      .eq("name", category)
      .maybeSingle();

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
    const { data: existingDept } = await supabase
      .from("departments")
      .select("id")
      .eq("name", department)
      .maybeSingle();

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

  const { data: book, error: bookError } = await supabase
    .from("books")
    .update({
      title,
      description:  summary,
      author_id:    authorRow.id,
      category_id:  categoryId,
      department_id: departmentId,
      language,
      published_at: `${year}-01-01`,
      department, // keep text column for now during transition
      isbn,
      publisher,
      pages,
      tags: parseTags(formData, "tags"),
      ...(license ? { license } : {}),
      ...coverUpdate, // only included if cover changed/removed
    })
    .eq("id", bookId)
    .select("id, slug")
    .single();
  if (bookError) throw new Error(`Book update failed: ${bookError.message}`);

  await logAdminAction(user.id, "book.update", "books", bookId, { title });

  revalidateBook(book.slug, { affectsHome: true });
  revalidatePath("/admin");
  revalidatePath("/admin/manage");
  redirect(`/books/${book.slug}`);
}

// ── addCategory — create a new category (admin only, bypasses RLS) ──
export async function addCategory(name: string): Promise<{ id?: string; name?: string; error?: string }> {
  let admin: Awaited<ReturnType<typeof requireAdmin>>;
  try {
    admin = await requireAdmin();
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
  let admin: Awaited<ReturnType<typeof requireAdmin>>;
  try {
    admin = await requireAdmin();
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
  let admin: Awaited<ReturnType<typeof requireAdmin>>;
  try {
    admin = await requireAdmin();
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
  let admin: Awaited<ReturnType<typeof requireAdmin>>;
  try {
    admin = await requireAdmin();
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
  let admin: Awaited<ReturnType<typeof requireAdmin>>;
  try {
    admin = await requireAdmin();
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
  let admin: Awaited<ReturnType<typeof requireAdmin>>;
  try {
    admin = await requireAdmin();
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
