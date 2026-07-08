"use server";

// Editorial review queue (migration 0061): books and theses submitted as
// `pending_review` wait here until a librarian/admin approves or rejects
// them. The status→is_published sync trigger makes approval visible to every
// existing public query immediately.

import { revalidatePath, revalidateTag } from "next/cache";
import { requireLibrarian } from "@/lib/auth/requireAdmin";
import { logAdminAction } from "@/app/actions/audit";

export type ReviewItemType = "book" | "research";
export type ReviewStatus = "pending_review" | "rejected";

export type ReviewItem = {
  id: string;
  type: ReviewItemType;
  title: string;
  author: string;
  coverUrl: string | null;
  status: ReviewStatus;
  createdAt: string;
  /** Admin edit page for the record */
  editUrl: string;
};

export async function getReviewQueue(): Promise<ReviewItem[]> {
  const { supabase } = await requireLibrarian();

  const [{ data: books }, { data: research }] = await Promise.all([
    supabase
      .from("books")
      .select("id, title, cover_url, status, created_at, authors(name)")
      .in("status", ["pending_review", "rejected"])
      .order("created_at", { ascending: false }),
    supabase
      .from("research_reports")
      .select("id, title, cover_url, status, created_at, author_names")
      .in("status", ["pending_review", "rejected"])
      .order("created_at", { ascending: false }),
  ]);

  const items: ReviewItem[] = [];
  for (const b of books ?? []) {
    items.push({
      id: b.id,
      type: "book",
      title: b.title,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      author: (b.authors as any)?.name ?? "Unknown",
      coverUrl: b.cover_url,
      status: b.status as ReviewStatus,
      createdAt: b.created_at,
      editUrl: `/admin/edit/${b.id}`,
    });
  }
  for (const r of research ?? []) {
    items.push({
      id: r.id,
      type: "research",
      title: r.title,
      author: r.author_names ?? "Unknown",
      coverUrl: r.cover_url,
      status: r.status as ReviewStatus,
      createdAt: r.created_at,
      editUrl: `/admin/theses/edit/${r.id}`,
    });
  }

  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Count shown as the sidebar badge; returns 0 on any failure. */
export async function getPendingReviewCount(): Promise<number> {
  try {
    const { supabase } = await requireLibrarian();
    const [{ count: books }, { count: research }] = await Promise.all([
      supabase.from("books").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
      supabase.from("research_reports").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
    ]);
    return (books ?? 0) + (research ?? 0);
  } catch {
    return 0;
  }
}

async function setStatus(
  type: ReviewItemType,
  id: string,
  status: "published" | "rejected",
): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase, user } = await requireLibrarian();
    const table = type === "book" ? "books" : "research_reports";

    // Approval doubles as verification — a librarian has just reviewed the
    // metadata, which is exactly what the "verified" badge represents.
    const updates =
      status === "published"
        ? { status, verified_at: new Date().toISOString(), verified_by: user.id }
        : { status };

    const { data: row, error } = await supabase
      .from(table)
      .update(updates)
      .eq("id", id)
      .select("title")
      .maybeSingle();
    if (error) return { error: error.message };
    if (!row) return { error: "Record not found" };

    await logAdminAction(user.id, status === "published" ? "content.approve" : "content.reject", table, id, {
      title: row.title,
    });

    if (type === "book") {
      revalidateTag("books", "max");
      revalidatePath("/books");
    } else {
      revalidatePath("/theses");
    }
    revalidatePath("/");
    revalidatePath("/admin/review");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Update failed" };
  }
}

export async function approveContent(type: ReviewItemType, id: string) {
  return setStatus(type, id, "published");
}

export async function rejectContent(type: ReviewItemType, id: string) {
  return setStatus(type, id, "rejected");
}
