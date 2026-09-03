// @vitest-environment node
//
// Node, not jsdom: this exercises a server route handler, and the multipart
// body it parses has to be built from Node's own File/Blob. jsdom's are a
// different implementation, and undici's parser rejects them outright.
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * End-to-end protocol tests against the REAL route handlers.
 *
 * What is real here: the route module itself, the staging layer writing to an
 * actual temporary directory, the state machine, and the compare-and-set
 * transitions running against an in-memory table that implements PostgREST's
 * `.eq()`-filtered update the same way Postgres does — atomically, matching
 * zero rows when the state has moved. That last part is the point: every bug
 * this protocol replaced was a race, and a mock that let both racers "win"
 * would prove nothing.
 *
 * What is stubbed: authorization (asserted separately), the storage upload, the
 * malware lookup and the duplicate query. Those are boundaries with their own
 * tests; the behaviour under examination is what the route does with them.
 */

const MB = 1024 * 1024;

// ── A minimal PostgREST-shaped fake over one table ───────────────────────────

type Row = Record<string, unknown>;

class FakeTable {
  rows: Row[] = [];
  updateCalls = 0;

  select() {
    return new Query(this, "select");
  }
  insert(values: Row) {
    return new Query(this, "insert", values);
  }
  update(values: Row) {
    this.updateCalls++;
    return new Query(this, "update", values);
  }
}

class Query implements PromiseLike<{ data: unknown; error: unknown }> {
  private filters: Array<(row: Row) => boolean> = [];
  private limitN: number | null = null;

  constructor(
    private table: FakeTable,
    private kind: "select" | "insert" | "update",
    private values: Row = {},
  ) {}

  select() {
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  neq(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }
  lt(column: string, value: string) {
    this.filters.push((row) => String(row[column]) < value);
    return this;
  }
  order() {
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }

  private matched(): Row[] {
    const hits = this.table.rows.filter((row) => this.filters.every((f) => f(row)));
    return this.limitN == null ? hits : hits.slice(0, this.limitN);
  }

  private run(): { data: unknown; error: unknown } {
    if (this.kind === "insert") {
      const id = this.values.id as string;
      if (this.table.rows.some((r) => r.id === id)) {
        return { data: null, error: { code: "23505", message: "duplicate key" } };
      }
      const now = new Date().toISOString();
      const row = { created_at: now, updated_at: now, finalize_attempts: 0, ...this.values };
      this.table.rows.push(row);
      return { data: row, error: null };
    }
    if (this.kind === "update") {
      // Filtered UPDATE, applied atomically: this is the compare-and-set. When
      // the state has already moved, no row matches and the caller loses.
      const hits = this.matched();
      for (const row of hits) Object.assign(row, this.values, { updated_at: new Date().toISOString() });
      return { data: hits, error: null };
    }
    return { data: this.matched(), error: null };
  }

  async maybeSingle() {
    const { data, error } = this.run();
    const rows = (data ?? []) as Row[];
    return { data: Array.isArray(rows) ? (rows[0] ?? null) : rows, error };
  }
  async single() {
    const { data, error } = this.run();
    const rows = data as Row[] | Row | null;
    if (Array.isArray(rows)) {
      return rows[0]
        ? { data: rows[0], error: null }
        : { data: null, error: { code: "PGRST116", message: "no rows" } };
    }
    return { data: rows, error };
  }
  then<R1 = { data: unknown; error: unknown }, R2 = never>(
    onFulfilled?: ((v: { data: unknown; error: unknown }) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((r: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.run()).then(onFulfilled, onRejected);
  }
}

const sessions = new FakeTable();
const appEvents = new FakeTable();

// ── Stubs ────────────────────────────────────────────────────────────────────

const auth = vi.hoisted(() => ({ userId: "11111111-1111-4111-8111-111111111111", denyPermission: false }));
const storage = vi.hoisted(() => ({ uploads: [] as { bytes: number; folder: string }[], fail: null as string | null }));
const scanning = vi.hoisted(() => ({ verdict: "clean" as "clean" | "malicious", duplicate: null as unknown }));

vi.mock("@/lib/auth/requireAdmin", () => ({
  requireStaff: async () => ({ user: { id: auth.userId } }),
  requirePermission: async () => {
    if (auth.denyPermission) {
      const err = Object.assign(new Error("Forbidden"), { name: "AdminAuthError", status: 403 });
      throw err;
    }
    return { user: { id: auth.userId } };
  },
  isAdminAuthError: (e: unknown) => (e as { name?: string })?.name === "AdminAuthError",
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: (table: string) => (table === "upload_sessions" ? sessions : appEvents),
  }),
}));

vi.mock("@/lib/content-hash", () => ({
  sha256Hex: () => "stub",
  findDuplicatePdf: async () => scanning.duplicate,
}));

vi.mock("@/lib/virus-scan", () => ({
  checkFileHashReputation: async () => ({
    verdict: scanning.verdict,
    scanned: true,
    detections: scanning.verdict === "malicious" ? 7 : 0,
  }),
  isVirusScanFailClosed: () => false,
}));

vi.mock("@/lib/zima", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/zima")>();
  return {
    ...actual,
    zimaUpload: async () => "https://cdn.test/files/books/x/cover.webp",
    zimaUploadStream: async (
      body: NodeJS.ReadableStream,
      contentLength: number,
      folder: string,
    ) => {
      if (storage.fail) throw new actual.ZimaUploadError(storage.fail, 503);
      // Drain it, so a stream that would not have produced the declared number
      // of bytes fails here rather than silently storing a short file.
      let seen = 0;
      for await (const piece of body) seen += (piece as Buffer).byteLength;
      if (seen !== contentLength) throw new Error(`stream length ${seen} != ${contentLength}`);
      storage.uploads.push({ bytes: seen, folder });
      return `https://cdn.test/files/${folder}/book.pdf`;
    },
  };
});

