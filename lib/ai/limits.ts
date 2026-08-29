// lib/ai/limits.ts
// The single source of truth for AI cost controls.
//
// These numbers used to live in three files (app/api/ask, app/api/chat,
// app/actions/ai-usage) and the two cooldown maps were per-route, so a client
// could alternate endpoints to halve the effective cooldown (audit §3, §4.16).
// Everything now shares one map and one set of constants.

import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { ADMIN_PANEL_ROLES, type AppRole } from "@/lib/types/roles";
import { AIRequestError } from "./response";

/** Per-user assistant messages per day (Asia/Phnom_Penh calendar day). */
export const DAILY_USER_LIMIT = 10;
/** Total assistant messages per day across all users — denial-of-wallet cap. */
export const DAILY_GLOBAL_LIMIT = 500;
/** Minimum gap between accepted requests from one user. */
export const COOLDOWN_MS = 5_000;

/**
 * Sentinel UUIDs used as `ai_usage` row keys for the global counters. Not real
 * users; `increment_ai_usage` has no FK on `user_id` precisely so these work.
 */
export const GLOBAL_SENTINEL = "00000000-0000-0000-0000-000000000000";
/** Separate budget for the public (unauthenticated) search summary. */
export const SEARCH_SENTINEL = "00000000-0000-0000-0000-000000000002";
export const DAILY_SEARCH_AI_LIMIT = 1000;

/**
 * One cooldown map for every AI entry point. In-memory and per-process: it
 * resets on cold start, which is acceptable because the durable budget is the
 * daily quota in Postgres. This only smooths burst traffic.
 */
const cooldownMap = new Map<string, number>();

/** Bound the map so a long-lived process can't accumulate one entry per user. */
const COOLDOWN_MAX_ENTRIES = 5_000;

export function checkCooldown(userId: string, now = Date.now()): boolean {
  const last = cooldownMap.get(userId) ?? 0;
  if (now - last < COOLDOWN_MS) return false;
  if (cooldownMap.size > COOLDOWN_MAX_ENTRIES) {
    for (const [k, t] of cooldownMap) {
      if (now - t > COOLDOWN_MS * 10) cooldownMap.delete(k);
    }
  }
  cooldownMap.set(userId, now);
  return true;
}

/** Test hook. */
export function resetCooldowns(): void {
  cooldownMap.clear();
}

export interface QuotaOutcome {
  /** Remaining uses today; null for admins (unlimited). */
  remaining: number | null;
  isAdmin: boolean;
}

export async function isAdminUser(userId: string): Promise<boolean> {
  const db = createServiceClient();
  const { data } = await db.from("profiles").select("role").eq("id", userId).single();
  return ADMIN_PANEL_ROLES.includes((data?.role ?? "reader") as AppRole);
}

/**
 * Consume one unit of the user's daily quota and one of the global budget.
 *
 * Order matters and is deliberate: the per-user check runs first so a user who
 * is already over their limit does not burn global budget. Both are incremented
 * BEFORE the model call, so a request that fails downstream still costs a use —
 * otherwise forcing errors would be a free way around the quota.
 *
 * Throws `AIRequestError` with the same codes the pre-2.0 routes returned, so
 * the widgets' error handling is unchanged.
 */
export async function consumeQuota(userId: string): Promise<QuotaOutcome> {
  const db = createServiceClient();
  const isAdmin = await isAdminUser(userId);

  let remaining: number | null = null;
  if (!isAdmin) {
    const { data, error } = await db.rpc("increment_ai_usage", {
      p_user_id: userId,
      p_limit: DAILY_USER_LIMIT,
    });
    if (error) {
      console.error("[ai/limits] user quota RPC error:", error.message ?? error);
      throw new AIRequestError("db_error");
    }
    if ((data as number) === -1) throw new AIRequestError("quota");
    remaining = data as number;
  }

  const { data: globalData, error: globalErr } = await db.rpc("increment_ai_usage", {
    p_user_id: GLOBAL_SENTINEL,
    p_limit: DAILY_GLOBAL_LIMIT,
  });
  if (globalErr) {
    console.error("[ai/limits] global quota RPC error:", globalErr.message ?? globalErr);
    throw new AIRequestError("db_error");
  }
  if ((globalData as number) === -1) throw new AIRequestError("global_limit");

  return { remaining, isAdmin };
}

/**
 * Budget gate for the anonymous public search summary. Returns false when the
 * day's allowance is spent — the caller must still return search results, just
 * without the generated sentence (§26).
 */
export async function allowPublicSummary(): Promise<boolean> {
  try {
    const db = createServiceClient();
    const { data } = await db.rpc("increment_ai_usage", {
      p_user_id: SEARCH_SENTINEL,
      p_limit: DAILY_SEARCH_AI_LIMIT,
    });
    return (data as number) !== -1;
  } catch (err) {
    console.error("[ai/limits] public summary budget check failed:", err);
    return false;
  }
}
