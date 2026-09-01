import { NextResponse, type NextRequest } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { logSecurityEvent } from "@/lib/security-log";
import { classifySignatures } from "@/lib/security/model";
import { isVerifiedGoogleCrawler } from "@/lib/security/crawler";

export const dynamic = "force-dynamic";

/**
 * Catch-all for API paths that match no real route.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * Route enumeration is the reconnaissance stage of most attacks, and until now
 * it left no trace: an unmatched path produced Next's default 404 with nothing
 * recorded anywhere. This route makes `/api/*` probing observable — which is
 * the surface scanners actually walk (`/api/v1/users`, `/api/admin`,
 * `/api/.env`, `/api/graphql`).
 *
 * Next gives every more-specific route priority over a catch-all, so this
 * cannot shadow a real endpoint; it only sees requests that would have 404'd.
 *
 * ── What this deliberately does NOT cover ───────────────────────────────────
 * Probes OUTSIDE /api — `/wp-admin`, `/.env`, `/.git/config` at the site root —
 * are still not counted. They are handled by middleware, which runs in the Edge
 * runtime where the durable sink is not registered (the sink is installed by
 * `instrumentation.ts` in the Node runtime), and the global 404 page is
 * deliberately static and reads no headers, so it cannot record a client
 * either. Counting them would mean either an extra internal request per 404 —
 * amplification, during exactly the flood you don't want to amplify — or
 * making the 404 page dynamic, which would undo a documented performance
 * decision. Cloudflare already sees and can block those patterns at the edge;
 * that is the right layer for them. Recorded as a gap in
 * docs/SECURITY-MONITORING.md rather than papered over.
 *
 * ── Response ────────────────────────────────────────────────────────────────
 * A terse JSON 404. No route listing, no "did you mean", no framework
 * fingerprint — an enumeration response should give an enumerator nothing.
 */

function methodNotFound(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const path = url.pathname;

  // Verified crawlers are excluded from the count, not from the 404. Googlebot
  // following a stale link is the library working normally, and paging on it is
  // how an operator learns to ignore the channel (catalog hygiene rule 4). The
  // check is DNS-verified, so a spoofed User-Agent does not get the exemption.
  const ip = clientIp(request.headers);
  const userAgent = request.headers.get("user-agent");
  let crawler = false;
  try {
    crawler = await isVerifiedGoogleCrawler(ip === "unknown" ? null : ip, userAgent);
  } catch {
    crawler = false;
  }

  // Classify the path AND the query against known attack shapes. Only the
  // signature CLASS is recorded — never the matched text, because a stored
  // payload is a stored attack that re-executes in whatever renders it.
  const signatures = classifySignatures(`${path}${url.search}`);

  if (signatures.length) {
    logSecurityEvent({
      type: "injection_pattern",
      where: path,
      ip,
      requestId: request.headers.get("x-request-id") ?? undefined,
      target: signatures[0],
      detail: `matched ${signatures.length} signature class(es) on an unrouted API path`,
      metadata: {
        signature: signatures[0],
        signatureCount: signatures.length,
        method: request.method,
        crawler: crawler ? "verified" : undefined,
      },
    });
  } else {
    logSecurityEvent({
      type: "enumeration",
      where: path,
      ip,
      requestId: request.headers.get("x-request-id") ?? undefined,
      detail: `unrouted API path (${request.method})`,
      metadata: { method: request.method, crawler: crawler ? "verified" : undefined },
    });
  }

  return NextResponse.json(
    { error: "Not found" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

export const GET = handle;
export const POST = methodNotFound;
export const PUT = methodNotFound;
export const PATCH = methodNotFound;
export const DELETE = methodNotFound;
export const HEAD = methodNotFound;
export const OPTIONS = methodNotFound;
