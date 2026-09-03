/**
 * Where a chunked upload's bytes live between requests.
 *
 * THE PROBLEM THIS REPLACES
 *
 * Parts were written to `os.tmpdir()/ptec-upload-chunks/<uploadId>`. In the
 * production container that path is a tmpfs (docker-compose.yml mounts one at
 * /tmp because the image runs with `read_only: true`), which means:
 *
 *   * it is RAM, charged to the container's 1 GB cgroup alongside the Node
 *     heap that is simultaneously assembling the same file;
 *   * it is erased by every restart and every deploy. A session spanning
 *     twenty requests and several minutes kept its only record in the most
 *     volatile store on the box, and the erasure surfaced to the operator as
 *     "Missing chunk 0 during final assembly" — a message that describes the
 *     symptom of a wiped directory as though the browser had failed to send.
 *
 * So the location is now configuration (`UPLOAD_STAGING_DIR`), pointed at a
 * real Docker volume in production, and the old tmpdir path remains only as
 * the development default.
 *
 * WHAT THIS MODULE GUARANTEES
 *
 *   Atomicity   a chunk is written to `<i>.part` and renamed into place, so a
 *               connection that dies mid-write leaves a `.tmp` file, never a
 *               short `<i>.part` that the next scan would count as present.
 *               This is the difference between "chunk 7 is missing" (say so,
 *               re-send it) and "chunk 7 is 3 MB of a 5 MB part" (a corrupt
 *               PDF, stored, with a hash nobody can explain).
 *   Idempotence writing the same chunk twice is a no-op with the same result,
 *               because the rename replaces atomically and the content is
 *               positional.
 *   Boundedness nothing here ever holds more than one chunk in memory. The
 *               assembled file is never materialised as a Buffer at all: it is
 *               exposed as a stream, and the hash is computed by feeding that
 *               stream through `createHash` (see `digestSession`).
 *   Containment every path is derived from a validated id via `path.join` and
 *               then re-checked against the root, so neither a traversal in the
 *               id nor a future refactor of the id rule can escape.
 *
 * No `server-only`: the tests exercise this against a real temporary directory,
 * which is the only way to prove the atomic-rename and partial-file behaviour.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import { UploadSessionError, isValidUploadId } from "@/lib/uploads/state";

/** Bytes of the head kept for magic-byte sniffing without reading the file. */
export const SNIFF_BYTES = 4096;

/** Suffix of a part that is fully written and verified. */
const PART_SUFFIX = ".part";

/**
 * Staging root.
 *
 * Read on every call rather than captured at module load: the tests point it
 * at a per-test directory, and a module-level constant would freeze whichever
 * test ran first. The cost is one `process.env` read per operation.
 */
export function stagingRoot(): string {
  const configured = process.env.UPLOAD_STAGING_DIR?.trim();
  if (configured) return configured;
  return path.join(os.tmpdir(), "ptec-upload-chunks");
}

/**
 * A stable identifier for the process holding these bytes.
 *
 * Recorded on the session row so that a request reaching an instance which
 * cannot see the staging directory reports CHUNK_STORAGE_UNAVAILABLE — "the
 * bytes are somewhere else" — instead of CHUNK_MISSING, which tells the client
 * to re-send chunks that were never lost. On the single-container deployment
 * this never differs; it exists so that the failure is legible if it ever can.
 */
export function instanceId(): string {
  return (
    process.env.UPLOAD_INSTANCE_ID?.trim() ||
    // Vercel/serverless give a per-instance id; a container gives its hostname.
    process.env.VERCEL_DEPLOYMENT_ID?.trim() ||
    `${os.hostname()}:${process.pid}`
  );
}

/**
 * True when this deployment cannot keep staged chunks across requests.
 *
 * Serverless invocations do not share a filesystem, so a chunk protocol staged
 * on local disk is guaranteed to lose parts there — non-deterministically,
 * which is the worst way to lose them. The route refuses to start a session in
 * that case with a message naming the cause, rather than accepting twenty
 * chunks and reporting "Missing chunk 0" at the end.
 */
