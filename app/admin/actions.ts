"use server";

// app/admin/actions.ts
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/books";

function requiredText(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

const coverColors = [
  "bg-[#0f766e]", "bg-[#2563eb]", "bg-[#7c3aed]", "bg-[#16a34a]",
  "bg-[#db2777]", "bg-[#0891b2]", "bg-[#ca8a04]", "bg-[#ea580c]",
  "bg-[#dc2626]", "bg-[#4f46e5]",
];

function pickCoverColor(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  return coverColors[Math.abs(hash) % coverColors.length];
}

// ── Helper: extract Storage path from a public URL ────────────────
// e.g. "https://xxx.supabase.co/storage/v1/object/public/book-files/covers/123.jpg"
// → "covers/123.jpg"
function storagePathFromUrl(publicUrl: string): string | null {
  try {
    const url = new URL(publicUrl);
    // pathname looks like: /storage/v1/object/public/book-files/covers/123.jpg
    const marker = "/object/public/book-files/";
    const idx = url.pathname.indexOf(marker);
    if (idx === -1) return null;
    return decodeURIComponent(url.pathname.slice(idx + marker.length));
  } catch {
    return null;
  }
}

// ── saveBookRecord ────────────────────────────────────────────────
export async function saveBookRecord(formData: FormData) {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const supabase = createServiceClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") throw new Error("Admin access required");

  const title      = requiredText(formData, "title");
  const author     = requiredText(formData, "author");
  const department = requiredText(formData, "department");
  const category   = requiredText(formData, "category");
  const language   = requiredText(formData, "language");
  const summary    = requiredText(formData, "summary");
  const fileUrl    = requiredText(formData, "fileUrl");

  const isbn       = formData.get("isbn")?.toString().trim() || null;
  const year       = Number(formData.get("year"))  || new Date().getFullYear();
  const pages      = Number(formData.get("pages")) || 1;
  const fileSizeKb = Number(formData.get("fileSizeKb")) || 0;
  const coverUrl   = formData.get("coverUrl")?.toString().trim() || null;

  const slug       = slugify(title);
  const coverColor = pickCoverColor(title);

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

  const { data: book, error: bookError } = await supabase
    .from("books")
    .insert({
      title,
      slug,
      description:  summary,
      author_id:    authorRow.id,
      category_id:  categoryId,
      language,
      published_at: `${year}-01-01`,
      is_published: true,
      department,
      isbn,
      pages,
      cover_color:  coverColor,
      cover_url:    coverUrl,
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
  });
  if (fileError) throw new Error(`File error: ${fileError.message}`);

  revalidatePath("/");
  revalidatePath("/books");
  revalidatePath(`/books/${book.slug}`);
  redirect(`/books/${book.slug}`);
}

// ── deleteBook — also removes PDF + cover from Storage ───────────
export async function deleteBook(bookId: string) {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") throw new Error("Admin access required");

  // ── 1. Fetch book_files + cover_url before deleting ──────────
  const { data: bookFiles } = await supabase
    .from("book_files")
    .select("file_url")
    .eq("book_id", bookId);

  const { data: bookData } = await supabase
    .from("books")
    .select("cover_url")
    .eq("id", bookId)
    .single();

  // ── 2. Collect Storage paths to delete ───────────────────────
  const storagePaths: string[] = [];

  for (const f of bookFiles ?? []) {
    if (f.file_url) {
      const p = storagePathFromUrl(f.file_url);
      if (p) storagePaths.push(p);
    }
  }

  if (bookData?.cover_url) {
    const p = storagePathFromUrl(bookData.cover_url);
    if (p) storagePaths.push(p);
  }

  // ── 3. Delete DB records ──────────────────────────────────────
  await supabase.from("book_files").delete().eq("book_id", bookId);
  const { error } = await supabase.from("books").delete().eq("id", bookId);
  if (error) throw new Error(`Delete failed: ${error.message}`);

  // ── 4. Delete files from Storage (non-fatal if they fail) ────
  if (storagePaths.length > 0) {
    const { error: storageErr } = await supabase.storage
      .from("book-files")
      .remove(storagePaths);
    if (storageErr) {
      console.warn("Storage cleanup warning:", storageErr.message);
      // Don't throw — DB is already clean, storage failure is non-critical
    }
  }

  revalidatePath("/books");
  revalidatePath("/admin");
  revalidatePath("/admin/manage");
}

// ── updateBook — handles cover URL update ────────────────────────
export async function updateBook(bookId: string, formData: FormData) {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const supabase = createServiceClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") throw new Error("Admin access required");

  const title      = requiredText(formData, "title");
  const author     = requiredText(formData, "author");
  const department = requiredText(formData, "department");
  const category   = requiredText(formData, "category");
  const language   = requiredText(formData, "language");
  const summary    = requiredText(formData, "summary");

  const isbn  = formData.get("isbn")?.toString().trim() || null;
  const year  = Number(formData.get("year"))  || new Date().getFullYear();
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

  const { data: book, error: bookError } = await supabase
    .from("books")
    .update({
      title,
      description:  summary,
      author_id:    authorRow.id,
      category_id:  categoryId,
      language,
      published_at: `${year}-01-01`,
      department,
      isbn,
      pages,
      ...coverUpdate, // only included if cover changed/removed
    })
    .eq("id", bookId)
    .select("id, slug")
    .single();
  if (bookError) throw new Error(`Book update failed: ${bookError.message}`);

  revalidatePath("/");
  revalidatePath("/books");
  revalidatePath(`/books/${book.slug}`);
  revalidatePath("/admin");
  revalidatePath("/admin/manage");
  redirect(`/books/${book.slug}`);
}

// ── addCategory — create a new category (admin only, bypasses RLS) ──
export async function addCategory(name: string): Promise<{ id: string; name: string } | null> {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") throw new Error("Admin access required");

  const trimmed = name.trim();
  if (!trimmed) throw new Error("Category name is required");

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
    throw new Error(`Failed to add category: ${insertErr.message}`);
  }

  return newCat;
}