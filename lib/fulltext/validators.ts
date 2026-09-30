// lib/fulltext/validators.ts
//
// The HTTP validators of a public full text (ETag, Last-Modified) and the
// conditional-request decision. Pure, so the rule is testable without a
// storage server: a recrawl that sends back what it was given gets a 304 and
// no bytes.

export type FulltextVersion = {
  /** The file's content hash when the row records one — the strongest
   *  identity a PDF has; a replaced file changes it. */
  contentHash?: string | null;
  /** The file's URL, the fallback identity when no hash is stored. */
  fileUrl: string;
  /** When the record last changed, for Last-Modified. */
  updatedAt?: string | null;
};

export type FulltextValidators = { etag: string | null; lastModified: string | null };

/** A short, stable hash of a string (FNV-1a, 32-bit) — for an ETag, not for security. */
function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function fulltextValidators(version: FulltextVersion): FulltextValidators {
  const hash = version.contentHash?.trim();
  // A stored content hash names the bytes exactly: a strong validator. The
  // URL-plus-timestamp fallback can only say "probably the same", so it is
  // weak (W/), which is what a 304 on it honestly means.
  const etag = hash
    ? `"${hash.slice(0, 64)}"`
    : `W/"${fnv1a(`${version.fileUrl}|${version.updatedAt ?? ""}`)}"`;
  const date = version.updatedAt ? new Date(version.updatedAt) : null;
  const lastModified = date && !Number.isNaN(date.getTime()) ? date.toUTCString() : null;
  return { etag, lastModified };
}

/** Does this conditional request already hold the current version? */
export function isNotModified(headers: Headers, validators: FulltextValidators): boolean {
  const ifNoneMatch = headers.get("if-none-match");
  if (ifNoneMatch && validators.etag) {
    const strip = (tag: string) => tag.trim().replace(/^W\//, "");
    const want = strip(validators.etag);
    return ifNoneMatch.split(",").some((tag) => tag.trim() === "*" || strip(tag) === want);
  }
  // If-Modified-Since is consulted only when there is no ETag question.
  const since = headers.get("if-modified-since");
  if (since && validators.lastModified) {
    const sinceTime = Date.parse(since);
    const modified = Date.parse(validators.lastModified);
    return !Number.isNaN(sinceTime) && !Number.isNaN(modified) && modified <= sinceTime;
  }
  return false;
}
