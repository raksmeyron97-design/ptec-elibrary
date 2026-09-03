import { NextResponse, type NextRequest } from "next/server";

const EVENT_TYPES = new Set([
  "pdf_load_error",
  "pdf_load_slow",
  "pdf_render_error",
  // Time to the first PAINTED page, with the request count and byte total
  // behind it. The measure the large-PDF work exists to move; see
  // docs/LARGE-PDF-PERFORMANCE-AUDIT.md. Counts only — never document content.
  "pdf_first_page",
  "broken_file_report",
]);

/** A finite, non-negative integer, or undefined. Client-supplied counters are
 *  clamped rather than trusted: this ends up in logs, and an unbounded number
 *  from a browser is an unbounded string in a log line. */
function counter(value: unknown, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return Math.min(Math.round(value), max);
}

function cleanString(value: unknown, max = 240): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.replace(/[\r\n\t]+/g, " ").trim();
  return clean ? clean.slice(0, max) : undefined;
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

  const event = {
    evt: "reader",
    type,
    bookId: cleanString(body.bookId, 80),
    file: cleanString(body.file, 180),
    page: typeof body.page === "number" && Number.isFinite(body.page) ? body.page : undefined,
    durationMs:
      typeof body.durationMs === "number" && Number.isFinite(body.durationMs)
        ? Math.round(body.durationMs)
        : undefined,
    message: cleanString(body.message),
    // Delivery cost of the first page. `file` is already reduced to a path with
    // no query string by the client (safePdfPath), so no signed URL, token or
    // storage host can reach this log line.
    requests: counter(body.requests, 100_000),
    bytes: counter(body.bytes, 10_000_000_000),
    source: cleanString(body.source, 16),
    at: new Date().toISOString(),
  };

  console.warn("[reader-event]", JSON.stringify(event));
  return NextResponse.json({ ok: true });
}
