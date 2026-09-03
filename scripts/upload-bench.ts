/**
 * Memory and timing for the chunked upload's finalization path.
 *
 * WHY THIS EXISTS AS A SCRIPT RATHER THAN A TEST
 *
 * The defect it measures is not a wrong answer, it is a resource curve: the old
 * finalization held several full copies of the file in the heap at once, and on
 * a container with a 1 GB memory limit that is the difference between storing a
 * 95 MB book and having the process killed halfway through. A pass/fail
 * assertion at one size would not show the curve, and the curve is the finding.
 *
 * It runs BOTH implementations against the same staged parts so the comparison
 * is like for like:
 *
 *   legacy    readFileSync every part → Buffer.concat → .buffer.slice() →
 *             sha256 over the whole thing → new File(...) → fetch serializes
 *             the multipart body. Five live copies at the peak.
 *   streaming inspect (stat only) → readHead (4 KB) → digestSession (streamed,
 *             1 MB window) → zimaUploadStream (streamed into the request).
 *
 * Usage:
 *   ZIMA_API_URL=http://127.0.0.1:4111 ZIMA_API_KEY=… \
 *     npx tsx scripts/upload-bench.ts [--sizes 10,25,50,75,100] [--legacy] [--no-upload]
 *
 * `--no-upload` measures assembly and hashing only, which is the half that does
 * not need a storage server. With a storage server configured it also measures
 * the transfer, which is where the last two copies used to appear.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const MB = 1024 * 1024;
const CHUNK_SIZE = 5 * MB;

type Row = {
  sizeMb: number;
  chunks: number;
  mode: "legacy" | "streaming";
  peakHeapMb: number;
  peakRssMb: number;
  ms: number;
  hash: string;
  uploaded: boolean;
};

/** Samples RSS/heap while `run` executes. `setInterval` is enough: the peaks
 *  we are looking for last for whole seconds, not microseconds. */
async function withPeakMemory<T>(
  run: () => Promise<T>,
): Promise<{ value: T; peakHeap: number; peakRss: number; ms: number }> {
  if (global.gc) global.gc();
  const baseline = process.memoryUsage();
  let peakHeap = baseline.heapUsed;
  let peakRss = baseline.rss;
  const timer = setInterval(() => {
    const m = process.memoryUsage();
    if (m.heapUsed > peakHeap) peakHeap = m.heapUsed;
    if (m.rss > peakRss) peakRss = m.rss;
  }, 5);
  const started = performance.now();
  try {
    const value = await run();
    return {
      value,
      peakHeap: peakHeap - baseline.heapUsed,
      peakRss: peakRss - baseline.rss,
      ms: performance.now() - started,
    };
  } finally {
    clearInterval(timer);
  }
}

/** A staged session: real part files, with a real PDF header on part 0. */
async function stageParts(root: string, uploadId: string, totalBytes: number): Promise<number> {
  const dir = path.join(root, uploadId);
  await fsp.mkdir(dir, { recursive: true });
  const header = Buffer.from("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n", "latin1");
  let written = 0;
  let index = 0;
  while (written < totalBytes) {
    const size = Math.min(CHUNK_SIZE, totalBytes - written);
    const buf = Buffer.alloc(size, index + 1);
    if (index === 0) header.copy(buf, 0);
    await fsp.writeFile(path.join(dir, `${index}.part`), buf);
    written += size;
    index++;
  }
  return index;
}

