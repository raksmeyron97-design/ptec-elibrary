// Shared, PURE activity-log helpers — safe to import from BOTH the server
// query service (lib/admin/activity-log.ts) and the client component
// (SecurityLogsClient.tsx) and unit tests. NEVER import "server-only" here:
// no DB, no next/headers, no secrets. Only stable enum values + formatting.
//
// Stable enum VALUES are stored/emitted here; human-facing labels are
// translated in the UI (i18n). Do not translate the values themselves.

// ── Polymorphic resource + event taxonomy ───────────────────────────────────

/** Every resource an activity event can point at. `account`/`system` are
 *  actor-scoped events with no content resource. Extend here for new types. */
export type ResourceType =
  | "book"
  | "thesis"
  | "publication"
  | "post"
  | "announcement"
  | "account"
  | "system";

export const RESOURCE_TYPES: ResourceType[] = [
  "book",
  "thesis",
  "publication",
  "post",
  "announcement",
  "account",
  "system",
];

/** Coarse event family used for tabs + summary cards. */
export type EventType = "view" | "download" | "account" | "admin" | "security";

/**
 * Precise download lifecycle status. A "successful download" for metrics is
 * ONLY `authorized` — the server authorized the request AND started an
 * eligible file response (or issued a valid short-lived signed URL). Because
 * neither Zima nor R2 gives us a reliable delivery-completion callback, we do
 * NOT claim "download completed"; the honest term is "authorized download /
 * delivery started". See the download routes for where each is emitted.
 */
export type EventStatus =
  | "success" // a view (page/reader open) — non-download success
  | "authorized" // download authorized + delivery started (THE success metric)
  | "denied" // download blocked by policy (top-10 / admin / profile / auth)
  | "failed"; // authorized but delivery/storage/signing failed

/** Why a download was denied — stable values mirrored from the thesis
 *  permission engine's ThesisDownloadReason plus book-route equivalents. */
export type DenialReason =
  | "AUTHENTICATION_REQUIRED"
  | "PROFILE_INCOMPLETE"
  | "TOP_TEN_RESTRICTED"
  | "ADMIN_BLOCKED"
  | "THESIS_UNPUBLISHED"
  | "FILE_UNAVAILABLE"
  | "RATE_LIMITED"
  | "STORAGE_ERROR";

/** One normalized activity event, resource-agnostic. Snapshot fields capture
 *  the reader AT event time; current identity is resolved separately. */
export interface ActivityEvent {
  id: string;
  /** Which backend table this row came from — for debugging + idempotency. */
  source: "download_logs" | "research_report_downloads" | "view_logs" | "activity_events";
  eventType: EventType;
  eventStatus: EventStatus;
  resourceType: ResourceType;
  resourceId: string | null;
  resourceTitle: string | null;
  /** Reader / actor. Null user = anonymous session. */
  userId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  actorAvatar: string | null;
  isAnon: boolean;
  /** Institutional snapshots (download events only; null otherwise). */
  institutionType: string | null;
  role: string | null;
  purpose: string | null;
  /** Download decision context (thesis downloads + denied/failed events). */
  rankAtEvent: number | null;
  permissionSource: string | null; // 'automatic-ranking' | 'admin-override'
  denialReason: DenialReason | null;
  locale: string | null;
  occurredAt: string; // ISO timestamp
}

// ── Tab classification ───────────────────────────────────────────────────────

export type ActivityTab = "all" | "downloads" | "views" | "security" | "account" | "admin";

export function tabForEvent(e: ActivityEvent): Exclude<ActivityTab, "all"> {
  if (e.eventType === "download") {
    // Denied / failed downloads are surfaced under Security, not counted as
    // successful downloads. Authorized downloads live under Downloads.
    return e.eventStatus === "denied" || e.eventStatus === "failed" ? "security" : "downloads";
  }
  if (e.eventType === "view") return "views";
  if (e.eventType === "admin") return "admin";
  if (e.eventType === "security") return "security";
  return "account";
}

// ── Date-range presets ───────────────────────────────────────────────────────

export type RangePreset = "24h" | "7d" | "30d" | "90d" | "custom";

const RANGE_MS: Record<Exclude<RangePreset, "custom">, number> = {
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
  "90d": 90 * 86_400_000,
};

/** Resolve a preset (or explicit custom bounds) into concrete ISO bounds.
 *  `now` is injectable for deterministic tests. */
export function resolveRange(
  preset: RangePreset,
  now: number = Date.now(),
  customStart?: string | null,
  customEnd?: string | null,
): { start: string; end: string; startMs: number; endMs: number } {
  if (preset === "custom" && customStart) {
    const startMs = new Date(customStart).getTime();
    const endMs = customEnd ? new Date(customEnd).getTime() : now;
    return { start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString(), startMs, endMs };
  }
  const span = RANGE_MS[(preset === "custom" ? "24h" : preset) as Exclude<RangePreset, "custom">];
  const startMs = now - span;
  return { start: new Date(startMs).toISOString(), end: new Date(now).toISOString(), startMs, endMs: now };
}

