"use server";

import { requirePermission } from "@/lib/auth/requireAdmin";
import { rateLimit } from "@/lib/rate-limit";
import { ratePolicy } from "@/lib/rate-limit-policy";
import { logSecurityEvent } from "@/lib/security-log";

export type ThesisDraftKey = { thesisId: string } | { draftKey: string };

function keyColumn(key: ThesisDraftKey): { column: "thesis_id" | "draft_key"; value: string } {
  return "thesisId" in key ? { column: "thesis_id", value: key.thesisId } : { column: "draft_key", value: key.draftKey };
}

export type ThesisDraftPayload = Record<string, unknown>;

/**
 * Upsert an in-progress edit snapshot. Never touches the live
 * `research_reports` row — see the note in migration
 * 0076_thesis_form_upgrade.sql for why.
 */
export async function autosaveThesisDraft(
  key: ThesisDraftKey,
  payload: ThesisDraftPayload,
): Promise<{ success: boolean; error?: string; savedAt?: string }> {
  const { supabase, user } = await requirePermission("research", "write");

  const { limit, windowMs } = ratePolicy("thesisAutosave");
  const rl = await rateLimit(`thesis-autosave:${user.id}`, limit, windowMs);
  if (!rl.success) {
    logSecurityEvent({ type: "rate_limited", where: "autosaveThesisDraft", userId: user.id });
    return { success: false, error: "Saving too quickly — your draft will save again shortly." };
  }

  const { column, value } = keyColumn(key);

  // Manual select-then-write instead of .upsert(onConflict): the table's
  // unique indexes are partial (`where thesis_id/draft_key is not null`),
  // and PostgREST's upsert can't target a partial index's WHERE clause.
  const { data: existing } = await supabase
    .from("thesis_drafts")
    .select("id")
    .eq(column, value)
    .eq("user_id", user.id)
    .maybeSingle();

  const result = existing
    ? await supabase.from("thesis_drafts").update({ payload }).eq("id", existing.id).select("updated_at").single()
    : await supabase.from("thesis_drafts").insert({ user_id: user.id, [column]: value, payload }).select("updated_at").single();

  if (result.error) {
    console.error("[autosaveThesisDraft]:", result.error.message);
    return { success: false, error: "Failed to save draft." };
  }

  return { success: true, savedAt: result.data.updated_at };
}

export async function getThesisDraft(
  key: ThesisDraftKey,
): Promise<{ payload: ThesisDraftPayload; updatedAt: string } | null> {
  const { supabase, user } = await requirePermission("research", "read");
  const { column, value } = keyColumn(key);

  const { data } = await supabase
    .from("thesis_drafts")
    .select("payload, updated_at")
    .eq(column, value)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) return null;
  return { payload: data.payload as ThesisDraftPayload, updatedAt: data.updated_at as string };
}

export async function discardThesisDraft(key: ThesisDraftKey): Promise<void> {
  const { supabase, user } = await requirePermission("research", "write");
  const { column, value } = keyColumn(key);
  await supabase.from("thesis_drafts").delete().eq(column, value).eq("user_id", user.id);
}
