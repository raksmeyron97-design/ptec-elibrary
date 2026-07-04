"use server";

import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/types/roles";
import { ADMIN_PANEL_ROLES } from "@/lib/types/roles";

// Must match DAILY_USER_LIMIT in app/api/ask/route.ts and app/api/chat/route.ts.
const DAILY_USER_LIMIT = 10;

/**
 * Returns the user's remaining AI quota for today (Asia/Phnom_Penh date),
 * via the get_ai_usage RPC (granted to authenticated in migration 0023).
 *
 * - `remaining: null` means unlimited (admin roles — mirrors /api/ask & /api/chat)
 * - `remaining: number` is how many AI queries are left today (>= 0)
 */
export async function getRemainingAiQuota(): Promise<{
  remaining: number | null;
  limit: number;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { remaining: 0, limit: DAILY_USER_LIMIT, error: "Authentication required" };
    }

    // Admins are exempt from the daily quota (same rule as the AI routes)
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (ADMIN_PANEL_ROLES.includes((profile?.role ?? "reader") as AppRole)) {
      return { remaining: null, limit: DAILY_USER_LIMIT };
    }

    const { data, error } = await supabase.rpc("get_ai_usage", {
      p_user_id: user.id,
    });

    if (error) {
      return { remaining: 0, limit: DAILY_USER_LIMIT, error: error.message };
    }

    const used = Number(data ?? 0);
    return {
      remaining: Math.max(0, DAILY_USER_LIMIT - used),
      limit: DAILY_USER_LIMIT,
    };
  } catch (err) {
    return {
      remaining: 0,
      limit: DAILY_USER_LIMIT,
      error: err instanceof Error ? err.message : "Failed to load AI quota",
    };
  }
}