// ── Privacy masking (pure) ───────────────────────────────────────────────────

/** Mask a phone to reveal only the last 3 digits, e.g. "+855 ** *** 482".
 *  Never throws; returns null for empty input. */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 3) return "•••";
  const last3 = digits.slice(-3);
  // Preserve a leading country code (first 3 digits) only when the source was
  // written in international form; otherwise show no prefix.
  const cc = phone.trim().startsWith("+") ? "+" + digits.slice(0, 3) : "";
  return `${cc ? cc + " " : ""}** *** ${last3}`.trim();
}

/** Mask an email to "j•••@domain.com". Preserves the domain (low-risk) and the
 *  first character of the local part only. */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at <= 0) return "•••";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const first = local[0] ?? "";
  return `${first}•••@${domain}`;
}

// ── CSV safety (formula-injection + quoting) ─────────────────────────────────

/**
 * Escape a single CSV cell:
 *   1. Neutralize spreadsheet formula injection — a leading =, +, -, @, tab or
 *      CR is prefixed with a single quote so Excel/Sheets treat it as text.
 *   2. RFC-4180 quote: wrap in double quotes and double any embedded quotes so
 *      commas / newlines / quotes never break the row.
 * Returns a value ready to concatenate with commas.
 */
export function csvEscape(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

/** Build a full CSV document (UTF-8 BOM prepended so Excel renders Khmer). */
export function buildCsv(headers: string[], rows: (unknown[])[]): string {
  const headerLine = headers.map(csvEscape).join(",");
  const body = rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
  return "﻿" + headerLine + "\r\n" + body + "\r\n";
}

// ── Timeline bucketing (pure) ────────────────────────────────────────────────
//
// Asia/Phnom_Penh is UTC+7 all year — Cambodia has never observed DST — so a
// local day boundary is a FIXED offset from UTC and bucketing is plain
// arithmetic. That is why there is no tz library here: `Intl` would be correct
// too, but it costs a formatter call per event, and this runs over every event
// in the range.

/** Fixed UTC offset of ADMIN_TZ (Asia/Phnom_Penh, UTC+7, no DST). */
export const ADMIN_TZ_OFFSET_MS = 7 * 3_600_000;

export type TimelineBucket = "hour" | "day" | "week";

export const BUCKET_MS: Record<TimelineBucket, number> = {
  hour: 3_600_000,
  day: 86_400_000,
  week: 7 * 86_400_000,
};

/**
 * Pick the bucket size that keeps a range readable as a chart.
 *
 * The ladder is bounded on purpose: a custom range of several years must not
 * produce thousands of buckets (an unreadable plot AND a large payload), and
 * silently truncating the range instead would be dishonest — so the bucket
 * widens rather than the window shrinking.
 */
export function pickTimelineBucket(startMs: number, endMs: number): TimelineBucket {
  const span = Math.max(0, endMs - startMs);
  if (span <= 48 * BUCKET_MS.hour) return "hour";
  if (span <= 120 * BUCKET_MS.day) return "day";
  return "week";
}

/** Floor a UTC instant to the start of its bucket, in ADMIN_TZ local time.
 *  Weeks start Monday (ISO), not on the epoch's Thursday. */
export function floorToBucket(ms: number, bucket: TimelineBucket): number {
  const local = ms + ADMIN_TZ_OFFSET_MS;
  if (bucket === "week") {
    const day = Math.floor(local / BUCKET_MS.day) * BUCKET_MS.day;
    // 1970-01-01 was a Thursday, so shift by 3 days to make Monday index 0.
    const weekday = Math.floor((day / BUCKET_MS.day + 3) % 7);
    return day - weekday * BUCKET_MS.day - ADMIN_TZ_OFFSET_MS;
  }
  const size = BUCKET_MS[bucket];
  return Math.floor(local / size) * size - ADMIN_TZ_OFFSET_MS;
}

/** Every bucket start (UTC ms) spanning [startMs, endMs], oldest first.
 *  Empty buckets are included — a gap in activity IS information. */
export function timelineBucketStarts(
  startMs: number,
  endMs: number,
  bucket: TimelineBucket,
): number[] {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return [];
  const size = BUCKET_MS[bucket];
  const first = floorToBucket(startMs, bucket);
  const last = floorToBucket(endMs, bucket);
  const out: number[] = [];
  for (let t = first; t <= last; t += size) out.push(t);
  return out;
}
