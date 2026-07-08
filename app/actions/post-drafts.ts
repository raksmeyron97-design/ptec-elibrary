"use server";

import { requirePermission } from "@/lib/auth/requireAdmin";
import { rateLimit } from "@/lib/rate-limit";
import { ratePolicy } from "@/lib/rate-limit-policy";
import { logSecurityEvent } from "@/lib/security-log";

export type PostDraftKey = { postId: string } | { draftKey: string };

function keyColumn(key: PostDraftKey): { column: "post_id" | "draft_key"; value: string } {
  return "postId" in key ? { column: "post_id", value: key.postId } : { column: "draft_key", value: key.draftKey };
}

export type PostDraftPayload = Record<string, unknown>;

/**
 * Upsert an in-progress edit snapshot. Never touches the live `posts` row —
 * see the note in migration 0074_post_drafts.sql for why.
 */
export async function autosavePostDraft(
  key: PostDraftKey,
  payload: PostDraftPayload,
): Promise<{ success: boolean; error?: string; savedAt?: string }> {
  const { supabase, user } = await requirePermission("posts", "write");

  const { limit, windowMs } = ratePolicy("postAutosave");
  const rl = await rateLimit(`post-autosave:${user.id}`, limit, windowMs);
  if (!rl.success) {
    logSecurityEvent({ type: "rate_limited", where: "autosavePostDraft", userId: user.id });
    return { success: false, error: "Saving too quickly — your draft will save again shortly." };
  }

  const { column, value } = keyColumn(key);

  // Manual select-then-write instead of .upsert(onConflict): the table's
  // unique indexes are partial (`where post_id/draft_key is not null`), and
  // PostgREST's upsert can't target a partial index's WHERE clause. Fine for
  // this path — a single user's own sequential autosave calls, no real
  // concurrent-write race to worry about.
  const { data: existing } = await supabase
    .from("post_drafts")
    .select("id")
    .eq(column, value)
    .eq("user_id", user.id)
    .maybeSingle();

  const result = existing
    ? await supabase.from("post_drafts").update({ payload }).eq("id", existing.id).select("updated_at").single()
    : await supabase.from("post_drafts").insert({ user_id: user.id, [column]: value, payload }).select("updated_at").single();

  if (result.error) {
    console.error("[autosavePostDraft]:", result.error.message);
    return { success: false, error: "Failed to save draft." };
  }

  return { success: true, savedAt: result.data.updated_at };
}

export async function getPostDraft(
  key: PostDraftKey,
): Promise<{ payload: PostDraftPayload; updatedAt: string } | null> {
  const { supabase, user } = await requirePermission("posts", "read");
  const { column, value } = keyColumn(key);

  const { data } = await supabase
    .from("post_drafts")
    .select("payload, updated_at")
    .eq(column, value)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) return null;
  return { payload: data.payload as PostDraftPayload, updatedAt: data.updated_at as string };
}

export async function discardPostDraft(key: PostDraftKey): Promise<void> {
  const { supabase, user } = await requirePermission("posts", "write");
  const { column, value } = keyColumn(key);
  await supabase.from("post_drafts").delete().eq(column, value).eq("user_id", user.id);
}
