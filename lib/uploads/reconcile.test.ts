// @vitest-environment node
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The reconciler's safety rules.
 *
 * These are the highest-stakes assertions in the upload system: this is the one
 * component allowed to delete a file, and the failure it replaces — a browser
 * deleting the PDF whenever a save request failed, including saves that had
 * actually succeeded — cost live books their files. So the tests are written
 * around what it must NOT do, not around what it does.
 */

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  sessions: [] as Row[],
  /** URLs that some library record points at. */
  referenced: new Set<string>(),
  /** Make the reference lookup fail, to prove the fail-safe direction. */
  lookupBroken: false,
}));

const deleted = vi.hoisted(() => ({ urls: [] as string[] }));

vi.mock("@/lib/supabase/server", () => {
  function query(table: string) {
    let rows = db.sessions;
    const filters: Array<(r: Row) => boolean> = [];
    let updateValues: Row | null = null;
    let column = "";

    const api = {
      select() {
        return api;
      },
      update(values: Row) {
        updateValues = values;
        return api;
      },
      eq(col: string, value: unknown) {
        column = col;
        filters.push((r) => r[col] === value);
        return api;
      },
      neq(col: string, value: unknown) {
        filters.push((r) => r[col] !== value);
        return api;
      },
      in(col: string, values: unknown[]) {
        filters.push((r) => values.includes(r[col]));
        return api;
      },
      lt(col: string, value: string) {
        filters.push((r) => String(r[col]) < value);
        return api;
      },
      order() {
        return api;
      },
      limit(n: number) {
        rows = rows.slice(0, n);
        return api;
      },
      async maybeSingle() {
        if (table !== "upload_sessions") {
          if (db.lookupBroken) {
            return { data: null, error: { code: "PGRST500", message: "lookup failed" } };
          }
          // Any table that can hold a storage URL: does anything point here?
          const url = String(filters.length ? column : "");
          void url;
          const hit = [...db.referenced].some((u) => filters.every((f) => f({ file_url: u, cover_url: u })));
          return { data: hit ? { id: "row" } : null, error: null };
        }
        const match = db.sessions.filter((r) => filters.every((f) => f(r)));
        if (updateValues) {
          for (const r of match) Object.assign(r, updateValues, { updated_at: new Date().toISOString() });
          return { data: match[0] ?? null, error: null };
        }
        return { data: match[0] ?? null, error: null };
      },
      then(resolve: (v: { data: unknown; error: unknown }) => unknown) {
        const match = rows.filter((r) => filters.every((f) => f(r)));
        if (updateValues) {
          for (const r of match) Object.assign(r, updateValues);
        }
        return Promise.resolve({ data: match, error: null }).then(resolve);
      },
    };
    return api;
  }

  return { createServiceClient: () => ({ from: (table: string) => query(table) }) };
});

vi.mock("@/lib/zima", () => ({
  zimaDelete: async (url: string) => {
    deleted.urls.push(url);
  },
}));

vi.mock("@/lib/analytics/events", () => ({ logAppEvent: () => undefined }));

let root: string;
let reconcileUploads: typeof import("./reconcile").reconcileUploads;

const HOUR = 3600_000;
const DAY = 24 * HOUR;

function ago(ms: number) {
  return new Date(Date.now() - ms).toISOString();
}

function session(over: Row = {}): Row {
  return {
    id: `sess-${Math.random().toString(36).slice(2, 12)}`,
    owner_id: "user-1",
    state: "STORED",
    storage_key: "books/x/book.pdf",
    folder: "books/x",
    file_name: "book.pdf",
    declared_size: 1000,
    chunk_size: 500,
    total_chunks: 2,
    stored_url: "https://cdn.test/files/books/x/book.pdf",
    stored_bytes: 1000,
    content_hash: "hash",
    resource_type: null,
    resource_id: null,
    finalize_attempts: 0,
    created_at: ago(2 * DAY),
    updated_at: ago(2 * DAY),
    expires_at: ago(DAY),
    ...over,
  };
}

beforeEach(async () => {
  root = await fsp.mkdtemp(path.join(os.tmpdir(), "ptec-reconcile-test-"));
  process.env.UPLOAD_STAGING_DIR = root;
  db.sessions = [];
  db.referenced = new Set();
  db.lookupBroken = false;
  deleted.urls = [];
  ({ reconcileUploads } = await import("./reconcile"));
});

afterEach(async () => {
  await fsp.rm(root, { recursive: true, force: true });
  delete process.env.UPLOAD_STAGING_DIR;
  vi.resetModules();
});