async function main() {
  const args = process.argv.slice(2);
  const sizesArg = args.includes("--sizes") ? args[args.indexOf("--sizes") + 1] : "10,25,50,75,100";
  const sizes = sizesArg.split(",").map((s) => Number(s.trim())).filter(Boolean);
  const alsoLegacy = args.includes("--legacy");
  const doUpload = !args.includes("--no-upload") && Boolean(process.env.ZIMA_API_URL);

  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "ptec-upload-bench-"));
  process.env.UPLOAD_STAGING_DIR = root;

  // Imported after UPLOAD_STAGING_DIR is set: stagingRoot() reads it per call,
  // but the import order is one less thing to reason about.
  const { assembleStream, digestSession, inspectChunks, readHead } = await import(
    "../lib/uploads/staging"
  );
  const { zimaUpload, zimaUploadStream } = await import("../lib/zima");

  const rows: Row[] = [];

  for (const sizeMb of sizes) {
    const totalBytes = sizeMb * MB;

    // ── streaming ──────────────────────────────────────────────────────────
    {
      const uploadId = `bench-stream-${sizeMb}mb-0001`;
      const chunks = await stageParts(root, uploadId, totalBytes);
      const measured = await withPeakMemory(async () => {
        const presence = await inspectChunks(uploadId, chunks);
        if (presence.missing.length) throw new Error("staging incomplete");
        await readHead(uploadId);
        const { hash, bytes } = await digestSession(uploadId, chunks);
        let uploaded = false;
        if (doUpload) {
          await zimaUploadStream(
            assembleStream(uploadId, chunks),
            bytes,
            "books/bench",
            `stream-${sizeMb}mb.pdf`,
            "application/pdf",
          );
          uploaded = true;
        }
        return { hash, uploaded };
      });
      rows.push({
        sizeMb,
        chunks,
        mode: "streaming",
        peakHeapMb: measured.peakHeap / MB,
        peakRssMb: measured.peakRss / MB,
        ms: measured.ms,
        hash: measured.value.hash.slice(0, 12),
        uploaded: measured.value.uploaded,
      });
      await fsp.rm(path.join(root, uploadId), { recursive: true, force: true });
    }

    // ── legacy, reproduced exactly ─────────────────────────────────────────
    if (alsoLegacy) {
      const uploadId = `bench-legacy-${sizeMb}mb-0001`;
      const chunks = await stageParts(root, uploadId, totalBytes);
      const dir = path.join(root, uploadId);
      const measured = await withPeakMemory(async () => {
        const parts: Buffer[] = [];
        for (let i = 0; i < chunks; i++) {
          parts.push(fs.readFileSync(path.join(dir, `${i}.part`)));
        }
        const assembled = Buffer.concat(parts);
        const assembledBytes = assembled.buffer.slice(
          assembled.byteOffset,
          assembled.byteOffset + assembled.byteLength,
        );
        const hash = createHash("sha256").update(Buffer.from(assembledBytes)).digest("hex");
        let uploaded = false;
        if (doUpload) {
          const file = new File([assembledBytes], `legacy-${sizeMb}mb.pdf`, {
            type: "application/pdf",
          });
          await zimaUpload(file, "books/bench", `legacy-${sizeMb}mb.pdf`);
          uploaded = true;
        }
        return { hash, uploaded };
      });
      rows.push({
        sizeMb,
        chunks,
        mode: "legacy",
        peakHeapMb: measured.peakHeap / MB,
        peakRssMb: measured.peakRss / MB,
        ms: measured.ms,
        hash: measured.value.hash.slice(0, 12),
        uploaded: measured.value.uploaded,
      });
      await fsp.rm(dir, { recursive: true, force: true });
    }
  }

  await fsp.rm(root, { recursive: true, force: true });

  const pad = (s: string | number, n: number) => String(s).padStart(n);
  console.log(
    `\n  size  chunks  mode        peak heap   peak RSS      time   uploaded   sha256`,
  );
  console.log(`  ${"─".repeat(74)}`);
  for (const r of rows) {
    console.log(
      `  ${pad(r.sizeMb + "MB", 5)}  ${pad(r.chunks, 6)}  ${r.mode.padEnd(10)}  ` +
        `${pad(r.peakHeapMb.toFixed(1) + " MB", 9)}  ${pad(r.peakRssMb.toFixed(1) + " MB", 9)}  ` +
        `${pad((r.ms / 1000).toFixed(2) + "s", 8)}  ${pad(r.uploaded ? "yes" : "no", 8)}   ${r.hash}`,
    );
  }
  console.log();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
