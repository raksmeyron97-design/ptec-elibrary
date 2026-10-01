// lib/seo/indexnow.server.ts
//
// Sends an IndexNow notification (lib/seo/indexnow.ts) after the response, so
// a librarian's save never waits on a third party, and never throws: a failed
// ping is a log line, not a failed save. Three switches must all say yes:
//
//   1. INDEXNOW_KEY is set to a valid key (off by default);
//   2. this is an indexable environment (lib/seo/indexing.ts) — a preview,
//      CI or a laptop must never announce production URLs;
//   3. System Settings → SEO → indexing is on (read when the ping is sent).

import "server-only";
import { after } from "next/server";
import { isIndexableEnvironment } from "@/lib/seo/indexing";
import { INDEXNOW_ENDPOINT, indexNowKey, indexNowPayload } from "@/lib/seo/indexnow";
import { SITE_URL } from "@/lib/seo/site";
import { getSiteConfig } from "@/lib/system-settings/config";

const TIMEOUT_MS = 10_000;

async function send(key: string, paths: readonly string[]): Promise<void> {
  const config = await getSiteConfig().catch(() => null);
  if (!config?.seo.indexingEnabled) return;
  const payload = indexNowPayload(SITE_URL, key, paths);
  if (!payload) return;
  try {
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // 200 and 202 are both success; 422 means a URL is not on the key's host.
    console.info(`[indexnow] ${res.status} for ${payload.urlList.length} URL(s)`);
  } catch (error) {
    console.warn("[indexnow] not sent:", error instanceof Error ? error.message : error);
  }
}

/** Announce that the public pages at `paths` (locale-free, e.g. "/books/x") changed. */
export function announcePublicChange(paths: readonly string[]): void {
  const key = indexNowKey(process.env.INDEXNOW_KEY);
  if (!key || !isIndexableEnvironment() || paths.length === 0) return;
  try {
    after(() => send(key, paths));
  } catch {
    // Outside a request (a script, a test): there is no "after the response".
  }
}
