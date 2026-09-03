/**
 * End-to-end verification of the chunked upload, against real infrastructure.
 *
 * WHAT IS REAL HERE
 *
 *   the route handlers      imported and invoked directly
 *   the session table       a live Postgres (`upload_sessions`, migration 0132)
 *   the staging directory   a real directory on a real filesystem
 *   the storage service     a running Zima instance, over HTTP
 *
 * Only the caller's identity is stubbed, because signing in through GoTrue with
 * MFA and a CAPTCHA proves nothing about the upload protocol and cannot run
 * unattended. Everything the protocol actually does — the compare-and-set
 * transitions, the atomic chunk writes, the streamed hash, the streamed
 * multipart body, the 413 boundary — happens for real.
 *
 * This is deliberately NOT a vitest file. It needs a database and a storage
 * server, so it must never run in CI; the deterministic equivalent is
 * `app/api/admin/upload/chunk/route.integration.test.ts`.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54331 \
 *   SUPABASE_SERVICE_ROLE_KEY=… \
 *   ZIMA_API_URL=http://127.0.0.1:4111 ZIMA_API_KEY=… \
 *   UPLOAD_STAGING_DIR=/tmp/ptec-e2e-staging \
 *   UPLOAD_E2E_OWNER=<a uuid in auth.users> \
 *     npx tsx scripts/upload-e2e.mts [--sizes 10,25,50,75,100]
 *
 * `.mts`, not `.ts`: the stubs above have to be installed BEFORE the route
 * module is imported, which means top-level `await import(...)`, which tsx only
 * allows in an ES module.
 */

import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const MB = 1024 * 1024;
const CHUNK = 5 * MB;

const OWNER = process.env.UPLOAD_E2E_OWNER ?? "";
if (!OWNER) {
  console.error("UPLOAD_E2E_OWNER must be a uuid present in auth.users (owner_id has an FK).");
  process.exit(1);
}

/* The route calls requireStaff()/requirePermission() before anything else.
   Both are supplied by scripts/e2e-auth-stub.ts, which the runner tsconfig maps
   `@/lib/auth/requireAdmin` to — a `paths` entry rather than a monkey-patch,
   because an ES module namespace is frozen and cannot be redefined at runtime.
   Everything else the route imports is the real thing. */
const authStub = await import("./e2e-auth-stub");

const { NextRequest } = await import("next/server");
const route = await import("../app/api/admin/upload/chunk/route");
const { createServiceClient } = await import("../lib/supabase/server");

type Result = {
  label: string;
  ok: boolean;
  note: string;
};

const results: Result[] = [];

