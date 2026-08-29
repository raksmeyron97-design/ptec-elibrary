/**
 * Zima Storage API utilities.
 * No "use server" — safe to import from both Server Actions and API Route Handlers.
 */

function zimaConfig(): { apiUrl: string; apiKey: string } {
  const apiUrl = process.env.ZIMA_API_URL;
  const apiKey = process.env.ZIMA_API_KEY;
  if (!apiUrl || !apiKey) {
    throw new Error("Zima storage is not configured (ZIMA_API_URL and ZIMA_API_KEY required)");
  }
  return { apiUrl, apiKey };
}

/** The Zima API host and its cdn./base variants, derived from ZIMA_API_URL. */
function zimaBaseHosts(): string[] {
  const apiUrl = process.env.ZIMA_API_URL;
  if (!apiUrl) return [];
  try {
    const apiHost = new URL(apiUrl).hostname.toLowerCase();
    const baseHost = apiHost.replace(/^api\./, "");
    return [apiHost, `cdn.${baseHost}`, baseHost];
  } catch {
    return [];
  }
}

/** Returns true if the given URL is served by the Zima CDN / API. */
export function isZimaUrl(fileUrl: string): boolean {
  if (!process.env.ZIMA_API_URL) return false;
  if (!fileUrl.startsWith("http://") && !fileUrl.startsWith("https://")) return false;
  try {
    const fileHost = new URL(fileUrl).hostname.toLowerCase();
    return zimaBaseHosts().includes(fileHost);
  } catch {
    return false;
  }
}

// Host suffixes for the storage backends this app legitimately proxies files
// from. This is an ALLOW-LIST, and that is the SSRF control: `file_url` values
// come from DB rows an admin/librarian can set to an arbitrary string, so a
// server-side fetch of one must never reach an internal target. IP literals,
// `localhost`, `*.local`, and cloud metadata endpoints (169.254.169.254) match
// nothing here and are refused. Mirrors the storage hosts already trusted by
// the CSP (lib/csp.ts) and next.config images.remotePatterns.
const STORAGE_HOST_SUFFIXES = [
  ".r2.dev",
  ".r2.cloudflarestorage.com",
  ".blob.vercel-storage.com",
  ".supabase.co",
  ".googleusercontent.com",
];
const STORAGE_HOSTS_EXACT = ["drive.google.com"];

/**
 * True if `fileUrl` is a full http(s) URL pointing at an allow-listed storage
 * host. Only the configured Zima host may be plain http (the documented LAN /
 * tunnel case where the container speaks http internally); every other host
 * must be https. Everything else — internal IPs, localhost, unknown hosts — is
 * rejected. Used to gate every server-side file proxy against SSRF.
 */
export function isAllowedStorageUrl(fileUrl: string): boolean {
  let u: URL;
  try {
    u = new URL(fileUrl);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const host = u.hostname.toLowerCase();
  const zimaHosts = zimaBaseHosts();
  if (u.protocol === "http:" && !zimaHosts.includes(host)) return false;
  if (zimaHosts.includes(host)) return true;
  if (STORAGE_HOSTS_EXACT.includes(host)) return true;
  return STORAGE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/**
 * Sanitize a filename before it becomes a storage object name: strip any path
 * component (so `../../x` and `a/b/c` can't traverse the destination folder),
 * drop control characters and null bytes, and collapse whitespace. Falls back
 * to a safe default if nothing usable remains.
 */
export function sanitizeUploadName(name: string): string {
  // Take the basename only, on both separators.
  const base = name.split(/[/\\]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, "") // strip control chars incl. NUL
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "") // no leading dots ("." / ".." / dotfiles)
    .trim();
  return cleaned.length > 0 ? cleaned.slice(0, 200) : "upload";
}

/**
 * Upload a file to Zima Storage.
 * @param file  The File or Blob to upload.
 * @param folder  Destination folder (e.g. "books", "posts", "team").
 * @returns The public CDN URL of the uploaded file.
 */
export async function zimaUpload(
  file: File | Blob,
  folder: string,
  filename?: string,
): Promise<string> {
  const { apiUrl, apiKey } = zimaConfig();

  const form = new FormData();
  const rawName = filename ?? (file instanceof File ? file.name : "upload");
  const name = sanitizeUploadName(rawName);
  form.append("file", new File([file], name, { type: file.type }));

  const res = await fetch(`${apiUrl}/api/upload`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      // HTTP headers are ByteStrings (chars 0-255 only). Non-ASCII folder
      // names (e.g. Khmer slugs) would crash fetch(). Percent-encode them
      // as a safety net — callers should already pass ASCII-only paths.
      "x-folder": /[^\x00-\xff]/.test(folder) ? encodeURIComponent(folder) : folder,
    },
    body: form,
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`Zima upload failed (${res.status}): ${msg}`);
  }

  const json = await res.json();
  // Accept common response shapes
  let url: string | undefined =
    json.url ?? json.publicUrl ?? json.file_url ?? json.cdnUrl ?? json.file?.url;
  if (!url) throw new Error("Zima API did not return a URL");
  // Normalize to HTTPS so next/image and browser fetch work correctly
  if (url.startsWith("http://")) url = "https://" + url.slice(7);
  return url;
}

