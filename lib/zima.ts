/**
 * Zima Storage API utilities.
 * No "use server" — safe to import from both Server Actions and API Route Handlers.
 */

import { describeStoragePathError } from "@/lib/storage/folder-name";

/**
 * Zima's upload quota, READ FROM THE SERVER, not guessed.
 *
 * `POST /api/upload` — the endpoint zimaUpload() calls — is wrapped by
 * `uploadLimiter = makeLimiter({ name: 'upload', windowMs: 3600_000, max:
 * rl.uploadPerHour })` in the storage server's index.js, and its production
 * `.env` sets `RL_UPLOAD_PER_HOUR=60`. So:
 *
 *   * **60 uploads per hour**, counted per FILE, not per book — a book with a
 *     cover spends two.
 *   * a **fixed** one-hour window (not sliding), so `retryAfterSeconds` counts
 *     down to the window's end and hammering does not extend it;
 *   * keyed by client IP — and every upload reaches Zima from THIS SERVER, so
 *     the whole application shares one bucket, bulk import included;
 *   * charged BEFORE the folder is validated, so a rejected row still spends
 *     quota. That is why the 86-row run stopped where it did: 23 books × 2
 *     files + 14 folder-rejected rows = exactly 60.
 *
 * 86 books ≈ 172 files ≈ 2.9 hours at this rate. The importer waits it out
 * correctly, but the real remedy is to raise `RL_UPLOAD_PER_HOUR` on the
 * storage box for bulk-import work; see docs/BULK-IMPORT.md.
 */
export const ZIMA_UPLOADS_PER_HOUR = 60;

/**
 * A Zima upload that failed with a status the CALLER must be able to act on.
 *
 * Without this the route caught a plain Error and answered 500, so the bulk
 * importer could not tell "this file is broken" (give up) from "you are rate
 * limited for the next 54 minutes" (wait and retry) — and treated a whole
 * batch of the second as the first, failing 63 rows in a few seconds.
 */
export class ZimaUploadError extends Error {
  readonly status: number;
  /** Seconds until the quota window resets, when the server told us. */
  readonly retryAfterSeconds?: number;
  /** True for a status worth retrying: rate limit or a transient server fault. */
  readonly retryable: boolean;

  constructor(message: string, status: number, retryAfterSeconds?: number) {
    super(message);
    this.name = "ZimaUploadError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
    this.retryable = status === 429 || status === 408 || (status >= 500 && status <= 599);
  }
}

export function isZimaUploadError(err: unknown): err is ZimaUploadError {
  return err instanceof ZimaUploadError;
}

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

/** A DNS hostname made only of LDH labels — no IP literals, no userinfo tricks. */
const HOSTNAME_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))*$/;

/**
 * Parse `fileUrl` and return it REBUILT on an allow-listed origin, or null.
 *
 * This is the SSRF control for every server-side file proxy, and it is
 * deliberately a rebuild rather than a boolean check: the returned URL's host
 * is assigned from the allow-list itself, so no parser differential between
 * this check and `fetch()` (embedded credentials, `\` in the authority, an
 * unexpected port) can make the request land somewhere the check did not
 * approve. Everything after the authority — path, query, fragment — is
 * preserved byte-for-byte, which matters because R2 presigned URLs sign it.
 *
 * Only the configured Zima host may be plain http (the documented LAN / tunnel
 * case where the container speaks http internally) or carry a non-default
 * port; every other host must be https on its default port. Internal IPs,
 * localhost, `*.local` and unknown hosts match nothing and are refused.
 */
export function toAllowedStorageUrl(fileUrl: string): URL | null {
  let u: URL;
  try {
    u = new URL(fileUrl);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  // Embedded credentials are how `https://allowed.host@evil.example/` fools a
  // naive check; nothing legitimate here uses them.
  if (u.username || u.password) return null;

  const host = u.hostname.toLowerCase();
  if (!HOSTNAME_RE.test(host)) return null;

  const zimaHosts = zimaBaseHosts();
  // Take the host FROM the allow-list wherever the match is exact, so the
  // rebuilt origin cannot be attacker-influenced at all.
  const allowedHost =
    zimaHosts.find((h) => h === host) ??
    STORAGE_HOSTS_EXACT.find((h) => h === host) ??
    (STORAGE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix)) ? host : null);
  if (allowedHost === null) return null;

  const isZimaHost = zimaHosts.includes(allowedHost);
  if (u.protocol === "http:" && !isZimaHost) return null;
  if (u.port && !isZimaHost) return null;

  const safe = new URL(u.href);
  safe.hostname = allowedHost;
  if (!isZimaHost) {
    safe.protocol = "https:";
    safe.port = "";
  }
  return safe;
}

/**
 * Boolean form of {@link toAllowedStorageUrl}, kept for call sites that only
 * need the verdict. Prefer the URL form when you are about to fetch.
 */