function record(label: string, ok: boolean, note = "") {
  results.push({ label, ok, note });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${note ? `  — ${note}` : ""}`);
}

function pdfChunk(index: number, size: number): Blob {
  const buf = Buffer.alloc(size, (index % 251) + 1);
  if (index === 0) Buffer.from("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n", "latin1").copy(buf, 0);
  return new Blob([buf], { type: "application/pdf" });
}

function post(form: FormData) {
  return route.POST(
    new NextRequest("http://localhost/api/admin/upload/chunk", { method: "POST", body: form }),
  );
}

function base(uploadId: string, key: string, size: number, name: string) {
  const fd = new FormData();
  fd.set("uploadId", uploadId);
  fd.set("key", key);
  fd.set("fileName", name);
  fd.set("fileSize", String(size));
  fd.set("chunkSize", String(CHUNK));
  fd.set("totalChunks", String(Math.max(1, Math.ceil(size / CHUNK))));
  fd.set("contentType", "application/pdf");
  return fd;
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

async function runOneSize(sizeMb: number, size: number) {
  const total = Math.ceil(size / CHUNK);
  const uploadId = `e2e-${sizeMb}mb-${Date.now().toString(36)}`.slice(0, 60).padEnd(12, "x");
  const key = `books/e2e-${sizeMb}mb/book.pdf`;
  const label = `${sizeMb} MB (${total} chunks, ${size} bytes)`;

  const started = Date.now();
  let peakRss = process.memoryUsage().rss;
  const sampler = setInterval(() => {
    const rss = process.memoryUsage().rss;
    if (rss > peakRss) peakRss = rss;
  }, 10);

  try {
    const init = await json(await post(withAction(base(uploadId, key, size, "book.pdf"), "init")));
    if (init.state !== "CREATED") {
      record(label, false, `init returned ${JSON.stringify(init)}`);
      return;
    }

    for (let i = 0; i < total; i++) {
      const bytes = i === total - 1 ? size - i * CHUNK : CHUNK;
      const fd = withAction(base(uploadId, key, size, "book.pdf"), "chunk");
      fd.set("chunkIndex", String(i));
      fd.set("chunk", pdfChunk(i, bytes), "book.pdf");
      const res = await post(fd);
      if (res.status !== 200) {
        record(label, false, `chunk ${i} → ${res.status} ${JSON.stringify(await json(res))}`);
        return;
      }
    }
    const sendMs = Date.now() - started;

    const finalizeStarted = Date.now();
    const finRes = await post(withAction(base(uploadId, key, size, "book.pdf"), "finalize"));
    const fin = await json(finRes);
    const finalizeMs = Date.now() - finalizeStarted;

    if (finRes.status !== 200 || fin.state !== "STORED") {
      record(label, false, `finalize → ${finRes.status} ${JSON.stringify(fin)}`);
      return;
    }

    // The bytes really are retrievable at the URL storage gave back, at the
    // right length. "Stored" that cannot be read is not stored.
    const head = await fetch(String(fin.url).replace("https://", "http://"), { method: "HEAD" });
    const served = Number(head.headers.get("content-length"));
    if (!head.ok || served !== size) {
      record(label, false, `HEAD ${head.status}, content-length ${served} != ${size}`);
      return;
    }

    // Finalize twice: the second must replay, not re-store.
    const replay = await json(await post(withAction(base(uploadId, key, size, "book.pdf"), "finalize")));
    if (replay.url !== fin.url || replay.replayed !== true) {
      record(label, false, `second finalize did not replay: ${JSON.stringify(replay)}`);
      return;
    }

    // The staging directory is gone; the session row says STORED.
    const staging = path.join(process.env.UPLOAD_STAGING_DIR!, uploadId);
    const stagingGone = !(await fsp.stat(staging).catch(() => null));
    const db = createServiceClient();
    const { data: row } = await db
      .from("upload_sessions")
      .select("state, stored_bytes, content_hash, owner_id")
      .eq("id", uploadId)
      .maybeSingle();

    const ok =
      stagingGone &&
      row?.state === "STORED" &&
      Number(row.stored_bytes) === size &&
      typeof row.content_hash === "string" &&
      row.owner_id === OWNER;

    record(
      label,
      ok,
      `send ${(sendMs / 1000).toFixed(1)}s, finalize ${(finalizeMs / 1000).toFixed(1)}s, ` +
        `peak RSS ${(peakRss / MB).toFixed(0)} MB, served ${served} bytes` +
        (ok ? "" : `, row=${JSON.stringify(row)} stagingGone=${stagingGone}`),
    );
  } finally {
    clearInterval(sampler);
  }
}

function withAction(fd: FormData, action: string): FormData {
  fd.set("action", action);
  return fd;
}

async function runProtocolChecks() {
  const size = 12 * MB;
  const total = Math.ceil(size / CHUNK);
  const key = "books/e2e-protocol/book.pdf";

  // ── missing middle chunk, then recovery ─────────────────────────────────
  {
    const uploadId = `e2e-missing-${Date.now().toString(36)}`;
    await post(withAction(base(uploadId, key, size, "book.pdf"), "init"));
    for (const i of [0, 2]) {
      const bytes = i === total - 1 ? size - i * CHUNK : CHUNK;
      const fd = withAction(base(uploadId, key, size, "book.pdf"), "chunk");
      fd.set("chunkIndex", String(i));
      fd.set("chunk", pdfChunk(i, bytes), "book.pdf");
      await post(fd);
    }
    const res = await post(withAction(base(uploadId, key, size, "book.pdf"), "finalize"));
    const body = await json(res);
    record(
      "missing chunk is named, session survives",
      res.status === 409 && JSON.stringify(body.missingChunks) === "[1]",
      `status ${res.status}, missing ${JSON.stringify(body.missingChunks)}`,
    );

    const fd = withAction(base(uploadId, key, size, "book.pdf"), "chunk");
    fd.set("chunkIndex", "1");
    fd.set("chunk", pdfChunk(1, CHUNK), "book.pdf");
    await post(fd);
    const done = await post(withAction(base(uploadId, key, size, "book.pdf"), "finalize"));
    record("re-sending only the missing part completes the upload", done.status === 200);
  }

  // ── two concurrent finalizes ────────────────────────────────────────────
  {
    const uploadId = `e2e-race-${Date.now().toString(36)}`;
    await post(withAction(base(uploadId, key, size, "book.pdf"), "init"));
    for (let i = 0; i < total; i++) {
      const bytes = i === total - 1 ? size - i * CHUNK : CHUNK;
      const fd = withAction(base(uploadId, key, size, "book.pdf"), "chunk");
      fd.set("chunkIndex", String(i));
      fd.set("chunk", pdfChunk(i, bytes), "book.pdf");
      await post(fd);
    }
    const [a, b] = await Promise.all([
      post(withAction(base(uploadId, key, size, "book.pdf"), "finalize")),
      post(withAction(base(uploadId, key, size, "book.pdf"), "finalize")),
    ]);
    const bodies = [await json(a), await json(b)];
    const urls = new Set(bodies.map((x) => x.url).filter(Boolean));
    const statuses = [a.status, b.status].sort();
    record(
      "two simultaneous finalizes produce one stored object",
      urls.size <= 1 && statuses[0] === 200,
      `statuses ${statuses.join("/")}, distinct urls ${urls.size}`,
    );
  }

  // ── exactly 100 MiB is refused before any bytes are sent ─────────────────
  {
    const uploadId = `e2e-cap-${Date.now().toString(36)}`;
    const res = await post(
      withAction(base(uploadId, key, 100 * MB, "book.pdf"), "init"),
    );
    const body = await json(res);
    record(
      "exactly 100 MiB is refused at init, not after 20 chunks",
      res.status === 413 && body.errorCode === "UPLOAD_LIMIT",
      `status ${res.status}, code ${body.errorCode}`,
    );
  }

  // ── another account cannot touch the session ─────────────────────────────
  {
    const uploadId = `e2e-owner-${Date.now().toString(36)}`;
    await post(withAction(base(uploadId, key, size, "book.pdf"), "init"));
    authStub.__setE2eUser("00000000-0000-4000-8000-000000000000");
    const res = await post(withAction(base(uploadId, key, size, "book.pdf"), "finalize"));
    authStub.__setE2eUser(OWNER);
    record(
      "another account cannot finalize this session",
      res.status === 404,
      `status ${res.status}`,
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  const sizesArg = args.includes("--sizes") ? args[args.indexOf("--sizes") + 1] : "10,25,50,75,100";
  /* 100 means "as large as the app allows", which is one byte under 100 MiB —
     carried as an exact byte count, because converting it back through MB
     rounds it straight into the size storage refuses. */
  const sizes = sizesArg
    .split(",")
    .map((s) => Number(s.trim()))
    .filter(Boolean)
    .map((mb) => ({ mb, bytes: mb === 100 ? 100 * MB - 1 : Math.round(mb * MB) }));

  if (!process.env.UPLOAD_STAGING_DIR) {
    process.env.UPLOAD_STAGING_DIR = await fsp.mkdtemp(path.join(os.tmpdir(), "ptec-e2e-"));
  }
  await fsp.mkdir(process.env.UPLOAD_STAGING_DIR, { recursive: true });

  console.log(`\nstaging: ${process.env.UPLOAD_STAGING_DIR}`);
  console.log(`storage: ${process.env.ZIMA_API_URL}\n`);

  console.log("Size matrix");
  for (const { mb, bytes } of sizes) {
    await runOneSize(mb, bytes);
  }

  console.log("\nProtocol");
  await runProtocolChecks();

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} checks passed` +
      (failed.length ? `\nFAILED: ${failed.map((f) => f.label).join(", ")}` : ""),
  );
  process.exit(failed.length ? 1 : 0);
}

await main();
