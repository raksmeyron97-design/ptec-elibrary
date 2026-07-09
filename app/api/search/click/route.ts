import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/security-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TYPES = new Set(["book", "research", "publication", "catalog", "post"]);
const VALID_ACTIONS = new Set(["cover", "title", "view", "read", "download", "cite", "save", "no-results-popular"]);

function getClientIP(req: NextRequest): string {
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return "unknown";
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

function hasKhmer(text: string): boolean {
  return /[\u1780-\u17ff]/.test(text);
}

export async function POST(req: NextRequest) {
  const ip = getClientIP(req);
  const rl = await rateLimit(`search-click:${ip}`, 120, 60_000);
  if (!rl.success) {
    logSecurityEvent({ type: "rate_limited", where: "/api/search/click", ip });
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  const term = cleanText(payload.q, 240);
  const resultType = cleanText(payload.resultType, 32);
  const resultId = cleanText(payload.resultId, 80);
  const resultUrl = cleanText(payload.resultUrl, 400);
  const resultTitle = cleanText(payload.resultTitle, 240);
  const actionRaw = cleanText(payload.action, 40);
  const action = VALID_ACTIONS.has(actionRaw) ? actionRaw : "view";

  if (!term || !VALID_TYPES.has(resultType) || !resultId || !resultUrl.startsWith("/")) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    const db = createServiceClient();
    const { error } = await db.from("search_result_clicks").insert({
      term,
      query_language: hasKhmer(term) ? "km" : "en",
      result_type: resultType,
      result_id: resultId,
      result_url: resultUrl,
      result_title: resultTitle || null,
      action,
    });
    if (error) {
      if (error.code !== "42P01" && error.code !== "42703" && error.code !== "PGRST204") {
        console.error("[search-click]", error.message);
      }
      return NextResponse.json({ ok: true });
    }
  } catch (error) {
    console.error("[search-click]", error);
  }

  return NextResponse.json({ ok: true });
}
