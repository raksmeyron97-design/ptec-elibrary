/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

// app/actions/saved-books.ts
import { revalidateLocalizedPath as revalidatePath } from "@/lib/cache/revalidate";
import { createClient, createServiceClient } from "@/lib/supabase/server";

// ── Toggle save/unsave ────────────────────────────────────────
export async function toggleSaveBook(bookId: string, bookSlug: string) {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const supabase = createServiceClient();

  // Check if already saved
  const { data: existing } = await supabase
    .from("saved_books")
    .select("id")
    .eq("user_id", user.id)
    .eq("book_id", bookId)
    .maybeSingle();

  if (existing) {
    // Unsave
    await supabase
      .from("saved_books")
      .delete()
      .eq("id", existing.id);
  } else {
    // Save
    await supabase
      .from("saved_books")
      .insert({ user_id: user.id, book_id: bookId });
  }

  revalidatePath(`/books/${bookSlug}`);
  revalidatePath("/dashboard");

  return { saved: !existing };
}

// ── Check if a book is saved by current user ─────────────────
export async function isBookSaved(bookId: string): Promise<boolean> {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return false;

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("saved_books")
    .select("id")
    .eq("user_id", user.id)
    .eq("book_id", bookId)
    .maybeSingle();

  return !!data;
}

// ── Fetch all saved books for current user ────────────────────
export async function getSavedBooks() {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return [];

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("saved_books")
    .select(`
      id,
      created_at,
      books (
        id, title, slug, description, cover_url, cover_color,
        department, language, pages, rating,
        authors ( name ),
        categories ( name ),
        book_files ( format, file_url )
      )
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (data ?? []).map((row: any) => {
    const b = row.books;
    const pdfFile = b?.book_files?.find((f: any) => f.format === "pdf");
    return {
      savedId:    row.id,
      savedAt:    row.created_at,
      id:         b.id,
      title:      b.title,
      slug:       b.slug,
      author:     b.authors?.name ?? "Unknown",
      category:   b.categories?.name ?? "General",
      department: b.department ?? "General",
      language:   b.language ?? "English",
      summary:    b.description ?? "",
      cover:      b.cover_color ?? "bg-blue-950",
      coverUrl:   b.cover_url ?? null,
      rating:     Number(b.rating) || 0,
      pages:      b.pages ?? 1,
      pdfUrl:     pdfFile?.file_url ?? null,
      format:     "PDF",
      isbn:       "N/A",
      year:       new Date().getFullYear(),
      availability: "Digital" as const,
      tags:       [],
    };
  });
}