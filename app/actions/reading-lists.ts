"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidateLocalizedPath as revalidatePath } from "@/lib/cache/revalidate";

export interface ReadingList {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  book_count?: number;
}

export interface ReadingListBook {
  id: string;
  list_id: string;
  book_id: string;
  added_at: string;
  books?: {
    id: string;
    title: string;
    slug: string;
    cover_url: string | null;
    cover_color: string | null;
    authors: { name: string } | null;
    categories: { name: string } | null;
  };
}

// ── Create a new list ─────────────────────────────────────────
export async function createReadingList(name: string, description?: string, isPublic = false) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  if (!name.trim()) return { error: "List name is required." };
  if (name.length > 80) return { error: "Name too long (max 80 characters)." };

  const { data, error } = await supabase
    .from("reading_lists")
    .insert({ user_id: user.id, name: name.trim(), description: description?.trim() || null, is_public: isPublic })
    .select("id")
    .single();

  if (error) return { error: "Failed to create list." };
  revalidatePath("/dashboard");
  return { success: true, id: data.id };
}

// ── Update list metadata ──────────────────────────────────────
export async function updateReadingList(id: string, name: string, description?: string, isPublic?: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("reading_lists")
    .update({ name: name.trim(), description: description?.trim() || null, is_public: isPublic })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: "Failed to update list." };
  revalidatePath("/dashboard");
  revalidatePath(`/lists/${id}`);
  return { success: true };
}

// ── Delete a list ─────────────────────────────────────────────
export async function deleteReadingList(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("reading_lists")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: "Failed to delete list." };
  revalidatePath("/dashboard");
  return { success: true };
}

// ── Get user's own lists ──────────────────────────────────────
export async function getMyReadingLists(): Promise<ReadingList[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: lists } = await supabase
    .from("reading_lists")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (!lists) return [];

  // Attach book counts
  const { data: counts } = await supabase
    .from("reading_list_books")
    .select("list_id")
    .in("list_id", lists.map((l) => l.id));

  const countMap: Record<string, number> = {};
  for (const row of counts ?? []) {
    countMap[row.list_id] = (countMap[row.list_id] ?? 0) + 1;
  }

  return lists.map((l) => ({ ...l, book_count: countMap[l.id] ?? 0 })) as ReadingList[];
}

// ── Get a single list with books (public or owner) ────────────
export async function getReadingList(id: string): Promise<{ list: ReadingList; books: ReadingListBook[] } | null> {
  const supabase = await createClient();

  const { data: list } = await supabase
    .from("reading_lists")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!list) return null;

  const { data: books } = await supabase
    .from("reading_list_books")
    .select(`
      id, list_id, book_id, added_at,
      books ( id, title, slug, cover_url, cover_color,
        authors ( name ), categories ( name ) )
    `)
    .eq("list_id", id)
    .order("added_at", { ascending: false });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { list: list as ReadingList, books: (books ?? []) as any as ReadingListBook[] };
}

// ── Add book to a list ────────────────────────────────────────
export async function addBookToList(listId: string, bookId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Verify ownership
  const { data: list } = await supabase
    .from("reading_lists")
    .select("id")
    .eq("id", listId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!list) return { error: "List not found." };

  const { error } = await supabase
    .from("reading_list_books")
    .insert({ list_id: listId, book_id: bookId });

  if (error?.code === "23505") return { error: "already_in_list" };
  if (error) return { error: "Failed to add book." };

  revalidatePath("/dashboard");
  return { success: true };
}

// ── Remove book from a list ───────────────────────────────────
export async function removeBookFromList(listId: string, bookId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  await supabase
    .from("reading_list_books")
    .delete()
    .eq("list_id", listId)
    .eq("book_id", bookId);

  revalidatePath("/dashboard");
  revalidatePath(`/lists/${listId}`);
  return { success: true };
}

// ── Check which lists contain a given book (for current user) ─
export async function getListsContainingBook(bookId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: userLists } = await supabase
    .from("reading_lists")
    .select("id")
    .eq("user_id", user.id);

  if (!userLists?.length) return [];

  const { data } = await supabase
    .from("reading_list_books")
    .select("list_id")
    .eq("book_id", bookId)
    .in("list_id", userLists.map((l) => l.id));

  return (data ?? []).map((r) => r.list_id);
}
