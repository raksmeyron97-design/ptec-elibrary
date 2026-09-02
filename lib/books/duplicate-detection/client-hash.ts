/**
 * sha256 of a picked file, in the browser, BEFORE it is uploaded.
 *
 * The server already hashes every PDF it receives (lib/content-hash.ts) and
 * that hash is what actually prevents a duplicate row. This one exists for a
 * different reason: without it, a librarian learns their 40 MB PDF is already
 * in the library only after waiting for the whole transfer. Hashing locally
 * moves that answer to the moment the file is chosen.
 *
 * It is an EARLY WARNING, never a decision. The value is sent to a check that
 * only reads, and the authoritative refusal happens server-side at upload and
 * at insert. A client that lies about this hash gains nothing.
 *
 * Returns null rather than throwing when the platform cannot do it —
 * `crypto.subtle` requires a secure context, so a plain-http LAN session has
 * no digest and simply gets no pre-upload file check.
 */

/** 8 MB slices: hashing a 100 MB PDF in one ArrayBuffer spikes memory on the
 *  low-end laptops this panel is used on, and the file is already in memory
 *  once for the page-count parse. */
const SLICE_BYTES = 8 * 1024 * 1024;

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function canHashLocally(): boolean {
  return typeof globalThis.crypto?.subtle?.digest === "function";
}

/**
 * sha256 hex of the file's bytes — the same digest lib/content-hash.ts
 * computes server-side, so the two are directly comparable.
 */
export async function hashFile(file: File): Promise<string | null> {
  if (!canHashLocally()) return null;
  try {
    // SubtleCrypto has no streaming API, so the bytes do have to be present
    // together; reading in slices keeps peak allocation to one Uint8Array of
    // the file rather than several copies of it.
    const bytes = new Uint8Array(file.size);
    let offset = 0;
    while (offset < file.size) {
      const slice = await file.slice(offset, Math.min(offset + SLICE_BYTES, file.size)).arrayBuffer();
      bytes.set(new Uint8Array(slice), offset);
      offset += slice.byteLength;
      if (slice.byteLength === 0) break;
    }
    return toHex(await crypto.subtle.digest("SHA-256", bytes));
  } catch (error) {
    console.warn("[client-hash] could not hash the file locally:", error);
    return null;
  }
}
