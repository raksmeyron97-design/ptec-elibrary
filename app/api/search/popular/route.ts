// Popular searches — the actual top queries typed by visitors, distinct from
// "trending" (an editorial/velocity signal computed elsewhere). Backed by the
// search_queries log written by /api/search/native.

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";

const WINDOW_DAYS = 30;
const ROW_LIMIT = 2000; // recent rows scanned for in-memory aggregation
const RESULT_LIMIT = 8;

function getClientIP(req: NextRequest): string {
  return clientIp(req.headers);
}

export async function GET(req: NextRequest) {
  const ip = getClientIP(req);
  const limit = await rateLimit(ip, 30, 60_000);
  if (!limit.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const supabase = createServiceClient();
    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data } = await supabase
      .from("search_queries")
      .select("term, normalized_term")
      .gte("searched_at", since)
      .order("searched_at", { ascending: false })
      .limit(ROW_LIMIT);

    const counts = new Map<string, { term: string; count: number }>();
    for (const row of data ?? []) {
      const key = row.normalized_term;
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else counts.set(key, { term: row.term, count: 1 });
    }

    const popular = [...counts.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, RESULT_LIMIT)
      .map((row) => row.term);

    return NextResponse.json(popular);
  } catch (error) {
    console.error("Error fetching popular searches:", error);
    return NextResponse.json([]);
  }
}
