// Scheme allow-list for a string used as an `<img src>` (or any DOM URL
// attribute standing in for one). Two call-site shapes feed this:
//   - a browser-minted "blob:" object URL from URL.createObjectURL(file) —
//     always safe, never attacker-controlled
//   - free-text a librarian/admin typed into a URL field (cover art, OG
//     image) — never validated beyond "is a string" before reaching JSX
//
// `javascript:`/`vbscript:` don't execute for <img src> in current browsers,
// but nothing here depends on that staying true, and the same string is
// sometimes reused where it would matter (e.g. copied into an <a href>).
// Restricting "data:" to actual raster image MIME types (never
// "image/svg+xml", which can carry an embedded <script>, nor "text/html")
// keeps the allow-list from becoming a no-op.
//
// Parses with the URL constructor and checks `.protocol` explicitly, the
// same shape as lib/zima.ts's toAllowedStorageUrl() — deliberately not a
// single regex test: `new URL(...)` rejects malformed input outright (a
// regex only matches a prefix, so a value crafted to *start* with an
// allowed scheme but parse as something else could slip a naive prefix
// check), and `.protocol` is what a browser actually dispatches on.
const SAFE_IMAGE_DATA_MIME_RE = /^image\/(?:png|jpe?g|gif|webp|avif|bmp|x-icon);/i;

export function isSafeImageSrc(url: string | null | undefined): url is string {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return false;
  }
  if (parsed.protocol === "https:" || parsed.protocol === "http:" || parsed.protocol === "blob:") {
    return true;
  }
  if (parsed.protocol === "data:") {
    return SAFE_IMAGE_DATA_MIME_RE.test(parsed.pathname);
  }
  return false;
}