/**
 * Extract the relative path (object key) from a Zima file URL.
 * e.g. "https://api.storage-ptec.online/files/books/foo.pdf" → "books/foo.pdf"
 */
export function zimaRelativePath(fileUrl: string): string | null {
  try {
    const pathname = new URL(fileUrl).pathname; // "/files/books/foo.pdf"
    const match = pathname.match(/^\/files\/(.+)$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Delete a file from Zima Storage by its URL.
 * No-ops silently for non-Zima URLs (e.g. legacy R2 or Vercel Blob records).
 */
export async function zimaDelete(fileUrl: string): Promise<void> {
  if (!fileUrl || !isZimaUrl(fileUrl)) return;

  const apiUrl = process.env.ZIMA_API_URL;
  const apiKey = process.env.ZIMA_API_KEY;
  if (!apiUrl || !apiKey) return;

  const relativePath = zimaRelativePath(fileUrl);
  if (!relativePath) {
    console.warn(`[zima] could not extract path from URL: ${fileUrl}`);
    return;
  }

  try {
    // Verified live contract (2026-07-15): POST /api/delete { path } is the
    // endpoint the deployed Zima server actually implements; DELETE
    // /api/files/{path} returns 404 there, so it is only kept as a fallback.
    const res = await fetch(`${apiUrl}/api/delete`, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ path: relativePath, url: fileUrl }),
    });

    if (!res.ok) {
      const fallback = await fetch(`${apiUrl}/api/files/${relativePath}`, {
        method: "DELETE",
        headers: { "x-api-key": apiKey },
      });
      if (!fallback.ok) {
        console.warn(`[zima] delete failed for ${relativePath}: primary=${res.status}, fallback=${fallback.status}`);
      }
    }
  } catch (err) {
    console.error("[zima] delete error:", err);
  }
}

/**
 * Fetch a file from Zima CDN (or any HTTPS URL), forwarding an optional Range header.
 * Returns the raw fetch Response so the caller can stream it.
 */
export async function zimaFetch(fileUrl: string, rangeHeader?: string | null): Promise<Response> {
  // SSRF guard: `fileUrl` originates from a DB row an admin can set to an
  // arbitrary string. Never let the server fetch a non-storage host (internal
  // services, cloud metadata, localhost). Callers treat a non-ok Response as
  // "file unavailable" and return 404, so a blocked URL degrades cleanly.
  if (!isAllowedStorageUrl(fileUrl)) {
    console.warn(`[zima] refused to proxy non-allowlisted URL host`);
    return new Response("Blocked", { status: 502 });
  }
  const headers: HeadersInit = {};
  if (rangeHeader) headers["Range"] = rangeHeader;
  return fetch(fileUrl, { headers });
}

/** Extract the Zima folder name from an object key path (first path segment). */
export function folderFromKey(key: string): string {
  return key.split("/")[0] ?? "files";
}
