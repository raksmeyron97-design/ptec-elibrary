// The 410 answer for a URL removed on purpose (url_redirects status 410,
// migration 0170). Middleware answers it directly — static HTML, no React, no
// data, no request to anything — because a removed record has no page to
// render and a 410 must not cost the origin a render.
//
// 410 rather than 404: it tells a search engine the removal is deliberate, so
// the URL leaves the index on the next crawl instead of being retried for
// weeks. It never says WHY: a removal can be a rights decision, and the reason
// stays in the database (rights material never reaches a public surface).

import { NextResponse } from "next/server";

type Copy = { lang: "en" | "km"; heading: string; body: string; link: string; href: string };

const COPY: Record<"en" | "km", Copy> = {
  en: {
    lang: "en",
    heading: "This page has been removed",
    body: "The item that was here is no longer in the PTEC e-Library.",
    link: "Browse the library's books",
    href: "/books",
  },
  // TODO(km-review): listed in docs/seo/KM-REVIEW.md (WI-1, the 410 page).
  km: {
    lang: "km",
    heading: "ទំព័រនេះត្រូវបានដកចេញ",
    body: "ឯកសារដែលធ្លាប់នៅទីនេះ លែងមាននៅក្នុងបណ្ណាល័យអេឡិចត្រូនិក PTEC ទៀតហើយ។",
    link: "រកមើលសៀវភៅក្នុងបណ្ណាល័យ",
    href: "/km/books",
  },
};

function section(copy: Copy, level: "h1" | "h2"): string {
  return (
    `<section lang="${copy.lang}">` +
    `<${level}>${copy.heading}</${level}>` +
    `<p>${copy.body}</p>` +
    `<p><a href="${copy.href}">${copy.link}</a></p>` +
    `</section>`
  );
}

/** The HTML body, the reader's language first. Exported for the test. */
export function goneHtml(locale: "en" | "km"): string {
  const first = COPY[locale];
  const second = COPY[locale === "km" ? "en" : "km"];
  const title = locale === "km" ? `${first.heading} · PTEC` : `${first.heading} · PTEC e-Library`;
  return (
    `<!doctype html><html lang="${first.lang}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="robots" content="noindex">` +
    `<title>${title}</title>` +
    `<style>body{font-family:system-ui,"Noto Sans Khmer",sans-serif;max-width:36rem;margin:4rem auto;padding:0 1rem;line-height:1.6;color:#172554;background:#faf8f2}` +
    `h1{font-size:1.5rem}h2{font-size:1.15rem;margin-top:2.5rem}a{color:#1d4ed8}` +
    `@media (prefers-color-scheme:dark){body{color:#e5e7eb;background:#0b1220}a{color:#93c5fd}}</style>` +
    `</head><body><main>${section(first, "h1")}${section(second, "h2")}</main></body></html>`
  );
}

export function goneResponse(locale: "en" | "km"): NextResponse {
  return new NextResponse(goneHtml(locale), {
    status: 410,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-robots-tag": "noindex",
      "cache-control": "public, max-age=300",
    },
  });
}