vi.mock("@/lib/security-log", () => ({ logSecurityEvent: () => undefined }));
vi.mock("@/lib/analytics/events", () => ({ logAppEvent: () => undefined }));

// ── Harness ──────────────────────────────────────────────────────────────────

let root: string;
let route: typeof import("./route");

beforeEach(async () => {
  root = await fsp.mkdtemp(path.join(os.tmpdir(), "ptec-route-test-"));
  process.env.UPLOAD_STAGING_DIR = root;
  delete process.env.VERCEL;
  sessions.rows = [];
  sessions.updateCalls = 0;
  storage.uploads = [];
  storage.fail = null;
  scanning.verdict = "clean";
  scanning.duplicate = null;
  auth.userId = "11111111-1111-4111-8111-111111111111";
  auth.denyPermission = false;
  route = await import("./route");
});

afterEach(async () => {
  await fsp.rm(root, { recursive: true, force: true });
  delete process.env.UPLOAD_STAGING_DIR;
  vi.resetModules();
});

const KEY = "books/algebra-1a2b/book.pdf";
const CHUNK = 5 * MB;

function pdfChunk(index: number, size: number): Blob {
  const buf = Buffer.alloc(size, index + 1);
  if (index === 0) Buffer.from("%PDF-1.7\n").copy(buf, 0);
  return new Blob([buf], { type: "application/pdf" });
}

function req(form: FormData) {
  return new Request("http://localhost/api/admin/upload/chunk", { method: "POST", body: form }) as never;
}

function base(uploadId: string, size: number) {
  const total = Math.max(1, Math.ceil(size / CHUNK));
  const fd = new FormData();
  fd.set("uploadId", uploadId);
  fd.set("key", KEY);
  fd.set("fileName", "book.pdf");
  fd.set("fileSize", String(size));
  fd.set("chunkSize", String(CHUNK));
  fd.set("totalChunks", String(total));
  fd.set("contentType", "application/pdf");
  return fd;
}

