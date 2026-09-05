import { NextResponse, type NextRequest } from "next/server";
import { logAppEvent } from "@/lib/analytics/events";
import { rateLimit } from "@/lib/rate-limit";
import { ratePolicy } from "@/lib/rate-limit-policy";
import { clientIp } from "@/lib/client-ip";

/**
 * Reader telemetry sink.
 *
 * The reader posts a beacon per interesting event; this route validates it,
 * clamps every number, drops every key it does not know, and writes ONE
 * `app_events` row (`kind: "reader_event"`, migration 0138). The dashboard
 * reads `public.reader_performance_daily`, which is where first-page p50/p95
 * per device class, large-file failure counts and offline-recovery counts
 * come from. Before 0138 this route wrote a `console.warn` and nothing could
 * be asked of it.
 *
 * PRIVACY, and it is structural rather than procedural:
 *   • the payload is rebuilt field by field from an allow-list — an unknown
 *     key cannot reach the database even if the client sends one;
 *   • `file` is already reduced to a path with no query string by the client
 *     (`safePdfPath`), so no token or storage host can land in a row;
 *   • no IP, no user id, no session identifier is stored. The IP is used for
 *     the rate-limit key and discarded;
 *   • `device`, `source` and `kind` are enums, checked against fixed sets;
 *   • `message` is a pdf.js error string, trimmed, capped, newline-stripped —
 *     never document content.
 *
 * The endpoint is anonymous by necessity (a beacon fires at teardown, and the
 * offline reader never calls it at all), so it is rate limited per IP.
 */

const EVENT_TYPES = new Set([
  "pdf_load_error",
  "pdf_load_slow",
  "pdf_render_error",
  // Time to the first PAINTED page, with the request count and byte total
  // behind it. The measure the large-PDF work exists to move; see
  // docs/LARGE-PDF-PERFORMANCE-AUDIT.md. Counts only — never document content.
  "pdf_first_page",
  // A single page's bytes could not be fetched — what a network outage looks
  // like from inside the reader (docs/READER-PRODUCTION-AUDIT-2.md §F2).
  "page_load_error",
  "offline_transition",
  "network_recovery",
  "reader_session",
  "broken_file_report",
]);

/** Which event types are failures. Everything else is "ok" — a status, not a
    severity: an offline transition is normal life on a phone. */
const ERROR_TYPES = new Set(["pdf_load_error", "pdf_render_error", "page_load_error"]);

const DEVICES = new Set(["phone", "tablet", "desktop"]);
const SOURCES = new Set(["cache", "network"]);
const ERROR_KINDS = new Set(["missing", "permission", "invalid", "network", "rateLimited", "server", "unknown"]);

/** A finite, non-negative integer, or undefined. Client-supplied counters are
 *  clamped rather than trusted: this ends up in a database column, and an
 *  unbounded number from a browser is an unbounded value in a query. */
function counter(value: unknown, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return Math.min(Math.round(value), max);
}

function cleanString(value: unknown, max = 240): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.replace(/[\r\n\t]+/g, " ").trim();
  return clean ? clean.slice(0, max) : undefined;
}

function enumValue(value: unknown, allowed: Set<string>): string | undefined {
  const clean = cleanString(value, 24);
  return clean && allowed.has(clean) ? clean : undefined;
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type = cleanString(body.type, 48);
  if (!type || !EVENT_TYPES.has(type)) {
    return NextResponse.json({ error: "Invalid event type" }, { status: 400 });
  }

  const { limit, windowMs } = ratePolicy("readerEvents");
  const { success } = await rateLimit(`reader-events:${clientIp(request.headers)}`, limit, windowMs);
  if (!success) {
    // 204, not 429: a beacon cannot read a reply and must never retry. The
    // event is simply dropped.
    return new NextResponse(null, { status: 204 });
  }

  const durationMs = counter(body.durationMs, 600_000);
  // Rebuilt key by key: an unknown field in the payload cannot reach the row.
  const detail: Record<string, string | number | boolean> = {};
  const put = (key: string, value: string | number | boolean | undefined) => {
    if (value !== undefined) detail[key] = value;
  };
  put("device", enumValue(body.device, DEVICES));
  put("source", enumValue(body.source, SOURCES));
  put("kind", enumValue(body.kind, ERROR_KINDS));
  put("book_id", cleanString(body.bookId, 80));
  put("file", cleanString(body.file, 180));
  put("page", counter(body.page, 100_000));
  put("requests", counter(body.requests, 100_000));
  const bytes = counter(body.bytes, 10_000_000_000);
  put("bytes", bytes);
  // "Large" is the question the dashboard actually asks of file size, and a
  // boolean cannot be turned back into an identifying figure.
  if (bytes !== undefined) put("large", bytes >= 25 * 1024 * 1024);
  put("reloaded", typeof body.reloaded === "boolean" ? body.reloaded : undefined);
  put("prefetch_hits", counter(body.prefetchHits, 100_000));
  put("prefetch_misses", counter(body.prefetchMisses, 100_000));
  put("max_mounted", counter(body.maxMounted, 10_000));
  put("message", ERROR_TYPES.has(type) ? cleanString(body.message) : undefined);

  logAppEvent({
    kind: "reader_event",
    status: ERROR_TYPES.has(type) ? "error" : "ok",
    route: type,
    latencyMs: durationMs,
    detail,
  });

  // 204: the caller is a beacon. Nothing reads a body, and several of these
  // fire as the document is being torn down.
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
}
