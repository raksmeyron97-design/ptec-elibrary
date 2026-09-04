/**
 * POST /api/reader/progress — save the reader's position, reliably, at teardown.
 *
 * WHY THIS EXISTS AS A ROUTE and not just the `saveReadingProgress` Server
 * Action: a Server Action is invoked with a plain `fetch()` that React owns,
 * and there is no way to set `keepalive` on it. A request still in flight when
 * the tab closes is therefore cancelled by the browser, so the last page a
 * reader turned to was lost precisely in the case that matters most — someone
 * reading to the end of a session and closing the tab. `fetch(..., { keepalive:
 * true })` is the only web platform guarantee that a request outlives the
 * document, and it needs a real endpoint to point at.
 *
 * The reader's debounced autosave still goes through the Server Action; both
 * paths share `upsertReadingProgress()` so the `max_progress_pct` high-water
 * rule cannot drift between them.
 *
 * Security shape — this is a write on behalf of the session, so:
 *   • the user comes from the session cookie, NEVER from the body, so a caller
 *     can only ever move their own position;
 *   • a cross-origin POST is refused (Server Actions get this for free);
 *   • the body is size-capped and both fields are validated before any query;
 *   • it is rate limited per user;
 *   • the service client is opened only AFTER authentication succeeds.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { upsertReadingProgress } from "@/lib/reading-progress";
import { isSameOriginRequest } from "@/lib/http/same-origin";
import { rateLimit } from "@/lib/rate-limit";
import { ratePolicy } from "@/lib/rate-limit-policy";

/** Bodies are two short fields; anything larger is not ours. */
const MAX_BODY_BYTES = 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { bookId, progressPct } = (body ?? {}) as {
    bookId?: unknown;
    progressPct?: unknown;
  };

  if (typeof bookId !== "string" || !UUID_RE.test(bookId)) {
    return NextResponse.json({ error: "A valid bookId is required." }, { status: 400 });
  }
  if (typeof progressPct !== "number" || !Number.isFinite(progressPct)) {
    return NextResponse.json({ error: "progressPct must be a number." }, { status: 400 });
  }

  // Session cookie decides WHOSE progress this is. The body never names a user.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { limit, windowMs } = ratePolicy("readerProgress");
  const rl = await rateLimit(`reader-progress:${user.id}`, limit, windowMs);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const saved = await upsertReadingProgress(user.id, bookId, progressPct);
  if (!saved) {
    return NextResponse.json({ error: "Could not save progress." }, { status: 500 });
  }

  // 204: the caller is a keepalive beacon fired at teardown. It cannot read a
  // body, and the page it belonged to is usually gone by the time this lands.
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "private, no-store" },
  });
}
