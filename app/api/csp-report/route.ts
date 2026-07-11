import { NextRequest, NextResponse } from "next/server";
import { logSecurityEvent } from "@/lib/security-log";

/**
 * Sink for browser CSP violation reports (see middleware.ts — the stricter
 * report-only policy points here via both `report-uri` and `report-to`).
 *
 * Accepts the legacy `application/csp-report` shape ({"csp-report": {...}})
 * and the Reporting-API `application/reports+json` shape ([{type,body},...]).
 * Always responds 204 — a report sink must never error back at the browser.
 */

const MAX_BODY_BYTES = 16 * 1024;

// In-memory dedupe so one broken page doesn't emit thousands of identical
// log lines. Per-instance and reset on cold start — fine for a sampling sink.
const seen = new Map<string, number>();
const DEDUPE_WINDOW_MS = 10 * 60 * 1000;
const MAX_KEYS = 500;

function shouldLog(key: string): boolean {
  const now = Date.now();
  const last = seen.get(key);
  if (last && now - last < DEDUPE_WINDOW_MS) return false;
  if (seen.size >= MAX_KEYS) seen.clear();
  seen.set(key, now);
  return true;
}

/** Query strings can carry tokens (auth callbacks) — never log them. */
function stripQuery(url: unknown): string {
  if (typeof url !== "string") return "";
  return url.split(/[?#]/)[0].slice(0, 200);
}

type RawReport = Record<string, unknown>;

function normalize(body: unknown): RawReport[] {
  if (Array.isArray(body)) {
    // Reporting API: [{ type: "csp-violation", body: {...} }, ...]
    return body
      .filter((r) => r && typeof r === "object")
      .map((r) => (r as RawReport).body as RawReport)
      .filter((b): b is RawReport => !!b && typeof b === "object");
  }
  if (body && typeof body === "object") {
    const legacy = (body as RawReport)["csp-report"];
    if (legacy && typeof legacy === "object") return [legacy as RawReport];
    return [body as RawReport];
  }
  return [];
}

export async function POST(request: NextRequest) {
  try {
    const raw = await request.text();
    if (!raw || raw.length > MAX_BODY_BYTES) {
      return new NextResponse(null, { status: 204 });
    }
    const reports = normalize(JSON.parse(raw)).slice(0, 5);

    for (const r of reports) {
      const directive = String(
        r["effective-directive"] ?? r["effectiveDirective"] ?? r["violated-directive"] ?? "unknown",
      ).slice(0, 60);
      const blocked = stripQuery(r["blocked-uri"] ?? r["blockedURL"]);
      const doc = stripQuery(r["document-uri"] ?? r["documentURL"]);

      const key = `${directive}|${blocked}`;
      if (!shouldLog(key)) continue;

      logSecurityEvent({
        type: "csp_violation",
        where: doc || "/api/csp-report",
        detail: `directive=${directive} blocked=${blocked || "inline/eval"}`,
      });
    }
  } catch {
    // Malformed reports are dropped silently.
  }
  return new NextResponse(null, { status: 204 });
}
