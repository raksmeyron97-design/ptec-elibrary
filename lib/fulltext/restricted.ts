// lib/fulltext/restricted.ts
//
// The 403 a full-text URL answers when the work is not open (SEO Phase 3.4):
// a small page — not a bare status — that says so and links to the record,
// where reading works as it always has. `noindex`, because the thing at this
// URL for this work is a refusal, not a document.

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function restrictedFulltextResponse(args: {
  locale: string;
  title: string;
  linkText: string;
  href: string;
}): Response {
  const lang = args.locale === "km" ? "km" : "en";
  const body = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, follow">
<title>${escapeHtml(args.title)}</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem;color:#1f2937;background:#faf8f2}a{color:#172554}</style>
</head>
<body>
<h1>${escapeHtml(args.title)}</h1>
<p><a href="${escapeHtml(args.href)}">${escapeHtml(args.linkText)}</a></p>
</body>
</html>`;
  return new Response(body, {
    status: 403,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "X-Robots-Tag": "noindex, follow",
    },
  });
}