async function init(uploadId: string, size: number) {
  const fd = base(uploadId, size);
  fd.set("action", "init");
  return await (await route.POST(req(fd))).json();
}

async function sendChunk(uploadId: string, size: number, index: number) {
  const total = Math.max(1, Math.ceil(size / CHUNK));
  const bytes = index === total - 1 ? size - index * CHUNK : CHUNK;
  const fd = base(uploadId, size);
  fd.set("action", "chunk");
  fd.set("chunkIndex", String(index));
  fd.set("chunk", pdfChunk(index, bytes), "book.pdf");
  const res = await route.POST(req(fd));
  return { status: res.status, body: await res.json() };
}

async function finalize(uploadId: string, size: number) {
  const fd = base(uploadId, size);
  fd.set("action", "finalize");
  const res = await route.POST(req(fd));
  return { status: res.status, body: await res.json() };
}

async function uploadAll(uploadId: string, size: number) {
  await init(uploadId, size);
  const total = Math.max(1, Math.ceil(size / CHUNK));
  for (let i = 0; i < total; i++) await sendChunk(uploadId, size, i);
  return await finalize(uploadId, size);
}

function state(uploadId: string): string {
  return sessions.rows.find((r) => r.id === uploadId)?.state as string;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("chunk route — the happy path at every size", () => {
  it.each([
    ["1 MB", 1 * MB, 1],
    ["9.9 MB", Math.round(9.9 * MB), 2],
    ["10 MB", 10 * MB, 2],
    ["10.1 MB", Math.round(10.1 * MB), 3],
    ["15 MB", 15 * MB, 3],
    ["25 MB", 25 * MB, 5],
  ])("stores a %s file in the right number of chunks", async (_label, size, expectedChunks) => {
    const id = `size-${size}-aaaaaaaa`;
    const opened = await init(id, size);
    expect(opened.totalChunks).toBe(expectedChunks);

    for (let i = 0; i < expectedChunks; i++) {
      const { status } = await sendChunk(id, size, i);
      expect(status).toBe(200);
    }

    const done = await finalize(id, size);
    expect(done.status).toBe(200);
    expect(done.body.state).toBe("STORED");
    expect(storage.uploads).toHaveLength(1);
    // The stream carried exactly the file — no padding, no truncation.
    expect(storage.uploads[0].bytes).toBe(size);
  });

  it("does not store anything until finalize is asked for", async () => {
    // The old route finalized implicitly on the last chunk, which is why the
    // browser sat at 100% while minutes of server work ran unannounced.
    const id = "implicit-none-aaaa";
    await init(id, 10 * MB);
    await sendChunk(id, 10 * MB, 0);
    await sendChunk(id, 10 * MB, 1);
    expect(storage.uploads).toHaveLength(0);
    expect(state(id)).toBe("UPLOADING");
  });
});

describe("chunk route — size limits", () => {
  it("refuses exactly 100 MiB at the door, with the limit in the message", async () => {
    // Storage refuses this size; the app used to allow it and only discover
    // that after twenty chunks and a full finalize.
    const id = "exactly-100mib-aa";
    const fd = base(id, 100 * MB);
    fd.set("action", "init");
    const res = await route.POST(req(fd));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.errorCode).toBe("UPLOAD_LIMIT");
    expect(body.error).toMatch(/100 MB/);
  });

  it("accepts one byte under the cap", async () => {
    const size = 100 * MB - 1;
    const id = "just-under-cap-aa";
    const opened = await init(id, size);
    expect(opened.state).toBe("CREATED");
  });

  it("refuses a chunk larger than the session declared", async () => {
    const id = "oversize-chunk-aa";
    await init(id, 10 * MB);
    const fd = base(id, 10 * MB);
    fd.set("action", "chunk");
    fd.set("chunkIndex", "0");
    fd.set("chunk", pdfChunk(0, 6 * MB), "book.pdf");
    const res = await route.POST(req(fd));
    expect(res.status).toBe(413);
  });
});

