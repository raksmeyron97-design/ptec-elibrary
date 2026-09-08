"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Highlights and notes on a book's pages (migration 0047).
 *
 * EVERY MUTATION HERE REPORTS WHETHER A ROW ACTUALLY CHANGED. These run
 * through the RLS-bypassing service client, so `.eq("user_id", user.id)` is
 * the only thing scoping them to their owner — which it does correctly, and
 * which is why this was never a cross-user WRITE. What it was is a
 * cross-user LIE: a delete or update that matches no rows is not an error in
 * PostgREST, it succeeds having done nothing, so `{ success: !error }`
 * answered "saved" to a request that changed nothing at all. Someone else's
 * annotation id, an id already deleted in another tab, a stale list after a
 * sign-out — all three reported success, and the client then removed the row
 * from the panel or showed the new note, leaving the screen disagreeing with
 * the database until a reload.
 *
 * Each write below asks for the affected rows back and answers on the count.
 */

export type Annotation = {
  id: string;
  page_number: number;
  selected_text: string;
  note_content: string;
  highlight_color: "yellow" | "green" | "blue" | "pink";
  created_at: string;
};

/** A note is a margin note, not a document. The cap is generous and exists so
    a scripted client cannot use the column as storage. */
const MAX_NOTE_LENGTH = 5_000;

export async function getBookAnnotations(bookId: string): Promise<Annotation[]> {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return [];

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("book_annotations")
    .select("id, page_number, selected_text, note_content, highlight_color, created_at")
    .eq("book_id", bookId)
    .eq("user_id", user.id)
    .order("page_number", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[getBookAnnotations]:", error);
    return [];
  }

  return (data ?? []) as Annotation[];
}

export async function addAnnotation(
  bookId: string,
  pageNumber: number,
  selectedText: string,
  noteContent: string,
  highlightColor: string
): Promise<{ success: boolean; annotation?: Annotation; error?: string }> {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const validColors = ["yellow", "green", "blue", "pink"];
  if (!validColors.includes(highlightColor)) {
    return { success: false, error: "Invalid color" };
  }
  if (!selectedText.trim()) {
    return { success: false, error: "No text selected" };
  }
  if (selectedText.length > 2000) {
    return { success: false, error: "Selected text is too long." };
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("book_annotations")
    .insert({
      user_id: user.id,
      book_id: bookId,
      page_number: pageNumber,
      selected_text: selectedText.trim(),
      note_content: noteContent.trim(),
      highlight_color: highlightColor,
    })
    .select("id, page_number, selected_text, note_content, highlight_color, created_at")
    .single();

  if (error) {
    console.error("[addAnnotation]:", error);
    return { success: false, error: "Failed to save annotation." };
  }

  return { success: true, annotation: data as Annotation };
}

export async function deleteAnnotation(
  annotationId: string
): Promise<{ success: boolean; error?: string }> {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("book_annotations")
    .delete()
    .eq("id", annotationId)
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    console.error("[deleteAnnotation]:", error);
    return { success: false, error: "Failed to delete annotation." };
  }
  // Zero rows means this annotation is not the caller's, or is already gone.
  // Either way nothing was deleted, and the panel must not be told otherwise.
  if ((data ?? []).length === 0) {
    return { success: false, error: "Annotation not found." };
  }
  return { success: true };
}

/** Edit the note attached to a highlight. Returns the stored row, so the
    caller renders what the database holds rather than what it hoped it does. */
export async function updateAnnotationNote(
  annotationId: string,
  noteContent: string
): Promise<{ success: boolean; annotation?: Annotation; error?: string }> {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  if (noteContent.length > MAX_NOTE_LENGTH) {
    return { success: false, error: "Note is too long." };
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("book_annotations")
    .update({ note_content: noteContent.trim(), updated_at: new Date().toISOString() })
    .eq("id", annotationId)
    .eq("user_id", user.id)
    .select("id, page_number, selected_text, note_content, highlight_color, created_at");

  if (error) {
    console.error("[updateAnnotationNote]:", error);
    return { success: false, error: "Failed to save note." };
  }
  const row = (data ?? [])[0] as Annotation | undefined;
  // Unlike a delete, a zero-row update has NOT reached the state the caller
  // asked for: what they typed is stored nowhere. Reporting success here is
  // how a note is lost.
  if (!row) return { success: false, error: "Annotation not found." };
  return { success: true, annotation: row };
}
