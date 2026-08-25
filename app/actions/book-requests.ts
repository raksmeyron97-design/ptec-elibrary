"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/requireAdmin";
import { revalidateLocalizedPath as revalidatePath, revalidateContributions } from "@/lib/cache/revalidate";

export type BookRequestStatus = "pending" | "approved" | "rejected" | "added";

/**
 * Which direction the request runs (migration 0119).
 *
 *   acquisition — a reader asks the library to source a work it doesn't hold
 *   deposit     — an author offers their own thesis for the collection
 *
 * Same table, same queue, same lifecycle; see the migration header for why this
 * is one column rather than two tables.
 */
export type BookRequestKind = "acquisition" | "deposit";

const REQUEST_KINDS: readonly BookRequestKind[] = ["acquisition", "deposit"];

export interface BookRequest {
  id: string;
  user_id: string | null;
  kind: BookRequestKind;
  title: string;
  author: string | null;
  isbn: string | null;
  source_url: string | null;
  reason: string | null;
  status: BookRequestStatus;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}

/** Max pending rows one user may hold, counted across BOTH kinds. */
const PENDING_CEILING = 5;

/**
 * Accept only http(s). A deposit link is pasted by a member and then opened by a
 * librarian from the admin panel, so `javascript:` and `data:` must never round
 * -trip into an href. Returning null on a malformed value (rather than throwing)
 * keeps a bad paste from blocking an otherwise valid deposit.
 */
function normalizeSourceUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString().slice(0, 2000);
  } catch {
    return null;
  }
}

// ── Submit a new request or deposit (user) ───────────────────
export async function submitBookRequest(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to submit this." };
  }

  // Never trust the client's kind: anything unrecognised falls back to the
  // pre-0119 behaviour rather than reaching the CHECK constraint as an error.
  const rawKind = (formData.get("kind") as string | null)?.trim();
  const kind: BookRequestKind = REQUEST_KINDS.includes(rawKind as BookRequestKind)
    ? (rawKind as BookRequestKind)
    : "acquisition";

  const title  = (formData.get("title")  as string | null)?.trim();
  const author = (formData.get("author") as string | null)?.trim() || null;
  const isbn   = (formData.get("isbn")   as string | null)?.trim() || null;
  const reason = (formData.get("reason") as string | null)?.trim() || null;
  const sourceUrl = normalizeSourceUrl(
    (formData.get("source_url") as string | null)?.trim() || null,
  );

  if (!title) return { error: "A title is required." };
  if (title.length > 300) return { error: "Title is too long (max 300 characters)." };

  // Ceiling spans both kinds — the cost being limited is librarian attention,
  // and a deposit costs at least as much of it as an acquisition request.
  const { count } = await supabase
    .from("book_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "pending");

  if ((count ?? 0) >= PENDING_CEILING) {
    return { error: "You have too many pending submissions. Please wait for them to be reviewed." };
  }

  const { error } = await supabase.from("book_requests").insert({
    user_id: user.id,
    kind,
    title,
    author,
    isbn: kind === "deposit" ? null : isbn,
    source_url: kind === "deposit" ? sourceUrl : null,
    reason,
  });

  if (error) return { error: "Failed to submit. Please try again." };

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
  await requirePermission("books", "read");
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
  await requirePermission("books", "write");
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("book_requests")
    .update({ status, admin_note: adminNote ?? null })
    .eq("id", id);

  if (error) return { error: error.message };

  // The homepage counts requests in the `added` state, and this is the only
  // transition that can change that figure in either direction.
  revalidateContributions();
  revalidatePath("/admin/book-requests");
  return { success: true };
}

// ── Admin: delete a request ───────────────────────────────────
export async function adminDeleteBookRequest(id: string) {
  await requirePermission("books", "write");
  const supabase = createServiceClient();
  const { error } = await supabase.from("book_requests").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/book-requests");
  return { success: true };
}