describe("chunk route — missing parts", () => {
  it("names every missing index and does not fail the session", async () => {
    const size = 15 * MB;
    const id = "missing-parts-aaa";
    await init(id, size);
    await sendChunk(id, size, 0);
    await sendChunk(id, size, 2);

    const res = await finalize(id, size);
    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe("CHUNK_MISSING");
    expect(res.body.missingChunks).toEqual([1]);
    // Handed back, not failed: the two parts it does have are still good.
    expect(state(id)).toBe("UPLOADING");
    expect(storage.uploads).toHaveLength(0);
  });

  it("reports chunk 0 missing when only chunk 0 is gone, then succeeds on re-send", async () => {
    const size = 15 * MB;
    const id = "missing-zero-aaaa";
    await init(id, size);
    await sendChunk(id, size, 1);
    await sendChunk(id, size, 2);

    const first = await finalize(id, size);
    expect(first.body.missingChunks).toEqual([0]);

    await sendChunk(id, size, 0);
    const second = await finalize(id, size);
    expect(second.status).toBe(200);
    expect(storage.uploads).toHaveLength(1);
  });

  it("survives the staging directory being wiped mid-upload", async () => {
    // A container restart, or the tmpfs the parts used to live on. The
    // recovery is a re-send of the named parts, not a failed book.
    const size = 15 * MB;
    const id = "staging-wiped-aaa";
    await init(id, size);
    for (let i = 0; i < 3; i++) await sendChunk(id, size, i);
    await fsp.rm(path.join(root, id), { recursive: true, force: true });

    const res = await finalize(id, size);
    expect(res.status).toBe(409);
    expect(res.body.missingChunks).toEqual([0, 1, 2]);

    for (let i = 0; i < 3; i++) await sendChunk(id, size, i);
    expect((await finalize(id, size)).status).toBe(200);
  });
});

describe("chunk route — idempotency", () => {
  it("stages the same chunk twice without corrupting the file", async () => {
    const size = 10 * MB;
    const id = "duplicate-chunk-a";
    await init(id, size);
    await sendChunk(id, size, 0);
    await sendChunk(id, size, 0);
    await sendChunk(id, size, 1);

    const res = await finalize(id, size);
    expect(res.status).toBe(200);
    expect(storage.uploads[0].bytes).toBe(size);
  });

  it("replays a finished finalize instead of storing a second copy", async () => {
    // THE DOUBLE UPLOAD. A client timeout used to make this a second full run:
    // second hash, second malware lookup, second object in storage.
    const size = 10 * MB;
    const id = "finalize-twice-aa";
    const first = await uploadAll(id, size);
    expect(first.status).toBe(200);

    const second = await finalize(id, size);
    expect(second.status).toBe(200);
    expect(second.body.replayed).toBe(true);
    expect(second.body.url).toBe(first.body.url);
    expect(storage.uploads).toHaveLength(1);
  });

  it("answers a late chunk on a stored session with the result", async () => {
    const size = 10 * MB;
    const id = "late-chunk-aaaaaa";
    await uploadAll(id, size);
    const late = await sendChunk(id, size, 0);
    expect(late.status).toBe(200);
    expect(late.body.alreadyStored).toBe(true);
    expect(storage.uploads).toHaveLength(1);
  });

  it("re-initialising an existing session returns it rather than resetting it", async () => {
    const size = 10 * MB;
    const id = "reinit-session-aa";
    await init(id, size);
    await sendChunk(id, size, 0);
    const again = await init(id, size);
    expect(again.present).toEqual([0]);
  });

  it("refuses to move a session to a different destination", async () => {
    // The key decides which permission row was checked. A session that could
    // change destination mid-flight is a way to finish a books-scoped upload
    // inside publications/.
    const id = "moving-target-aaa";
    await init(id, 10 * MB);
    const fd = base(id, 10 * MB);
    fd.set("action", "init");
    fd.set("key", "publications/elsewhere/book.pdf");
    const res = await route.POST(req(fd));
    expect(res.status).toBe(400);
  });
});

