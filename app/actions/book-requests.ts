"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type BookRequestStatus = "pending" | "approved" | "rejected" | "added";

export interface BookRequest {
  id: string;
  user_id: string | null;
  title: string;
  author: string | null;
  isbn: string | null;
  reason: string | null;
  status: BookRequestStatus;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}

// ── Submit a new book request (user) ─────────────────────────
export async function submitBookRequest(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to request a book." };
  }

  const title  = (formData.get("title")  as string | null)?.trim();
  const author = (formData.get("author") as string | null)?.trim() || null;
  const isbn   = (formData.get("isbn")   as string | null)?.trim() || null;
  const reason = (formData.get("reason") as string | null)?.trim() || null;

  if (!title) return { error: "Book title is required." };
  if (title.length > 300) return { error: "Title is too long (max 300 characters)." };

  // Prevent spamming: max 5 pending requests per user
  const { count } = await supabase
    .from("book_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "pending");

  if ((count ?? 0) >= 5) {
    return { error: "You have too many pending requests. Please wait for them to be reviewed." };
  }

  const { error } = await supabase.from("book_requests").insert({
    user_id: user.id,
    title,
    author,
    isbn,
    reason,
  });

  if (error) return { error: "Failed to submit request. Please try again." };

  revalidatePath("/books");
  return { success: true };
}

// ── Get current user's requests ──────────────────────────────
export async function getMyBookRequests(): Promise<BookRequest[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("book_requests")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (data ?? []) as BookRequest[];
}

// ── Admin: list all requests ─────────────────────────────────
export async function adminGetBookRequests(status?: BookRequestStatus): Promise<BookRequest[]> {
  const supabase = createServiceClient();
  let query = supabase
    .from("book_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data } = await query;
  return (data ?? []) as BookRequest[];
}

// ── Admin: update a request status ───────────────────────────
export async function adminUpdateBookRequest(
  id: string,
  status: BookRequestStatus,
  adminNote?: string,
) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("book_requests")
    .update({ status, admin_note: adminNote ?? null })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/book-requests");
  return { success: true };
}

// ── Admin: delete a request ───────────────────────────────────
export async function adminDeleteBookRequest(id: string) {
  const supabase = createServiceClient();
  const { error } = await supabase.from("book_requests").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/book-requests");
  return { success: true };
}
