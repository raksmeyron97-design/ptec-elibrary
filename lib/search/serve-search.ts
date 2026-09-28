// One search, whichever door it came through (Phase 9.3, docs/UNIFIED-DISCOVERY.md).
//
// The native search has two doors: GET /api/search/native (every search the
// page runs after it has loaded) and the /search page itself, which renders the
// first page of results on the server. Both must meter, classify and log a
// search exactly alike — a door that forgot the rate limit would be a way round
// it, and one that forgot the query log would make the analytics undercount by
// every search that arrives as a page load. So neither door does any of it: both
// call this, and only turn the answer into their own kind of response.

import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { ratePolicy } from "@/lib/rate-limit-policy";
import { logSecurityEvent } from "@/lib/security-log";
import { classifySignatures } from "@/lib/security/model";
import { anonymousSessionHash, isLikelyBot } from "@/lib/search/analytics";
import type { ServerTiming } from "@/lib/search/server-timing";
import { clientIp } from "@/lib/client-ip";
import {
  logSearchQuery,
  parseNativeSearchParams,
  runNativeSearch,
  type NativeSearchOutcome,
  type NativeSearchRequest,
} from "@/lib/search/native-search";

/** Where a search came in — recorded on security events, never in the query log. */
export type SearchDoor = "/api/search/native" | "/search";

export type ServedSearch =
  | { status: "ok"; request: NativeSearchRequest; outcome: NativeSearchOutcome }
  | { status: "rate_limited" }
  | { status: "invalid" }
  | { status: "failed" };

export async function serveNativeSearch(
  searchParams: URLSearchParams,
  requestHeaders: { get(name: string): string | null },
  door: SearchDoor,
  timing: ServerTiming,
): Promise<ServedSearch> {
  // One bucket per client address for both doors: a page load that renders
  // results spends the unit the fetch it replaces would have spent.
  const ip = clientIp(requestHeaders);
  const { limit, windowMs } = ratePolicy("searchNative");
  if (!(await rateLimit(ip, limit, windowMs)).success) {
    logSecurityEvent({ type: "rate_limited", where: door, ip });
    return { status: "rate_limited" };
  }

  // Analytics context: obvious bots still get results but never enter the
  // query log; humans get a daily-rotating anonymous session hash (no raw
  // IP is ever stored — see lib/search/analytics.ts).
  const userAgent = requestHeaders.get("user-agent");
  const skipLogging = isLikelyBot(userAgent);
  const sessionHash = skipLogging
    ? null
    : anonymousSessionHash(ip, userAgent ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY);

  const request = parseNativeSearchParams(searchParams);
  if (!request) return { status: "invalid" };

  // Classify the raw query against known attack shapes. This is the library's
  // largest public input surface, so it is where injection probing actually
  // shows up. Recording is all that happens here — the query was already
  // sanitised, and one match is NOT an incident (a database textbook search
  // legitimately contains "UNION SELECT"): the detector needs several matches
  // of the same signature class before it opens one.
  //
  // Only the class is stored, never the query text.
  const signatures = classifySignatures(request.rawQ);
  if (signatures.length) {
    logSecurityEvent({
      type: "injection_pattern",
      where: door,
      ip,
      target: signatures[0],
      detail: `search query matched ${signatures.length} signature class(es)`,
      metadata: { signature: signatures[0], signatureCount: signatures.length },
    });
  }

  try {
    const outcome = await runNativeSearch(request, timing);
    if (!skipLogging && outcome.logTotal !== null) {
      logSearchQuery(createServiceClient(), request.q, outcome.logTotal, request.type, request.sort, sessionHash);
    }
    return { status: "ok", request, outcome };
  } catch (err) {
    console.error("[native-search] error:", err);
    return { status: "failed" };
  }
}
