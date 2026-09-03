import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  assembleStream,
  digestSession,
  discardSessionStaging,
  inspectChunks,
  openSessionStaging,
  readHead,
  stagingIsEphemeral,
  stagingRoot,
  sweepStaging,
  writeChunk,
} from "./staging";
import { isUploadSessionError } from "./state";

/**
 * These run against a real temporary directory rather than a mocked `fs`.
 *
 * The properties under test — that a torn write is invisible, that a rename is
 * atomic, that a scan reports exactly what is on disk — are properties of the
 * filesystem, and a mock would only ever assert that the code calls the
 * functions it calls. The chunk protocol's whole failure history is about the
 * gap between "we wrote it" and "it is there".
 */

let root: string;

beforeEach(async () => {
  root = await fsp.mkdtemp(path.join(os.tmpdir(), "ptec-staging-test-"));
  process.env.UPLOAD_STAGING_DIR = root;
});

afterEach(async () => {
  delete process.env.UPLOAD_STAGING_DIR;
  await fsp.rm(root, { recursive: true, force: true });
});

function id(): string {
  return randomUUID();
}

function bytes(n: number, fill: number): Uint8Array {
  return new Uint8Array(n).fill(fill);
}

async function stage(uploadId: string, parts: Uint8Array[]): Promise<void> {
  await openSessionStaging(uploadId);
  for (let i = 0; i < parts.length; i++) {
    await writeChunk(uploadId, i, parts[i]);
  }
}

