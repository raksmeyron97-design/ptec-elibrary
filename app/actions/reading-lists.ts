"use server";

import { createClient } from "@/lib/supabase/server";
import {
  revalidateLocalizedPath as revalidatePath,
  revalidateUserWorkspace,
} from "@/lib/cache/revalidate";

/**
 * A reading list is a research collection: it holds books, theses and
 * publications together, because that is what one topic actually looks like.
 * Items live in `reading_list_items` (migration 0136), polymorphic over
 * `(record_type, record_id)`; the older books-only `reading_list_books` is
 * still read by nothing here and is retired in a later migration.
 */
export type ResourceRecordType = "book" | "research" | "publication";

export interface ReadingList {
  id: string;
  user_id: string;
  name: string;
  /** What the collection is for. Free text, optional. */
  topic: string | null;
  description: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  book_count?: number;
}

/** One saved resource, optionally anchored to a page with a note. */
export interface ReadingListItem {
  id: string;
  list_id: string;
  record_type: ResourceRecordType;
  record_id: string;
  page_number: number | null;
  note: string | null;
  added_at: string;
  /** Resolved for display; absent when the resource was unpublished. */
  resource?: {
    title: string;
    slug: string;
    author: string;
    url: string;
    coverUrl: string | null;
    coverColor: string | null;
  };
}

// ── Create a new list ─────────────────────────────────────────
export async function createReadingList(
  name: string,
  description?: string,
  isPublic = false,
  topic?: string,
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  if (!name.trim()) return { error: "List name is required." };
  if (name.length > 80) return { error: "Name too long (max 80 characters)." };

  const row: Record<string, unknown> = {
    user_id: user.id,
    name: name.trim(),
    description: description?.trim() || null,
    is_public: isPublic,
  };
  if (topic?.trim()) row.topic = topic.trim();

  let { data, error } = await supabase.from("reading_lists").insert(row).select("id").single();
  // A database without 0136 has no `topic` column; the list is still worth
  // creating without it.
  if (error && (error.code === "42703" || error.code === "PGRST204") && row.topic) {
    delete row.topic;
    ({ data, error } = await supabase.from("reading_lists").insert(row).select("id").single());
  }

  if (error || !data) return { error: "Failed to create list." };
  revalidateUserWorkspace();
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

  const { data: counts } = await supabase
    .from("reading_list_items")
    .select("list_id")
    .in("list_id", lists.map((l) => l.id));

  const countMap: Record<string, number> = {};
  for (const row of counts ?? []) {
    countMap[row.list_id] = (countMap[row.list_id] ?? 0) + 1;
  }

  return lists.map((l) => ({ topic: null, ...l, book_count: countMap[l.id] ?? 0 })) as ReadingList[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */

const RESOURCE_TABLE: Record<ResourceRecordType, string> = {
  book: "books",
  research: "research_reports",
  // The view, not the base table: `author_names` is computed there (0114) and
  // selecting it from `publications` fails the whole query.
  publication: "publications_with_stats",
};

const RESOURCE_ROUTE: Record<ResourceRecordType, string> = {
  book: "/books",
  research: "/theses",
  publication: "/publications",
};

/**
 * Resolve saved items to something renderable. One query per type, and an
 * item whose resource is missing or unpublished simply carries no `resource`
 * — the row stays, so a temporarily-unpublished book does not silently
 * vanish from a student's collection.
 */
async function hydrateItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: any[],
): Promise<ReadingListItem[]> {
  const byType = new Map<ResourceRecordType, string[]>();
  for (const r of rows) {
    const type = r.record_type as ResourceRecordType;
    if (!RESOURCE_TABLE[type]) continue;
    byType.set(type, [...(byType.get(type) ?? []), r.record_id]);
  }

  const meta = new Map<string, ReadingListItem["resource"]>();
  await Promise.all(
    [...byType.entries()].map(async ([type, ids]) => {
      const select =
        type === "book"
          ? "id, title, slug, cover_url, cover_color, authors ( name )"
          : "id, title, slug, cover_url, author_names";
      const { data } = await supabase
        .from(RESOURCE_TABLE[type])
        .select(select)
        .in("id", [...new Set(ids)])
        .eq("is_published", true);
      for (const row of (data ?? []) as any[]) {
        const ref = row.slug ?? row.id;
        meta.set(`${type}:${row.id}`, {
          title: row.title,
          slug: ref,
          author: row.authors?.name ?? row.author_names ?? "Unknown",
          url: `${RESOURCE_ROUTE[type]}/${ref}`,
          coverUrl: row.cover_url ?? null,
          coverColor: row.cover_color ?? null,
        });
      }
    }),
  );

  return rows.map((r) => ({
    id: r.id,
    list_id: r.list_id,
    record_type: r.record_type,
    record_id: r.record_id,
    page_number: r.page_number ?? null,
    note: r.note ?? null,
    added_at: r.added_at,
    resource: meta.get(`${r.record_type}:${r.record_id}`),
  }));
}

// ── Get a single list with its items (public or owner) ────────
export async function getReadingList(
  id: string,
): Promise<{ list: ReadingList; items: ReadingListItem[] } | null> {
  const supabase = await createClient();

  const { data: list } = await supabase
    .from("reading_lists")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!list) return null;

  const { data: rows } = await supabase
    .from("reading_list_items")
    .select("id, list_id, record_type, record_id, page_number, note, added_at")
    .eq("list_id", id)
    .order("added_at", { ascending: false });

  const items = await hydrateItems(supabase, (rows ?? []) as any[]);
  return { list: { topic: null, ...(list as any) } as ReadingList, items };
}