export function stagingIsEphemeral(): boolean {
  if (process.env.UPLOAD_STAGING_DIR?.trim()) return false; // an explicit durable mount
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

function sessionDir(uploadId: string): string {
  if (!isValidUploadId(uploadId)) {
    throw new UploadSessionError("BAD_REQUEST", "Malformed upload id.");
  }
  const root = path.resolve(stagingRoot());
  const dir = path.resolve(path.join(root, uploadId));
  // Belt and braces: the id alphabet already excludes every traversal
  // character, and this re-check means a future change to that alphabet cannot
  // silently turn into a directory escape.
  if (dir !== path.join(root, uploadId) || !dir.startsWith(root + path.sep)) {
    throw new UploadSessionError("BAD_REQUEST", "Malformed upload id.");
  }
  return dir;
}

function partPath(uploadId: string, index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new UploadSessionError("BAD_REQUEST", "Malformed chunk index.");
  }
  return path.join(sessionDir(uploadId), `${index}${PART_SUFFIX}`);
}

/** Create the session's directory. Idempotent. */
export async function openSessionStaging(uploadId: string): Promise<void> {
  await fsp.mkdir(sessionDir(uploadId), { recursive: true });
}

/**
 * Write one chunk, atomically.
 *
 * The stream is consumed straight to disk — the incoming part is never turned
 * into an ArrayBuffer first, which is what `chunk.arrayBuffer()` did on every
 * one of twenty requests. Returns the bytes written so the caller can enforce
 * the running total without trusting the client's declared size.
 */
export async function writeChunk(
  uploadId: string,
  index: number,
  body: ReadableStream<Uint8Array> | Uint8Array,
): Promise<{ bytes: number }> {
  const target = partPath(uploadId, index);
  // Unique temp name: two in-flight retransmissions of the same chunk must not
  // write the same scratch file. Both then rename onto the same target, and
  // rename is atomic, so whichever lands last wins with identical content.
  const scratch = `${target}.${process.pid}.${Date.now().toString(36)}.tmp`;

  await fsp.mkdir(path.dirname(target), { recursive: true });

  let bytes = 0;
  const handle = await fsp.open(scratch, "w");
  try {
    if (body instanceof Uint8Array) {
      await handle.write(body);
      bytes = body.byteLength;
    } else {
      const reader = body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.byteLength > 0) {
          await handle.write(value);
          bytes += value.byteLength;
        }
      }
    }
    // Durability before visibility: without the fsync a crash between rename
    // and writeback leaves a zero-length part that scans as present.
    await handle.sync();
  } finally {
    await handle.close();
  }

  if (bytes === 0) {
    await fsp.rm(scratch, { force: true });
    throw new UploadSessionError("BAD_REQUEST", `Chunk ${index} arrived empty.`);
  }

  await fsp.rename(scratch, target);
  return { bytes };
}

export type ChunkPresence = {
  /** Indexes present and non-empty, ascending. */
  present: number[];
  /** Indexes of `0..totalChunks-1` not present, ascending. */
  missing: number[];
  /** Sum of the present parts' sizes. */
  bytes: number;
  /** Per-index size, for the present ones. */
  sizes: Map<number, number>;
};

/**
 * Which parts this staging area actually holds.
 *
 * This is the ONLY answer to "what is missing", and it comes from the
 * filesystem rather than from a counter in Postgres, because a counter can
 * disagree with the disk and a disagreement here is unresolvable: the bytes
 * either exist or they do not. Zero-length and leftover `.tmp` files are not
 * present.
 */
export async function inspectChunks(
  uploadId: string,
  totalChunks: number,
): Promise<ChunkPresence> {
  const dir = sessionDir(uploadId);
  let entries: string[];
  try {
    entries = await fsp.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        present: [],
        missing: Array.from({ length: totalChunks }, (_, i) => i),
        bytes: 0,
        sizes: new Map(),
      };
    }
    throw new UploadSessionError(
      "CHUNK_STORAGE_UNAVAILABLE",
      "The upload staging area could not be read.",
    );
  }

  const sizes = new Map<number, number>();
  let bytes = 0;
  for (const entry of entries) {
    if (!entry.endsWith(PART_SUFFIX)) continue;
    const index = Number(entry.slice(0, -PART_SUFFIX.length));
    if (!Number.isInteger(index) || index < 0 || index >= totalChunks) continue;
    let size: number;
    try {
      size = (await fsp.stat(path.join(dir, entry))).size;
    } catch {
      continue; // vanished between readdir and stat
    }
    if (size <= 0) continue;
    sizes.set(index, size);
    bytes += size;
  }

  const present: number[] = [];
  const missing: number[] = [];
  for (let i = 0; i < totalChunks; i++) {
    (sizes.has(i) ? present : missing).push(i);
  }
  return { present, missing, bytes, sizes };
}

