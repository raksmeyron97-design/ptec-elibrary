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
const SAFE_IMAGE_SRC_RE =
  /^(https?:\/\/|blob:|data:image\/(?:png|jpe?g|gif|webp|avif|bmp|x-icon);)/i;

export function isSafeImageSrc(url: string | null | undefined): url is string {
  if (!url) return false;
  return SAFE_IMAGE_SRC_RE.test(url.trim());
}
