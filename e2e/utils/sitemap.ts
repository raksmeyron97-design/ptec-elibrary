// e2e/utils/sitemap.ts — the whole sitemap as one <urlset>, following the
// index (/sitemap.xml names one child per resource type since SEO Phase 1.5).
// Child URLs carry the canonical origin, so only their path is requested here,
// against whatever server the suite runs on.

import type { APIRequestContext } from "@playwright/test";
import { fetchMergedSitemap } from "../../lib/verify/sitemap";

export async function mergedSitemap(request: APIRequestContext): Promise<string> {
  return fetchMergedSitemap("http://e2e.invalid", async (url) => {
    const { pathname, search } = new URL(url);
    const res = await request.get(`${pathname}${search}`);
    if (!res.ok()) throw new Error(`sitemap fetch ${pathname}: ${res.status()}`);
    return res.text();
  });
}
