// lib/seo/indexnow.ts
//
// IndexNow (SEO Phase 7.2): tell Bing, Yandex, Seznam and Naver that a public
// record changed, instead of waiting for their next crawl. Google does not use
// IndexNow; Search Console and the sitemap cover it.
//
// OFF until the owner sets INDEXNOW_KEY (docs/seo/RUNBOOK.md, Phase 7 §5).
// The key is public by design: the engines verify a submission by fetching
// /{key}.txt from this host, which next.config.ts rewrites to
// app/api/indexnow-key/[key]/route.ts.
//
// Pure: the key rule, the URLs a change announces and the request body.
// lib/seo/indexnow.server.ts sends it.

import { localeUrls } from "@/lib/seo/alternates";

export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

/** The protocol's key alphabet and length (8–128 of a-z, A-Z, 0-9, "-"). */
const KEY_RE = /^[A-Za-z0-9-]{8,128}$/;

/** The configured key, or null when IndexNow is off or the value is unusable. */
export function indexNowKey(raw: string | null | undefined): string | null {
  const key = raw?.trim() ?? "";
  return KEY_RE.test(key) ? key : null;
}

/**
 * Every URL one change touches: the English and the Khmer page of each path,
 * serialised exactly as the pages' own canonicals are (WHATWG URL encoding,
 * which is what Next writes into `<link rel="canonical">`).
 */
export function changedUrls(paths: readonly string[]): string[] {
  const out = new Set<string>();
  for (const path of paths) {
    if (!path.startsWith("/")) continue;
    const { en, km } = localeUrls(path);
    out.add(new URL(en).href);
    out.add(new URL(km).href);
  }
  return [...out];
}

export type IndexNowPayload = {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
};

/** The POST body for api.indexnow.org. Null when there is nothing to send. */
export function indexNowPayload(siteUrl: string, key: string, paths: readonly string[]): IndexNowPayload | null {
  const site = new URL(siteUrl);
  // Only this host's URLs: an engine refuses the whole batch over one foreign URL.
  const urlList = changedUrls(paths).filter((u) => new URL(u).host === site.host);
  if (urlList.length === 0) return null;
  return { host: site.host, key, keyLocation: `${site.origin}/${key}.txt`, urlList };
}
