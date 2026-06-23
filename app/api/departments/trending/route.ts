/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

function getClientIP(req: NextRequest): string {
  // Prefer x-real-ip (set by the platform, unspoofable); the left-most
  // x-forwarded-for value is client-controlled and must not gate rate limits.
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return "unknown";
}

export async function GET(req: NextRequest) {
  const ip = getClientIP(req);
  const limit = await rateLimit(ip, 30, 60000); // Max 30 requests per minute
  if (!limit.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("books")
      .select("departments!inner(name)")
      .eq("is_published", true);

    const seen = new Set<string>();
    for (const row of data ?? []) {
      const dept = (row.departments as any)?.name;
      if (dept) seen.add(dept);
    }
    const result = [...seen].sort((a, b) => a.localeCompare(b)).slice(0, 8);

    if (result.length === 0) {
      return NextResponse.json(["Pedagogy", "Mathematics", "Science", "History"]);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching trending departments:", error);
    return NextResponse.json(["Pedagogy", "Mathematics", "Science", "History"]);
  }
}
