"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { changedRow, NO_MATCH_MESSAGE } from "@/lib/db/changed-row";

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

  // The service client bypasses RLS, so `.eq("user_id", …)` is the ONLY thing
  // standing between one reader and another's annotations. `.select()` makes
  // that guard observable: without it a delete aimed at someone else's row
  // returns 204/no error and this reported success.
  const supabase = createServiceClient();
  const result = changedRow(
    await supabase
      .from("book_annotations")
      .delete()
      .eq("id", annotationId)
      .eq("user_id", user.id)
      .select("id"),
  );

  if (!result.ok) {
    if (result.reason === "error") {
      console.error("[deleteAnnotation]:", result.message);
      return { success: false, error: "Failed to delete annotation." };
    }
    return { success: false, error: NO_MATCH_MESSAGE };
  }
  return { success: true };
}

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

  // Returns the STORED row, not the submitted text. The two differ — the note
  // is trimmed and `updated_at` moves — and rendering the optimistic version
  // is how a panel comes to disagree with the database it is displaying.
  const supabase = createServiceClient();
  const result = changedRow<Annotation>(
    await supabase
      .from("book_annotations")
      .update({ note_content: noteContent.trim(), updated_at: new Date().toISOString() })
      .eq("id", annotationId)
      .eq("user_id", user.id)
      .select("id, page_number, selected_text, note_content, highlight_color, created_at"),
  );

  if (!result.ok) {
    if (result.reason === "error") {
      console.error("[updateAnnotationNote]:", result.message);
      return { success: false, error: "Failed to save note." };
    }
    // A zero-row UPDATE has not reached the state the caller asked for: the
    // text they typed is stored nowhere. Unlike a delete, there is no reading
    // of this in which the request succeeded.
    return { success: false, error: NO_MATCH_MESSAGE };
  }
  return { success: true, annotation: result.row };
}