export function isAllowedStorageUrl(fileUrl: string): boolean {
  return toAllowedStorageUrl(fileUrl) !== null;
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
/** Upload budget for one file. See the note on the fetch below. */
const ZIMA_UPLOAD_TIMEOUT_MS = 240_000;

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

  let res: Response;
  try {
    res = await fetch(`${apiUrl}/api/upload`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        // HTTP headers are ByteStrings (chars 0-255 only). Non-ASCII folder
        // names (e.g. Khmer slugs) would crash fetch(). Percent-encode them
        // as a safety net — callers should already pass ASCII-only paths.
        "x-folder": /[^\x00-\xff]/.test(folder) ? encodeURIComponent(folder) : folder,
      },
      body: form,
      // Bounded, because an unreachable or black-holed storage host otherwise
      // hangs this fetch indefinitely and the caller has no way to tell that
      // from a slow 100 MB transfer — the admin form simply shows
      // "Uploading PDF…" forever. Matches the batch path's existing budget
      // (BATCH_UPLOAD_TIMEOUT_MS in /api/admin/bulk-upload) and stays inside
      // the routes' maxDuration of 300 s, so the operator gets a real error
      // instead of a killed request.
      signal: AbortSignal.timeout(ZIMA_UPLOAD_TIMEOUT_MS),
    });
  } catch (err) {
    // A timeout or a dead connection is a ZimaUploadError like any other, so
    // both upload routes map it to a retryable 503 with a real sentence.
    // Raw, it was an AbortError that fell through to the generic handler and
    // reached the operator as a bare 500 — and, in the bulk importer, as a row
    // that had "failed" for no stated reason.
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new ZimaUploadError(
      timedOut
        ? `Storage did not respond within ${Math.round(ZIMA_UPLOAD_TIMEOUT_MS / 1000)}s. The file was not uploaded.`
        : `Storage is unreachable: ${err instanceof Error ? err.message : "connection failed"}.`,
      // 503 makes `retryable` true via the constructor's own rule, so the
      // importer's queue waits and retries instead of failing the row outright.
      503,
    );
  }

  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    // "Invalid target folder" is all the storage server says when a path
    // segment breaks its `/^[a-zA-Z0-9_\- ក-៿]{1,80}$/` rule. Callers should
    // have caught that with describeStoragePathError() before sending; if one
    // slipped through, at least name the actual defect here.
    if (res.status === 400 && msg.includes("Invalid target folder")) {
      const problem = describeStoragePathError(folder);
      throw new ZimaUploadError(
        problem ?? `Storage rejected the destination folder "${folder}".`,
        400,
      );
    }
    // Zima's own body carries `retryAfterSeconds`; its `Retry-After` header is
    // the same number. Prefer the body, fall back to the header.
    let retryAfter: number | undefined;
    try {
      const parsed = JSON.parse(msg) as { retryAfterSeconds?: number };
      if (typeof parsed.retryAfterSeconds === "number") retryAfter = parsed.retryAfterSeconds;
    } catch {
      // not JSON — fall through to the header
    }
    if (retryAfter === undefined) {
      const header = Number(res.headers.get("retry-after"));
      if (Number.isFinite(header) && header > 0) retryAfter = header;
    }
    if (res.status === 429) {
      throw new ZimaUploadError(
        `Storage rate limit reached (${ZIMA_UPLOADS_PER_HOUR} uploads/hour).`,
        429,
        retryAfter,
      );
    }
    throw new ZimaUploadError(`Zima upload failed (${res.status}): ${msg}`, res.status, retryAfter);
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
 * Validate an object key before it is interpolated into a Zima API path.
 *
 * The key is derived from a DB-stored URL, so it is untrusted input on its way
 * into a server-side request URL. Reject rather than rewrite: traversal
 * segments, an absolute or protocol-relative path (`/x`, `//evil.example/x`,
 * which would move the request off the API origin), backslashes, control
 * characters, and any `?`/`#` that could truncate the path or append
 * parameters. Folder structure is otherwise preserved as-is — the value is
 * already percent-encoded by `URL`, so re-encoding it here would corrupt keys
 * containing spaces or Khmer characters.
 */