/** The first bytes of the assembled file, for magic-byte sniffing. */
export async function readHead(uploadId: string, length = SNIFF_BYTES): Promise<Uint8Array> {
  const handle = await fsp.open(partPath(uploadId, 0), "r");
  try {
    const buf = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buf, 0, length, 0);
    return new Uint8Array(buf.buffer, buf.byteOffset, bytesRead);
  } finally {
    await handle.close();
  }
}

/**
 * The assembled file as a stream, in index order.
 *
 * No temporary concatenated copy is produced: the parts ARE the file, read one
 * after another. That removes the second full-size write the old route did
 * (`Buffer.concat` of every part) and the peak it caused — for a 100 MB book,
 * three simultaneous copies of the whole file in the heap before a byte
 * reached storage.
 *
 * `highWaterMark` bounds the read-ahead, so peak memory is a fixed window and
 * not a function of file size.
 */
export function assembleStream(
  uploadId: string,
  totalChunks: number,
  highWaterMark = 1024 * 1024,
): Readable {
  async function* parts() {
    for (let i = 0; i < totalChunks; i++) {
      const stream = fs.createReadStream(partPath(uploadId, i), { highWaterMark });
      for await (const piece of stream) yield piece as Buffer;
    }
  }
  return Readable.from(parts(), { objectMode: false, highWaterMark });
}

/**
 * SHA-256 of the assembled file, plus its true byte length.
 *
 * Streamed, so hashing a 100 MB upload costs one hash context and one 1 MB
 * window rather than 100 MB of Buffer. The length comes back from the same
 * pass because it is the only size we should ever act on: the client's declared
 * `fileSize` is a claim, and the sum of part sizes is a second claim; this is
 * the file.
 */
export async function digestSession(
  uploadId: string,
  totalChunks: number,
): Promise<{ hash: string; bytes: number }> {
  const hash = createHash("sha256");
  let bytes = 0;
  const stream = assembleStream(uploadId, totalChunks);
  for await (const piece of stream) {
    hash.update(piece as Buffer);
    bytes += (piece as Buffer).byteLength;
  }
  return { hash: hash.digest("hex"), bytes };
}

/** Remove one session's staged bytes. Never throws. */
export async function discardSessionStaging(uploadId: string): Promise<void> {
  try {
    await fsp.rm(sessionDir(uploadId), { recursive: true, force: true });
  } catch {
    // A staging directory we could not remove is disk for the reconciler to
    // reclaim, never a reason to fail the caller a second time.
  }
}

/**
 * Reclaim staging directories that no live session owns.
 *
 * `protect` carries the ids the caller knows to be live — the reconciler passes
 * every non-terminal session. Age alone is not enough on its own: the previous
 * sweep ran on a two-hour mtime rule with no notion of liveness at all, so an
 * upload that legitimately paused (a librarian on a slow link, or the importer
 * waiting out a storage quota window, which is measured in tens of minutes)
 * could have its parts deleted underneath it.
 */
export async function sweepStaging(options: {
  maxAgeMs: number;
  protect?: Iterable<string>;
}): Promise<{ removed: string[]; freedBytes: number }> {
  const root = stagingRoot();
  const protectedIds = new Set(options.protect ?? []);
  const removed: string[] = [];
  let freedBytes = 0;

  let entries: string[];
  try {
    entries = await fsp.readdir(root);
  } catch {
    return { removed, freedBytes };
  }

  const now = Date.now();
  for (const id of entries) {
    if (protectedIds.has(id)) continue;
    if (!isValidUploadId(id)) continue; // never touch anything we did not create
    const dir = path.join(root, id);
    try {
      const stats = await fsp.stat(dir);
      if (!stats.isDirectory()) continue;
      if (now - stats.mtimeMs <= options.maxAgeMs) continue;
      for (const file of await fsp.readdir(dir)) {
        try {
          freedBytes += (await fsp.stat(path.join(dir, file))).size;
        } catch {
          /* raced */
        }
      }
      await fsp.rm(dir, { recursive: true, force: true });
      removed.push(id);
    } catch {
      // concurrent delete, or a permission problem — either way, skip it
    }
  }
  return { removed, freedBytes };
}

/** Free bytes on the staging volume, or null when the platform won't say. */
export async function stagingFreeBytes(): Promise<number | null> {
  try {
    await fsp.mkdir(stagingRoot(), { recursive: true });
    const stats = await fsp.statfs(stagingRoot());
    return Number(stats.bavail) * Number(stats.bsize);
  } catch {
    return null;
  }
}
