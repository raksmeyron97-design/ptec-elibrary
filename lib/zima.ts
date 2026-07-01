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

/** Returns true if the given URL is served by the Zima CDN / API. */
export function isZimaUrl(fileUrl: string): boolean {
  const apiUrl = process.env.ZIMA_API_URL;
  if (!apiUrl) return false;
  if (!fileUrl.startsWith("http://") && !fileUrl.startsWith("https://")) return false;
  try {
    const apiHost = new URL(apiUrl).hostname;
    const cdnHost = apiHost.replace(/^api\./, "cdn.");
    const baseHost = apiHost.replace(/^api\./, "");
    const fileHost = new URL(fileUrl).hostname;
    return fileHost === apiHost || fileHost === cdnHost || fileHost === baseHost;
  } catch {
    return false;
  }
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
  if (file instanceof File) {
    form.append("file", file);
  } else {
    form.append("file", new File([file], filename ?? "upload", { type: file.type }));
  }

  const res = await fetch(`${apiUrl}/api/upload`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "x-folder": folder,
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
 * Extract the relative path from a Zima file URL.
 * e.g. "https://api.storage-ptec.online/files/books/foo.pdf" → "books/foo.pdf"
 */
function zimaRelativePath(fileUrl: string): string | null {
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
    // Zima Storage delete: DELETE /api/files/{folder/filename}
    const res = await fetch(`${apiUrl}/api/files/${relativePath}`, {
      method: "DELETE",
      headers: { "x-api-key": apiKey },
    });

    if (!res.ok) {
      // Fallback: some servers use POST /api/delete with a path body
      const fallback = await fetch(`${apiUrl}/api/delete`, {
        method: "POST",
        headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ path: relativePath, url: fileUrl }),
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
  const headers: HeadersInit = {};
  if (rangeHeader) headers["Range"] = rangeHeader;
  return fetch(fileUrl, { headers });
}

/** Extract the Zima folder name from an object key path (first path segment). */
export function folderFromKey(key: string): string {
  return key.split("/")[0] ?? "files";
}