export function safeZimaObjectPath(relativePath: string): string | null {
  if (!relativePath || relativePath.length > 1024) return null;
  if (relativePath.startsWith("/") || relativePath.includes("\\")) return null;
  if (/[\u0000-\u001f\u007f?#]/.test(relativePath)) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(relativePath);
  } catch {
    return null; // malformed percent-encoding
  }
  // Check traversal on both the raw and decoded forms, so `%2e%2e%2f` is caught.
  for (const form of [relativePath, decoded]) {
    if (form.split("/").some((seg) => seg === "." || seg === "..")) return null;
  }
  return relativePath;
}

/**
 * Build a URL for a Zima API endpoint. The origin always comes from
 * ZIMA_API_URL; `objectPath`, when given, is appended as validated path
 * segments and the result is re-checked against that origin, so a crafted key
 * can never redirect the request to another host.
 */
function zimaApiEndpoint(apiUrl: string, endpoint: string, objectPath?: string): URL | null {
  let base: URL;
  try {
    base = new URL(apiUrl);
  } catch {
    return null;
  }
  const target = new URL(base.href);
  const prefix = base.pathname.replace(/\/+$/, "");
  target.pathname = objectPath ? `${prefix}${endpoint}/${objectPath}` : `${prefix}${endpoint}`;
  return target.origin === base.origin ? target : null;
}

/**
 * Delete a file from Zima Storage by its URL.
 * No-ops silently for non-Zima URLs (e.g. legacy R2 or Vercel Blob records).
 */
/** Cleanup is best-effort: bound it rather than inherit the OS TCP timeout. */
const ZIMA_DELETE_TIMEOUT_MS = 10_000;

export async function zimaDelete(fileUrl: string): Promise<void> {
  if (!fileUrl || !isZimaUrl(fileUrl)) return;

  const apiUrl = process.env.ZIMA_API_URL;
  const apiKey = process.env.ZIMA_API_KEY;
  if (!apiUrl || !apiKey) return;

  const extracted = zimaRelativePath(fileUrl);
  const relativePath = extracted ? safeZimaObjectPath(extracted) : null;
  if (!relativePath) {
    console.warn("[zima] refused to delete: unusable object path in stored URL");
    return;
  }

  const deleteEndpoint = zimaApiEndpoint(apiUrl, "/api/delete");
  const fallbackEndpoint = zimaApiEndpoint(apiUrl, "/api/files", relativePath);
  if (!deleteEndpoint || !fallbackEndpoint) {
    console.warn("[zima] refused to delete: ZIMA_API_URL is not a usable base URL");
    return;
  }

  try {
    // Verified live contract (2026-07-15): POST /api/delete { path } is the
    // endpoint the deployed Zima server actually implements; DELETE
    // /api/files/{path} returns 404 there, so it is only kept as a fallback.
    //
    // BOTH calls are bounded. Neither had a timeout, so an unreachable or
    // black-holed storage host left them waiting on the OS TCP timeout — 75+
    // seconds each, 150 for the pair. Nothing here is worth that: this is a
    // best-effort cleanup whose callers are all on a path where something has
    // ALREADY failed, and every one of them was made to wait for it. The upload
    // form sat on its "Saving…" spinner for the whole of it before showing the
    // error the librarian needed to see.
    const res = await fetch(deleteEndpoint, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ path: relativePath, url: fileUrl }),
      signal: AbortSignal.timeout(ZIMA_DELETE_TIMEOUT_MS),
    });

    if (!res.ok) {
      const fallback = await fetch(fallbackEndpoint, {
        method: "DELETE",
        headers: { "x-api-key": apiKey },
        signal: AbortSignal.timeout(ZIMA_DELETE_TIMEOUT_MS),
      });
      if (!fallback.ok) {
        console.warn(`[zima] delete failed: primary=${res.status}, fallback=${fallback.status}`);
      }
    }
  } catch (err) {
    // A timeout lands here like any other failure, and is swallowed on purpose:
    // an object we could not remove is a stray file for
    // scripts/audit-book-storage.ts to reconcile, never a reason to fail the
    // caller a second time.
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
  const target = toAllowedStorageUrl(fileUrl);
  if (!target) {
    console.warn(`[zima] refused to proxy non-allowlisted URL host`);
    return new Response("Blocked", { status: 502 });
  }
  const headers: HeadersInit = {};
  if (rangeHeader) headers["Range"] = rangeHeader;

  // Identify the library to the storage service on its OWN storage hosts only.
  //
  // Zima meters /files reads per client IP. Every reader's bytes are fetched by
  // this server, so the whole library shared one 300-requests-a-minute bucket
  // with the anonymous internet — and pdf.js reads a book in many ranged
  // requests, so a handful of concurrent readers of large books reached it.
  // A recognised key moves these reads into their own, higher bucket
  // (docs/LARGE-PDF-PERFORMANCE-AUDIT.md §3d).
  //
  // Sent ONLY to an allow-listed Zima host, never to the legacy R2/blob hosts
  // this function also proxies: `toAllowedStorageUrl` has already rebuilt the
  // origin, and the check below is against that rebuilt host, so a DB row
  // cannot aim a credential at a third party. Absent key => unchanged
  // behaviour.
  const apiKey = process.env.ZIMA_API_KEY;
  if (apiKey && zimaBaseHosts().includes(target.hostname.toLowerCase())) {
    headers["x-api-key"] = apiKey;
  }

  // `target` is rebuilt on an allow-listed origin, never the raw input string.
  return fetch(target, { headers });
}

/** Extract the Zima folder name from an object key path (first path segment). */
export function folderFromKey(key: string): string {
  return key.split("/")[0] ?? "files";
}
