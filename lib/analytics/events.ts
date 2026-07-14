import "server-only";

import { headers } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { anonymousSessionHash, isLikelyBot } from "@/lib/search/analytics";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Shared analytics event writers for the admin intelligence dashboard.
 *
 * Privacy model (mirrors 0087's search logging): no raw IP or durable
 * anonymous identifier is ever stored. Anonymous visitors get a
 * daily-rotating HMAC session hash; obvious bots are never logged. All
 * writes go through the service role and swallow failures — analytics must
 * never break a public page. Pre-0090 databases (missing columns/tables)
 * degrade silently.
 */

export type ViewerContext = {
  userId: string | null;
  sessionHash: string | null;
  locale: string | null;
  /** True for bot traffic — callers should skip logging entirely. */
  isBot: boolean;
  /** Client IP (rate-limit key only; never persisted). */
  ip: string;
};

export async function getViewerContext(): Promise<ViewerContext> {
  const h = await headers();
  const ua = h.get("user-agent");
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown";
  const isBot = isLikelyBot(ua);

  const localeHeader = h.get("x-locale");
  const locale = localeHeader === "km" || localeHeader === "en" ? localeHeader : null;

  let userId: string | null = null;
  try {
    const authClient = await createClient();
    const { data } = await authClient.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    // No session available (e.g. route handler without cookies) — anonymous.
  }

  return {
    userId,
    sessionHash: isBot
      ? null
      : anonymousSessionHash(ip, ua ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY),
    locale,
    isBot,
    ip,
  };
}

type ViewableContentType = "book" | "post" | "research_report" | "publication";

const RETRYABLE_COLUMN_ERRORS = new Set(["42703", "PGRST204"]);

/**
 * Insert a view_logs row for any visitor (signed-in or anonymous).
 * Bot traffic is skipped; anonymous inserts are rate-limited per IP so the
 * action cannot be spammed. Falls back to the legacy column set when 0090
 * has not been applied yet.
 */
export async function logContentView(
  contentType: ViewableContentType,
  contentId: string,
): Promise<void> {
  try {
    const ctx = await getViewerContext();
    if (ctx.isBot || !contentId) return;

    // Anonymous view logging is publicly triggerable — cap it per IP.
    if (!ctx.userId) {
      const { success } = await rateLimit(`view-log:${ctx.ip}`, 60, 60_000);
      if (!success) return;
    }

    const supabase = createServiceClient();
    const payload: Record<string, unknown> = {
      content_type: contentType,
      content_id: contentId,
      user_id: ctx.userId,
      session_hash: ctx.sessionHash,
      locale: ctx.locale,
    };
    const { error } = await supabase.from("view_logs").insert(payload);
    if (error && RETRYABLE_COLUMN_ERRORS.has(error.code ?? "")) {
      // Pre-0090: session_hash/locale columns don't exist yet.
      delete payload.session_hash;
      delete payload.locale;
      await supabase.from("view_logs").insert(payload);
    }
  } catch (err) {
    console.error("[logContentView]", err instanceof Error ? err.message : err);
  }
}

/**
 * Record that a visitor opened the PDF reader. New event as of 0090 — the
 * dashboard funnel shows "collecting since" until data accumulates.
 */
export async function logReaderOpen(
  contentType: "book" | "research_report" | "publication",
  contentId: string,
): Promise<void> {
  try {
    const ctx = await getViewerContext();
    if (ctx.isBot || !contentId) return;
    if (!ctx.userId) {
      const { success } = await rateLimit(`reader-open:${ctx.ip}`, 30, 60_000);
      if (!success) return;
    }

    const supabase = createServiceClient();
    await supabase.from("reader_open_logs").insert({
      content_type: contentType,
      content_id: contentId,
      user_id: ctx.userId,
      session_hash: ctx.sessionHash,
      locale: ctx.locale,
    });
  } catch (err) {
    console.error("[logReaderOpen]", err instanceof Error ? err.message : err);
  }
}

/** Coarse device/browser summary from a UA string — never the raw UA (keeps
 *  the event non-fingerprinting). Best-effort; unknowns collapse to "other". */
function summarizeUserAgent(ua: string | null | undefined): string {
  if (!ua) return "unknown";
  const s = ua.toLowerCase();
  const device = /mobile|iphone|android|ipad/.test(s) ? "mobile" : "desktop";
  const browser = s.includes("edg/")
    ? "edge"
    : s.includes("chrome") && !s.includes("chromium")
      ? "chrome"
      : s.includes("firefox")
        ? "firefox"
        : s.includes("safari")
          ? "safari"
          : "other";
  const os = s.includes("windows")
    ? "windows"
    : /mac os|macintosh/.test(s)
      ? "macos"
      : s.includes("android")
        ? "android"
        : /iphone|ipad|ios/.test(s)
          ? "ios"
          : s.includes("linux")
            ? "linux"
            : "other";
  return `${device}/${browser}/${os}`;
}

/**
 * Record a DENIED or FAILED download attempt in the unified `activity_events`
 * table (migration 0094). Successful downloads are NEVER written here — they
 * stay in download_logs / research_report_downloads so the /admin/logs
 * read-model does not double-count. Fire-and-forget: swallows all errors,
 * including PGRST205/42P01 when 0094 has not been applied yet.
 *
 * `ipHash` is a daily-rotating keyed HMAC (never a raw IP). `idempotencyKey`
 * de-dupes retried denials (the unique partial index enforces it at the DB).
 */
export async function logDownloadAttempt(input: {
  status: "denied" | "failed";
  resourceType: "book" | "thesis" | "publication" | "post";
  resourceId: string | null;
  userId: string | null;
  reason: string; // DenialReason enum value
  permissionSource?: string | null;
  rankAtEvent?: number | null;
  institutionType?: string | null;
  role?: string | null;
  purpose?: string | null;
  idempotencyKey?: string | null;
}): Promise<void> {
  try {
    const h = await headers();
    const ua = h.get("user-agent");
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
    const requestId = h.get("x-request-id") ?? null;
    const localeHeader = h.get("x-locale");
    const locale = localeHeader === "km" || localeHeader === "en" ? localeHeader : null;

    const supabase = createServiceClient();
    const { error } = await supabase.from("activity_events").insert({
      event_type: "download",
      event_status: input.status,
      resource_type: input.resourceType,
      resource_id: input.resourceId,
      user_id: input.userId,
      request_id: requestId,
      idempotency_key: input.idempotencyKey ?? null,
      permission_source: input.permissionSource ?? null,
      permission_reason: input.reason,
      rank_at_event: input.rankAtEvent ?? null,
      institution_type_snapshot: input.institutionType ?? null,
      role_snapshot: input.role ?? null,
      purpose_snapshot: input.purpose ?? null,
      locale,
      ip_hash: anonymousSessionHash(ip, ua ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY),
      user_agent_summary: summarizeUserAgent(ua),
    });
    // 23505 = duplicate idempotency key (already recorded) → not an error.
    // 42P01/PGRST205 = table absent (0094 pending) → silently degrade.
    if (error && !["23505", "42P01", "PGRST205"].includes(error.code ?? "")) {
      console.error("[logDownloadAttempt]", error.message);
    }
  } catch (err) {
    console.error("[logDownloadAttempt]", err instanceof Error ? err.message : err);
  }
}

export type AppEventKind = "ai_request" | "storage_operation" | "notification" | "export";
export type AppEventStatus = "ok" | "error" | "timeout" | "quota" | "fallback";

/**
 * Fire-and-forget operational telemetry (AI outcomes, storage backend usage,
 * export runs). `detail` must contain only counts/codes/backends — never
 * prompts, query text, URLs with tokens, secrets, or personal data.
 */
export function logAppEvent(event: {
  kind: AppEventKind;
  status: AppEventStatus;
  route?: string;
  latencyMs?: number;
  detail?: Record<string, string | number | boolean>;
}): void {
  try {
    const supabase = createServiceClient();
    void supabase
      .from("app_events")
      .insert({
        kind: event.kind,
        status: event.status,
        route: event.route ?? null,
        latency_ms: event.latencyMs != null ? Math.round(event.latencyMs) : null,
        detail: event.detail ?? {},
      })
      .then(({ error }) => {
        if (error && error.code !== "42P01") {
          console.error("[logAppEvent]", error.message);
        }
      });
  } catch (err) {
    console.error("[logAppEvent]", err instanceof Error ? err.message : err);
  }
}