describe("chunk route — concurrency", () => {
  it("lets exactly one of two simultaneous finalizes do the work", async () => {
    const size = 10 * MB;
    const id = "concurrent-fin-aa";
    await init(id, size);
    await sendChunk(id, size, 0);
    await sendChunk(id, size, 1);

    const [a, b] = await Promise.all([finalize(id, size), finalize(id, size)]);
    const statuses = [a.status, b.status].sort();

    // One stores; the other is told to wait or is handed the stored result.
    expect(storage.uploads).toHaveLength(1);
    expect(statuses[0]).toBe(200);
    expect([200, 409]).toContain(statuses[1]);
    if (statuses[1] === 409) {
      const busy = a.status === 409 ? a : b;
      expect(busy.body.errorCode).toBe("SESSION_BUSY");
    }
  });
});

describe("chunk route — refusals", () => {
  it("blocks a duplicate PDF and gives the disk back", async () => {
    scanning.duplicate = { type: "book", title: "Algebra I", url: "/books/algebra-i" };
    const size = 10 * MB;
    const id = "duplicate-file-aa";
    const res = await uploadAll(id, size);
    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe("DUPLICATE_FILE");
    expect(state(id)).toBe("FAILED");
    // Terminal: retrying cannot change the answer, so the staged bytes go.
    await expect(fsp.stat(path.join(root, id))).rejects.toThrow();
    expect(storage.uploads).toHaveLength(0);
  });

  it("blocks a file whose hash is flagged as malicious", async () => {
    scanning.verdict = "malicious";
    const res = await uploadAll("malware-blocked-a", 10 * MB);
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe("MALWARE_BLOCKED");
    expect(storage.uploads).toHaveLength(0);
  });

  it("blocks content that is not what it says it is", async () => {
    const id = "wrong-content-aaa";
    const size = 1 * MB;
    await init(id, size);
    const fd = base(id, size);
    fd.set("action", "chunk");
    fd.set("chunkIndex", "0");
    fd.set("chunk", new Blob([Buffer.alloc(size, 0x41)], { type: "application/pdf" }), "book.pdf");
    await route.POST(req(fd));

    const res = await finalize(id, size);
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe("CONTENT_REJECTED");
    expect(storage.uploads).toHaveLength(0);
  });

  it("keeps the staged bytes when storage fails, so a retry costs nothing", async () => {
    // The distinction that matters: a transient failure must not throw away
    // 95 MB the operator has already sent.
    const size = 10 * MB;
    const id = "storage-down-aaaa";
    storage.fail = "Storage is unreachable.";
    const res = await uploadAll(id, size);
    expect(res.status).toBe(503);
    expect(state(id)).toBe("UPLOADING");
    await expect(fsp.stat(path.join(root, id))).resolves.toBeTruthy();

    storage.fail = null;
    const retry = await finalize(id, size);
    expect(retry.status).toBe(200);
    expect(storage.uploads).toHaveLength(1);
  });

  it("refuses a destination outside the allowed prefixes", async () => {
    const fd = base("bad-prefix-aaaaaa", 1 * MB);
    fd.set("action", "init");
    fd.set("key", "secrets/book.pdf");
    const res = await route.POST(req(fd));
    expect(res.status).toBe(400);
  });

  it("refuses a traversal in the destination key", async () => {
    const fd = base("traversal-key-aaa", 1 * MB);
    fd.set("action", "init");
    fd.set("key", "books/../../etc/passwd");
    const res = await route.POST(req(fd));
    expect(res.status).toBe(400);
  });

  it("refuses a malformed upload id before it can become a directory", async () => {
    const fd = base("../../etc", 1 * MB);
    fd.set("action", "init");
    const res = await route.POST(req(fd));
    expect(res.status).toBe(400);
    expect((await res.json()).errorCode).toBe("BAD_REQUEST");
  });

  it("refuses to start when the platform cannot stage chunks at all", async () => {
    delete process.env.UPLOAD_STAGING_DIR;
    process.env.VERCEL = "1";
    const fd = base("ephemeral-fs-aaaa", 10 * MB);
    fd.set("action", "init");
    const res = await route.POST(req(fd));
    expect(res.status).toBe(503);
    expect((await res.json()).errorCode).toBe("CHUNK_STORAGE_UNAVAILABLE");
    process.env.UPLOAD_STAGING_DIR = root;
    delete process.env.VERCEL;
  });
});

