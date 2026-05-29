"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/books";

function requiredText(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

export async function uploadBook(formData: FormData) {
  const supabase = await createClient();

  // ── 1. Auth check — admin only ────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") throw new Error("Admin access required");

  // ── 2. Validate PDF file ──────────────────────────────────────
  const file = formData.get("pdf");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("A PDF file is required");
  }
  if (file.type !== "application/pdf") {
    throw new Error("Only PDF files can be uploaded");
  }

  // ── 3. Validate fields ────────────────────────────────────────
  const title      = requiredText(formData, "title");
  const author     = requiredText(formData, "author");
  const department = requiredText(formData, "department");
  const category   = requiredText(formData, "category");
  const language   = requiredText(formData, "language");
  const summary    = requiredText(formData, "summary");
  const isbn       = formData.get("isbn")?.toString().trim() || null;
  const year       = Number(formData.get("year"))  || new Date().getFullYear();
  const pages      = Number(formData.get("pages")) || 1;
  const slug       = slugify(title);

  // ── 4. Upload PDF → Supabase Storage ─────────────────────────
  const fileName    = `${Date.now()}-${slug}.pdf`;
  const storagePath = `pdfs/${fileName}`;
  const bytes       = await file.arrayBuffer();

  const { error: storageError } = await supabase.storage
    .from("book-files")
    .upload(storagePath, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (storageError) {
    throw new Error(`Upload failed: ${storageError.message}`);
  }

  const { data: urlData } = supabase.storage
    .from("book-files")
    .getPublicUrl(storagePath);

  const fileUrl = urlData.publicUrl;

  // ── 5. Upsert author ──────────────────────────────────────────
  const { data: authorRow, error: authorError } = await supabase
    .from("authors")
    .upsert({ name: author }, { onConflict: "name" })
    .select("id")
    .single();

  if (authorError) throw new Error(`Author error: ${authorError.message}`);

  // ── 6. Upsert category ────────────────────────────────────────
  const { data: categoryRow, error: catError } = await supabase
    .from("categories")
    .upsert(
      { name: category, slug: slugify(category) },
      { onConflict: "slug" }
    )
    .select("id")
    .single();

  if (catError) throw new Error(`Category error: ${catError.message}`);

  // ── 7. Insert book ────────────────────────────────────────────
  const { data: book, error: bookError } = await supabase
    .from("books")
    .insert({
      title,
      slug,
      description:  summary,
      author_id:    authorRow.id,
      category_id:  categoryRow.id,
      language,
      published_at: `${year}-01-01`,
      is_published: true,
    })
    .select("id, slug")
    .single();

  if (bookError) throw new Error(`Book error: ${bookError.message}`);

  // ── 8. Insert book_file ───────────────────────────────────────
  const { error: fileError } = await supabase
    .from("book_files")
    .insert({
      book_id:        book.id,
      format:         "pdf",
      file_url:       fileUrl,
      file_size_kb:   Math.round(file.size / 1024),
      download_count: 0,
    });

  if (fileError) throw new Error(`File record error: ${fileError.message}`);

  // ── 9. Revalidate + redirect ──────────────────────────────────
  revalidatePath("/");
  revalidatePath("/books");
  revalidatePath(`/books/${book.slug}`);

  redirect(`/books/${book.slug}`);
}

// ── Delete book (admin only) ──────────────────────────────────────
export async function deleteBook(bookId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") throw new Error("Admin access required");

  // Delete book_files first (FK constraint)
  await supabase.from("book_files").delete().eq("book_id", bookId);

  // Delete book
  const { error } = await supabase.from("books").delete().eq("id", bookId);
  if (error) throw new Error(`Delete failed: ${error.message}`);

  revalidatePath("/books");
  revalidatePath("/admin");
}