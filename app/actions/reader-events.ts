"use server";

import { logReaderOpen } from "@/lib/analytics/events";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES = new Set(["book", "research_report", "publication"]);

/**
 * Fire-and-forget "reader opened" event (funnel stage between detail view
 * and download). Validates inputs server-side; bot filtering, session
 * hashing and per-IP rate limiting happen inside logReaderOpen.
 */
export async function recordReaderOpen(
  contentType: "book" | "research_report" | "publication",
  contentId: string,
): Promise<void> {
  if (!TYPES.has(contentType) || !UUID_RE.test(contentId)) return;
  await logReaderOpen(contentType, contentId);
}