describe("chunk route — ownership", () => {
  it("hides another account's session behind the same answer as a missing one", async () => {
    // Staff authorization says you may upload. It does not say whose staged
    // bytes are yours. Without this check any staff account could finalize any
    // other account's upload by guessing a uuid — and publish a book from a
    // PDF it never sent.
    const size = 10 * MB;
    const id = "someone-elses-aaa";
    await init(id, size);
    await sendChunk(id, size, 0);
    await sendChunk(id, size, 1);

    auth.userId = "22222222-2222-4222-8222-222222222222";
    const stolen = await finalize(id, size);
    expect(stolen.status).toBe(404);
    expect(stolen.body.errorCode).toBe("SESSION_NOT_FOUND");
    expect(storage.uploads).toHaveLength(0);
  });

  it("refuses a caller without write permission on the destination", async () => {
    auth.denyPermission = true;
    const fd = base("no-permission-aaa", 1 * MB);
    fd.set("action", "init");
    const res = await route.POST(req(fd));
    expect(res.status).toBe(403);
  });
});

describe("chunk route — status and cancel", () => {
  function url(uploadId: string) {
    return new NextRequest(`http://localhost/api/admin/upload/chunk?uploadId=${uploadId}`);
  }
  function del(uploadId: string) {
    return new NextRequest(`http://localhost/api/admin/upload/chunk?uploadId=${uploadId}`, {
      method: "DELETE",
    });
  }

  it("answers exactly which parts are missing", async () => {
    const size = 15 * MB;
    const id = "status-query-aaaa";
    await init(id, size);
    await sendChunk(id, size, 0);
    await sendChunk(id, size, 2);

    const body = await (await route.GET(url(id))).json();
    expect(body.present).toEqual([0, 2]);
    expect(body.missing).toEqual([1]);
    expect(body.state).toBe("UPLOADING");
  });

  it("cancels an unfinished upload and reclaims its disk", async () => {
    const size = 10 * MB;
    const id = "cancel-me-aaaaaaa";
    await init(id, size);
    await sendChunk(id, size, 0);

    const res = await route.DELETE(del(id));
    expect(res.status).toBe(200);
    expect(state(id)).toBe("CANCELLED");
    await expect(fsp.stat(path.join(root, id))).rejects.toThrow();
  });

  it("refuses to delete a file that is already in storage", async () => {
    // Whether a stored file should be removed is a question about the
    // database, not about a UI event. The old client answered it from the
    // browser and deleted files live rows pointed at.
    const size = 10 * MB;
    const id = "cancel-stored-aaa";
    await uploadAll(id, size);
    const res = await route.DELETE(del(id));
    const body = await res.json();
    expect(body.cancelled).toBe(false);
    expect(state(id)).toBe("STORED");
  });

  it("does not let one account read another's session status", async () => {
    const id = "status-privacy-aa";
    await init(id, 10 * MB);
    auth.userId = "33333333-3333-4333-8333-333333333333";
    const res = await route.GET(url(id));
    expect(res.status).toBe(404);
  });
});