describe("chunk staging", () => {
  it("honours UPLOAD_STAGING_DIR over the tmpdir default", () => {
    // The whole point of the volume: production must not stage in a tmpfs.
    expect(stagingRoot()).toBe(root);
    delete process.env.UPLOAD_STAGING_DIR;
    expect(stagingRoot()).toBe(path.join(os.tmpdir(), "ptec-upload-chunks"));
    process.env.UPLOAD_STAGING_DIR = root;
  });

  it("reports every chunk count from 1 to 20 as complete", async () => {
    for (const total of [1, 2, 10, 20]) {
      const uploadId = id();
      await stage(
        uploadId,
        Array.from({ length: total }, (_, i) => bytes(1024, i)),
      );
      const seen = await inspectChunks(uploadId, total);
      expect(seen.present, `total=${total}`).toHaveLength(total);
      expect(seen.missing, `total=${total}`).toEqual([]);
      expect(seen.bytes).toBe(total * 1024);
    }
  });

  it("names chunk 0 when chunk 0 is the one that is gone", async () => {
    const uploadId = id();
    await stage(uploadId, [bytes(64, 1), bytes(64, 2), bytes(64, 3)]);
    await fsp.rm(path.join(root, uploadId, "0.part"));
    const seen = await inspectChunks(uploadId, 3);
    expect(seen.missing).toEqual([0]);
    expect(seen.present).toEqual([1, 2]);
  });

  it("names a middle chunk when a middle chunk is gone", async () => {
    const uploadId = id();
    await stage(uploadId, [bytes(64, 1), bytes(64, 2), bytes(64, 3), bytes(64, 4)]);
    await fsp.rm(path.join(root, uploadId, "2.part"));
    expect((await inspectChunks(uploadId, 4)).missing).toEqual([2]);
  });

  it("reports every chunk missing when the staging directory was wiped", async () => {
    // This is the restart case: a tmpfs erased by a deploy. It must read as
    // "all of them", not as an error, so the client can re-send.
    const uploadId = id();
    await stage(uploadId, [bytes(64, 1), bytes(64, 2)]);
    await fsp.rm(path.join(root, uploadId), { recursive: true });
    const seen = await inspectChunks(uploadId, 2);
    expect(seen.missing).toEqual([0, 1]);
    expect(seen.bytes).toBe(0);
  });

  it("is idempotent: writing the same chunk twice changes nothing", async () => {
    const uploadId = id();
    await openSessionStaging(uploadId);
    await writeChunk(uploadId, 0, bytes(4096, 7));
    const first = await digestSession(uploadId, 1);
    await writeChunk(uploadId, 0, bytes(4096, 7));
    const second = await digestSession(uploadId, 1);
    expect(second).toEqual(first);
    expect((await inspectChunks(uploadId, 1)).present).toEqual([0]);
  });

  it("never counts a half-written part as present", async () => {
    // Chunks land via a scratch file and an atomic rename. A connection that
    // dies mid-write leaves the scratch behind, and a scan that counted it
    // would assemble a truncated, corrupt PDF and store it with a hash nobody
    // could explain.
    const uploadId = id();
    await openSessionStaging(uploadId);
    await fsp.writeFile(path.join(root, uploadId, "0.part.1234.abc.tmp"), bytes(999, 9));
    expect((await inspectChunks(uploadId, 1)).missing).toEqual([0]);
  });

  it("ignores a zero-length part", async () => {
    const uploadId = id();
    await openSessionStaging(uploadId);
    await fsp.writeFile(path.join(root, uploadId, "0.part"), Buffer.alloc(0));
    expect((await inspectChunks(uploadId, 1)).missing).toEqual([0]);
  });

  it("refuses an empty chunk rather than staging it", async () => {
    const uploadId = id();
    await openSessionStaging(uploadId);
    await expect(writeChunk(uploadId, 0, new Uint8Array(0))).rejects.toSatisfy(isUploadSessionError);
  });

  it("assembles the parts back into the original bytes, in order", async () => {
    const uploadId = id();
    const parts = [bytes(1000, 1), bytes(1000, 2), bytes(37, 3)];
    await stage(uploadId, parts);

    const chunks: Buffer[] = [];
    for await (const piece of assembleStream(uploadId, parts.length)) {
      chunks.push(piece as Buffer);
    }
    const assembled = Buffer.concat(chunks);
    expect(assembled).toEqual(Buffer.concat(parts.map((p) => Buffer.from(p))));
  });

  it("hashes the assembled file, not the parts", async () => {
    const uploadId = id();
    const parts = [bytes(5000, 11), bytes(5000, 22), bytes(1234, 33)];
    await stage(uploadId, parts);

    const expected = createHash("sha256")
      .update(Buffer.concat(parts.map((p) => Buffer.from(p))))
      .digest("hex");
    const { hash, bytes: length } = await digestSession(uploadId, parts.length);
    expect(hash).toBe(expected);
    expect(length).toBe(11234);
  });

  it("reads the head without reading the file", async () => {
    // Magic-byte sniffing must cost 4 KB, not 100 MB. The old route only knew
    // the type after it had already concatenated the whole file.
    const uploadId = id();
    const pdf = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(9000, 1)]);
    await stage(uploadId, [new Uint8Array(pdf)]);
    const head = await readHead(uploadId, 8);
    expect(Buffer.from(head).toString("latin1")).toBe("%PDF-1.7");
  });

  describe("path containment", () => {
    it("refuses every id that could escape the staging root", async () => {
      const escapes = [
        "..",
        "../../etc",
        "a/b/c",
        "with space",
        "dot.dot",
        "x",
        "y".repeat(80),
      ];
      for (const bad of escapes) {
        await expect(openSessionStaging(bad), bad).rejects.toSatisfy(isUploadSessionError);
        await expect(inspectChunks(bad, 1), bad).rejects.toSatisfy(isUploadSessionError);
      }
    });

    it("refuses a negative or fractional chunk index", async () => {
      const uploadId = id();
      await openSessionStaging(uploadId);
      await expect(writeChunk(uploadId, -1, bytes(8, 1))).rejects.toSatisfy(isUploadSessionError);
      await expect(writeChunk(uploadId, 1.5, bytes(8, 1))).rejects.toSatisfy(isUploadSessionError);
    });
  });

  describe("sweeping", () => {
    it("never removes a session the caller says is live", async () => {
      // A librarian on a slow link, or an importer waiting out a storage quota
      // window, legitimately pauses for tens of minutes. The old sweep had no
      // notion of liveness and deleted on age alone.
      const live = id();
      await stage(live, [bytes(128, 1)]);
      const old = new Date(Date.now() - 48 * 3600_000);
      fs.utimesSync(path.join(root, live), old, old);

      const swept = await sweepStaging({ maxAgeMs: 1000, protect: [live] });
      expect(swept.removed).toEqual([]);
      expect((await inspectChunks(live, 1)).present).toEqual([0]);
    });

    it("removes an aged, unprotected session and reports the disk freed", async () => {
      const dead = id();
      await stage(dead, [bytes(2048, 1), bytes(2048, 2)]);
      const old = new Date(Date.now() - 48 * 3600_000);
      fs.utimesSync(path.join(root, dead), old, old);

      const swept = await sweepStaging({ maxAgeMs: 3600_000, protect: [] });
      expect(swept.removed).toEqual([dead]);
      expect(swept.freedBytes).toBe(4096);
    });

    it("leaves a young session alone", async () => {
      const young = id();
      await stage(young, [bytes(64, 1)]);
      const swept = await sweepStaging({ maxAgeMs: 3600_000, protect: [] });
      expect(swept.removed).toEqual([]);
    });

    it("touches nothing whose name it did not create", async () => {
      // The staging root could be shared with something else by a mistaken
      // volume mount; a sweeper that deleted by age alone would take it out.
      await fsp.mkdir(path.join(root, "important data"), { recursive: true });
      const old = new Date(Date.now() - 48 * 3600_000);
      fs.utimesSync(path.join(root, "important data"), old, old);

      const swept = await sweepStaging({ maxAgeMs: 1000, protect: [] });
      expect(swept.removed).toEqual([]);
      expect(fs.existsSync(path.join(root, "important data"))).toBe(true);
    });
  });

  it("discards a session's bytes without complaining about one that is gone", async () => {
    const uploadId = id();
    await stage(uploadId, [bytes(64, 1)]);
    await discardSessionStaging(uploadId);
    expect(fs.existsSync(path.join(root, uploadId))).toBe(false);
    await expect(discardSessionStaging(uploadId)).resolves.toBeUndefined();
  });
});

describe("ephemeral-filesystem detection", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("treats a serverless platform with no configured directory as ephemeral", () => {
    delete process.env.UPLOAD_STAGING_DIR;
    process.env.VERCEL = "1";
    // Consecutive requests there do not share a disk, so a chunk protocol
    // staged on local disk loses parts non-deterministically. Refusing up
    // front beats reporting "Missing chunk 0" after twenty chunks.
    expect(stagingIsEphemeral()).toBe(true);
  });

  it("trusts an explicitly configured directory anywhere", () => {
    process.env.VERCEL = "1";
    process.env.UPLOAD_STAGING_DIR = "/mnt/durable";
    expect(stagingIsEphemeral()).toBe(false);
  });

  it("is not ephemeral on an ordinary container", () => {
    delete process.env.UPLOAD_STAGING_DIR;
    delete process.env.VERCEL;
    delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    expect(stagingIsEphemeral()).toBe(false);
  });
});
