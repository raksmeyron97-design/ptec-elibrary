"use server";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient, createServiceClient } from "@/lib/supabase/server";

export type ExportData = {
  readingProgress: {
    title:        string;
    author:       string;
    category:     string;
    pages:        number;
    progress_pct: number;
    last_read_at: string;
  }[];
  savedBooks: {
    title:      string;
    author:     string;
    category:   string;
    department: string;
    saved_at:   string;
  }[];
  annotations: {
    book_title:      string;
    page_number:     number;
    selected_text:   string;
    note_content:    string;
    highlight_color: string;
    created_at:      string;
  }[];
  notes: {
    book_title: string;
    content:    string;
    updated_at: string;
  }[];
};

export async function getExportData(): Promise<ExportData | null> {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const db = createServiceClient();

  const [progressRes, savedRes, annotationsRes, notesRes] = await Promise.all([
    db
      .from("reading_progress")
      .select("progress_pct, last_read_at, books(title, pages, authors(name), categories(name))")
      .eq("user_id", user.id)
      .gt("progress_pct", 0)
      .order("last_read_at", { ascending: false }),
    db
      .from("saved_books")
      .select("created_at, books(title, department, authors(name), categories(name))")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    db
      .from("book_annotations")
      .select("page_number, selected_text, note_content, highlight_color, created_at, books(title)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    db
      .from("book_notes")
      .select("content, updated_at, books(title)")
      .eq("user_id", user.id)
      .not("content", "eq", "")
      .order("updated_at", { ascending: false }),
  ]);

  return {
    readingProgress: (progressRes.data ?? []).map((r: any) => ({
      title:        r.books?.title ?? "Unknown",
      author:       r.books?.authors?.name ?? "Unknown",
      category:     r.books?.categories?.name ?? "General",
      pages:        r.books?.pages ?? 0,
      progress_pct: r.progress_pct,
      last_read_at: (r.last_read_at ?? "").split("T")[0],
    })),
    savedBooks: (savedRes.data ?? []).map((r: any) => ({
      title:      r.books?.title ?? "Unknown",
      author:     r.books?.authors?.name ?? "Unknown",
      category:   r.books?.categories?.name ?? "General",
      department: r.books?.department ?? "General",
      saved_at:   (r.created_at ?? "").split("T")[0],
    })),
    annotations: (annotationsRes.data ?? []).map((r: any) => ({
      book_title:      r.books?.title ?? "Unknown",
      page_number:     r.page_number ?? 0,
      selected_text:   r.selected_text ?? "",
      note_content:    r.note_content ?? "",
      highlight_color: r.highlight_color ?? "yellow",
      created_at:      (r.created_at ?? "").split("T")[0],
    })),
    notes: (notesRes.data ?? []).map((r: any) => ({
      book_title: r.books?.title ?? "Unknown",
      content:    r.content ?? "",
      updated_at: (r.updated_at ?? "").split("T")[0],
    })),
  };
}
