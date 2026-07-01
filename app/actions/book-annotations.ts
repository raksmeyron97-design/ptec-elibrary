"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";

export type Annotation = {
  id: string;
  page_number: number;
  selected_text: string;
  note_content: string;
  highlight_color: "yellow" | "green" | "blue" | "pink";
  created_at: string;
};

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
): Promise<{ success: boolean }> {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { success: false };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("book_annotations")
    .delete()
    .eq("id", annotationId)
    .eq("user_id", user.id);

  return { success: !error };
}

export async function updateAnnotationNote(
  annotationId: string,
  noteContent: string
): Promise<{ success: boolean }> {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { success: false };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("book_annotations")
    .update({ note_content: noteContent.trim(), updated_at: new Date().toISOString() })
    .eq("id", annotationId)
    .eq("user_id", user.id);

  return { success: !error };
}