describe("reconcileUploads", () => {
  it("releases a session stuck in FINALIZING instead of leaving it locked", async () => {
    // A finalize that died with its process leaves the session claimed. Every
    // retry then answers SESSION_BUSY — a permanent lock held by nobody.
    const row = session({ state: "FINALIZING", updated_at: ago(HOUR), stored_url: null });
    db.sessions.push(row);

    const report = await reconcileUploads();
    expect(report.finalizingReclaimed).toBe(1);
    expect(row.state).toBe("UPLOADING");
  });

  it("returns a stuck save to STORED so the file can be reused", async () => {
    const row = session({ state: "SAVING_DB", updated_at: ago(HOUR) });
    db.sessions.push(row);

    const report = await reconcileUploads();
    expect(report.savingReclaimed).toBe(1);
    expect(row.state).toBe("STORED");
  });

  it("adopts a stored file that a library record turns out to reference", async () => {
    // THE CASE THAT MATTERS MOST. The save succeeded and only its response was
    // lost, so a live book points at this file. Calling it an orphan — and, a
    // week later, deleting it — is how a catalogued book loses its PDF.
    const row = session();
    db.sessions.push(row);
    db.referenced.add(row.stored_url as string);

    const report = await reconcileUploads();
    expect(report.adopted).toBe(1);
    expect(report.orphaned).toBe(0);
    expect(row.state).toBe("COMPLETED");
  });

  it("flags a genuinely unreferenced file without deleting it", async () => {
    const row = session();
    db.sessions.push(row);

    const report = await reconcileUploads();
    expect(report.orphaned).toBe(1);
    expect(report.orphanUrls).toEqual([row.stored_url]);
    // Reported, not removed: the default pass never deletes.
    expect(deleted.urls).toEqual([]);
    expect(row.state).toBe("ORPHANED");
  });

  it("treats a failed reference lookup as 'referenced'", async () => {
    // An error is not evidence of absence. Reading it as one is how a
    // reconciler deletes live files during a database blip.
    db.lookupBroken = true;
    const row = session();
    db.sessions.push(row);

    const report = await reconcileUploads();
    expect(report.orphaned).toBe(0);
    expect(deleted.urls).toEqual([]);
  });

  it("never purges an orphan that is younger than the grace period", async () => {
    db.sessions.push(session({ state: "ORPHANED", updated_at: ago(2 * DAY) }));
    const report = await reconcileUploads({ purge: true });
    expect(report.purged).toBe(0);
    expect(deleted.urls).toEqual([]);
  });

  it("purges an aged orphan only when it is STILL unreferenced", async () => {
    const stale = session({ state: "ORPHANED", updated_at: ago(30 * DAY) });
    db.sessions.push(stale);

    const report = await reconcileUploads({ purge: true });
    expect(report.purged).toBe(1);
    expect(deleted.urls).toEqual([stale.stored_url]);
    expect(stale.state).toBe("CANCELLED");
  });

  it("adopts rather than purges an aged orphan someone has since attached", async () => {
    // The whole reason for the delay: a librarian gets a week to find the file
    // and use it. Re-checking at the moment of deletion is what makes the delay
    // mean something.
    const stale = session({ state: "ORPHANED", updated_at: ago(30 * DAY) });
    db.sessions.push(stale);
    db.referenced.add(stale.stored_url as string);

    const report = await reconcileUploads({ purge: true });
    expect(report.purged).toBe(0);
    expect(report.adopted).toBe(1);
    expect(deleted.urls).toEqual([]);
  });

  it("fails an upload abandoned before anything reached storage", async () => {
    const row = session({ state: "UPLOADING", stored_url: null, updated_at: ago(2 * DAY) });
    db.sessions.push(row);
    const report = await reconcileUploads();
    expect(report.abandonedFailed).toBe(1);
    expect(row.state).toBe("FAILED");
  });

  it("reclaims staging disk only for sessions that are not live", async () => {
    const live = session({ id: "live-session-0001", state: "UPLOADING", stored_url: null, expires_at: new Date(Date.now() + DAY).toISOString() });
    db.sessions.push(live);

    for (const id of ["live-session-0001", "dead-session-0001"]) {
      await fsp.mkdir(path.join(root, id), { recursive: true });
      await fsp.writeFile(path.join(root, id, "0.part"), Buffer.alloc(64, 1));
      const old = new Date(Date.now() - 3 * DAY);
      await fsp.utimes(path.join(root, id), old, old);
    }

    const report = await reconcileUploads();
    expect(report.stagingRemoved).toBe(1);
    // The live session keeps its parts even though the directory is old: a
    // paused upload is not an abandoned one.
    await expect(fsp.stat(path.join(root, "live-session-0001"))).resolves.toBeTruthy();
    await expect(fsp.stat(path.join(root, "dead-session-0001"))).rejects.toThrow();
  });

  it("never deletes a database row", async () => {
    const before = db.sessions.length;
    db.sessions.push(session(), session({ state: "ORPHANED", updated_at: ago(30 * DAY) }));
    await reconcileUploads({ purge: true });
    // Rows are transitioned, never removed — a book row with a broken file is a
    // repair job for a librarian, not something a timer may destroy.
    expect(db.sessions.length).toBe(before + 2);
  });
});