/** Verify the caller owns the list before any write to its items. */
async function ownedList(
  supabase: Awaited<ReturnType<typeof createClient>>,
  listId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("reading_lists")
    .select("id")
    .eq("id", listId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

// ── Add any resource to a list ────────────────────────────────
export async function addItemToList(
  listId: string,
  recordType: ResourceRecordType,
  recordId: string,
  options: { page?: number; note?: string } = {},
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!RESOURCE_TABLE[recordType]) return { error: "Unknown resource type." };
  if (!(await ownedList(supabase, listId, user.id))) return { error: "List not found." };

  const { error } = await supabase.from("reading_list_items").insert({
    list_id: listId,
    record_type: recordType,
    record_id: recordId,
    page_number: options.page ?? null,
    note: options.note?.trim() || null,
  });

  if (error?.code === "23505") return { error: "already_in_list" };
  if (error) return { error: "Failed to save." };

  revalidateUserWorkspace(listId);
  return { success: true };
}

export async function removeItemFromList(
  listId: string,
  recordType: ResourceRecordType,
  recordId: string,
  page?: number,
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!(await ownedList(supabase, listId, user.id))) return { error: "List not found." };

  let query = supabase
    .from("reading_list_items")
    .delete()
    .eq("list_id", listId)
    .eq("record_type", recordType)
    .eq("record_id", recordId);
  query = page === undefined ? query.is("page_number", null) : query.eq("page_number", page);
  await query;

  revalidateUserWorkspace(listId);
  return { success: true };
}

/** Edit the note on one saved item. */
export async function updateItemNote(itemId: string, note: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (note.length > 5_000) return { error: "Note too long." };

  const { data: item } = await supabase
    .from("reading_list_items")
    .select("list_id")
    .eq("id", itemId)
    .maybeSingle();
  if (!item || !(await ownedList(supabase, (item as any).list_id, user.id))) {
    return { error: "Item not found." };
  }

  const { error } = await supabase
    .from("reading_list_items")
    .update({ note: note.trim() || null })
    .eq("id", itemId);
  if (error) return { error: "Failed to save note." };

  revalidateUserWorkspace((item as any).list_id);
  return { success: true };
}

/** Which of the caller's lists already hold this resource. */
export async function getListsContainingItem(
  recordType: ResourceRecordType,
  recordId: string,
): Promise<string[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: userLists } = await supabase
    .from("reading_lists")
    .select("id")
    .eq("user_id", user.id);
  if (!userLists?.length) return [];

  const { data } = await supabase
    .from("reading_list_items")
    .select("list_id")
    .eq("record_type", recordType)
    .eq("record_id", recordId)
    .in("list_id", userLists.map((l) => l.id));

  return (data ?? []).map((r) => r.list_id);
}

// ── Book-shaped wrappers, so existing call sites keep working ─
export async function addBookToList(listId: string, bookId: string) {
  return addItemToList(listId, "book", bookId);
}

export async function removeBookFromList(listId: string, bookId: string) {
  return removeItemFromList(listId, "book", bookId);
}

export async function getListsContainingBook(bookId: string): Promise<string[]> {
  return getListsContainingItem("book", bookId);
}

/**
 * Save a source straight from an answer, without making the reader pick a
 * list first. The destination is their default collection, created on demand
 * — a citation is worth keeping at the moment it is read, and a modal between
 * the two is how it gets lost.
 */
export async function saveSourceToResearch(
  recordType: ResourceRecordType,
  recordId: string,
  options: { page?: number; note?: string; listName?: string } = {},
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const name = options.listName?.trim() || "My research";
  const { data: existing } = await supabase
    .from("reading_lists")
    .select("id")
    .eq("user_id", user.id)
    .eq("name", name)
    .maybeSingle();

  let listId = (existing as any)?.id as string | undefined;
  if (!listId) {
    const created = await createReadingList(name);
    if (!created.success || !created.id) return { error: "Failed to create collection." };
    listId = created.id;
  }
  if (!listId) return { error: "Failed to create collection." };

  const result = await addItemToList(listId, recordType, recordId, options);
  return result.error ? result : { success: true as const, listId };
}
