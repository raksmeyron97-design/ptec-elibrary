// GET /api/search/native — the JSON face of the native search
// (lib/search/native-search.ts). Every search after the first page load comes
// through here; the first is rendered by the /search page with the same core
// (Phase 9.3, docs/UNIFIED-DISCOVERY.md). Metering, security logging and the
// query log are shared with the page (lib/search/serve-search.ts); this file
// only turns the answer into an HTTP response.

import { ServerTiming } from "@/lib/search/server-timing";
import { serveNativeSearch } from "@/lib/search/serve-search";

export type {
  ActiveSearchType,
  NativeSearchResponse,
  PageHit,
  SearchCounts,
  SearchFacets,
  SearchResult,
  SearchResultType,
  SearchScope,
  SearchSort,
} from "@/lib/search/native-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Per-leg durations as a Server-Timing header (lib/search/server-timing.ts):
  // what the per-leg budgets of Phase 9.1 are set from.
  const timing = new ServerTiming();
  const withTiming = (headers: Record<string, string> = {}) => ({ ...headers, "Server-Timing": timing.header() });

  const served = await serveNativeSearch(new URL(req.url).searchParams, req.headers, "/api/search/native", timing);
  switch (served.status) {
    case "rate_limited":
      return Response.json({ error: "Too many requests." }, { status: 429, headers: withTiming() });
    case "invalid":
      return Response.json({ error: "Missing or invalid query." }, { status: 400, headers: withTiming() });
    case "failed":
      return Response.json({ error: "Search failed. Please try again." }, { status: 500, headers: withTiming() });
  }
  // A partial answer (a leg failed or ran out of time) is never cached.
  return Response.json(served.outcome.response, {
    headers: withTiming({ "Cache-Control": served.outcome.partial.length ? "no-store" : "public, s-maxage=45, stale-while-revalidate=120" }),
  });
}
