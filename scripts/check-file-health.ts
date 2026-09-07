/* scripts/check-file-health.ts
 *
 * HEAD-checks every published book/thesis file_url and cover_url, and
 * upserts the result into file_health (migration 0065). Read by the
 * /admin/data-quality dashboard's "Broken files" section.
 *
 * This is deliberately an out-of-band job, not a request-path check — a
 * library-wide link sweep has no business running on a page load.
 *
 * book_files.file_url has two shapes (mirrors the branching in
 * /api/books/[slug]/download/route.ts — keep both in sync):
 *   - a full https:// URL (Zima CDN, or legacy public R2 bucket)   → HEAD it directly
 *   - a bare object key, e.g. "books/book-.../book.pdf"            → legacy PRIVATE R2
 *     bucket; not fetchable as-is, needs a presigned GetObject URL first
 * Covers and thesis file_urls are always full URLs (verified against the
 * live DB before writing this) so they never need the presigning branch.
 *
 * Identify to Zima, and never mistake "not now" for "not here".
 * Zima meters /files reads per client IP: 300/min anonymous, 3000/min with a
 * recognised x-api-key (the same bucket split lib/zima.ts's zimaFetch() relies
 * on for readers). A sweep is ~540 requests, so an anonymous run crossed the
 * ceiling at request ~300 and wrote the remaining ~100 rows as "broken" with
 * http_status 429 — a page of false "PDF broken" alarms on the dashboard.
 * Two rules now, both in lib/file-health/check.ts (pure, unit-tested):
 *   1. The key is sent to Zima hosts only (isZimaUrl — same allow-list as the
 *      app), never to R2/blob/other hosts a DB row may point at.
 *   2. 429 / 5xx / 408 / no response are retried with backoff (Retry-After
 *      honoured, and a 429 pauses the WHOLE pool, not just one worker) and,
 *      if they never settle, recorded as `unknown` with the status kept.
 *      Only a definite refusal (404, 403, 410, …) is `broken`.
 *
 * Run:
 *   npx tsx scripts/check-file-health.ts
 *
 * Env (.env.local / .env):
 *   NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ZIMA_API_URL, ZIMA_API_KEY
 *     (strongly recommended: without the key the sweep runs in the anonymous
 *     300/min bucket and will be rate limited; those rows become `unknown`,
 *     not `broken`, but they are still unchecked)
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
 *     (only needed if any book still has a legacy bare-key file_url)
 *
 * Exit code: 0 on a normal run; 2 when rows were rate limited AND no
 * ZIMA_API_KEY was configured, so the weekly job goes red for the one cause
 * an operator can fix by adding a secret.
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { createClient } from "@supabase/supabase-js";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { isZimaUrl } from "../lib/zima";
import {
  decideProbe,
  shouldFallBackToRangedGet,
  type ProbeVerdict,
} from "../lib/file-health/check";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ZIMA_API_KEY = process.env.ZIMA_API_KEY ?? "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("✖ Missing env. Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const CONCURRENCY = 8;
const TIMEOUT_MS = 10_000;

const r2 = process.env.R2_ACCOUNT_ID
  ? new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    })
  : null;

/** Bare legacy R2 object key → a short-lived presigned URL that's actually fetchable. */
async function presignLegacyKey(key: string): Promise<string | null> {
  if (!r2) return null;
  try {
    const command = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key });
    return await getSignedUrl(r2, command, { expiresIn: 60 });
  } catch {
    return null;
  }
}

type Target = { recordType: "book" | "research"; recordId: string; field: "file_url" | "cover_url"; url: string };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * One rate-limit gate for the whole pool. A 429 is a statement about the
 * CLIENT's budget, so when one worker sees it the other seven are about to;
 * letting them each discover it independently is eight wasted requests and
 * eight more strikes against the window.
 */
let pausedUntil = 0;
async function waitForRateWindow(): Promise<void> {
  for (;;) {
    const wait = pausedUntil - Date.now();
    if (wait <= 0) return;
    await sleep(wait);
  }
}

/**
 * Credentials for one probe. The key goes to Zima's own hosts only — the same
 * allow-list zimaFetch() applies — so a DB row pointing at some other host can
 * never make this script hand the key to a third party.
 */
function probeHeaders(url: string, extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...(extra ?? {}) };
  if (ZIMA_API_KEY && isZimaUrl(url)) headers["x-api-key"] = ZIMA_API_KEY;
  return headers;
}

type ProbeResult = { httpStatus: number | null; retryAfter: string | null };

/** One HTTP round-trip. A thrown fetch (network, timeout) is a null status. */
async function probeOnce(url: string, presigned: boolean): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let res: Response;
    if (!presigned) {
      res = await fetch(url, { method: "HEAD", headers: probeHeaders(url), signal: controller.signal });
      if (shouldFallBackToRangedGet(res.status)) {
        // Some CDNs/storage backends reject HEAD outright — fall back to a ranged GET.
        res = await fetch(url, {
          method: "GET",
          headers: probeHeaders(url, { Range: "bytes=0-0" }),
          signal: controller.signal,
        });
      }
    } else {
      // R2 presigned GetObject URLs are signed for GET specifically — a HEAD
      // against one comes back 403 (verified directly against the live
      // bucket), so never attempt HEAD here. No api key: not a Zima host.
      res = await fetch(url, { method: "GET", headers: { Range: "bytes=0-0" }, signal: controller.signal });
    }
    // Drain nothing: HEAD has no body and the ranged GET is one byte. Cancel
    // whatever is left so the connection returns to the pool.
    await res.body?.cancel().catch(() => undefined);
    return { httpStatus: res.status, retryAfter: res.headers.get("retry-after") };
  } catch {
    return { httpStatus: null, retryAfter: null };
  } finally {
    clearTimeout(timer);
  }
}

async function checkUrl(rawUrl: string): Promise<ProbeVerdict> {
  const isFullUrl = rawUrl.startsWith("http://") || rawUrl.startsWith("https://");
  const url = isFullUrl ? rawUrl : await presignLegacyKey(rawUrl);

  if (!url) {
    // Bare key but no R2 credentials configured to presign it — can't check, don't guess.
    return { status: "unknown", httpStatus: null };
  }

  for (let attempt = 1; ; attempt++) {
    await waitForRateWindow();
    const probe = await probeOnce(url, !isFullUrl);
    const decision = decideProbe({ httpStatus: probe.httpStatus, attempt, retryAfter: probe.retryAfter });
    if (decision.kind === "settle") return decision.verdict;

    if (probe.httpStatus === 429) {
      // Everyone waits, not just this worker.
      pausedUntil = Math.max(pausedUntil, Date.now() + decision.delayMs);
    } else {
      await sleep(decision.delayMs);
    }
  }
}

async function runPool<T>(items: T[], worker: (item: T) => Promise<void>, concurrency: number) {
  let cursor = 0;
  async function next(): Promise<void> {
    const i = cursor++;
    if (i >= items.length) return;
    await worker(items[i]);
    return next();
  }
  await Promise.all(Array.from({ length: concurrency }, next));
}

async function main() {
  console.log("Fetching published books and theses…");

  const [{ data: books }, { data: theses }] = await Promise.all([
    db.from("books").select("id, cover_url, book_files(file_url)").eq("is_published", true),
    db.from("research_reports").select("id, cover_url, file_url").eq("is_published", true),
  ]);

  const targets: Target[] = [];
  for (const b of books ?? []) {
    if (b.cover_url) targets.push({ recordType: "book", recordId: b.id, field: "cover_url", url: b.cover_url });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfUrl = (b.book_files as any[])?.find((f) => f.file_url)?.file_url;
    if (pdfUrl) targets.push({ recordType: "book", recordId: b.id, field: "file_url", url: pdfUrl });
  }
  for (const r of theses ?? []) {
    if (r.cover_url) targets.push({ recordType: "research", recordId: r.id, field: "cover_url", url: r.cover_url });
    if (r.file_url) targets.push({ recordType: "research", recordId: r.id, field: "file_url", url: r.file_url });
  }

  const zimaTargets = targets.filter((t) => isZimaUrl(t.url)).length;
  if (zimaTargets > 0 && !ZIMA_API_KEY) {
    console.warn(
      `⚠ ${zimaTargets} of ${targets.length} URLs are on Zima Storage but ZIMA_API_KEY is not set: ` +
        "the sweep will run in the anonymous 300 req/min bucket and is likely to be rate limited. " +
        "Rate-limited rows are recorded as `unknown`, never as `broken`.",
    );
  } else if (zimaTargets > 0 && !process.env.ZIMA_API_URL) {
    console.warn("⚠ ZIMA_API_KEY is set but ZIMA_API_URL is not — the key cannot be matched to a host and will not be sent.");
  }

  console.log(`Checking ${targets.length} URLs (concurrency ${CONCURRENCY})…`);

  let ok = 0, broken = 0, unknown = 0, rateLimited = 0, done = 0;
  await runPool(
    targets,
    async (t) => {
      const result = await checkUrl(t.url);
      if (result.status === "ok") ok++;
      else if (result.status === "unknown") {
        unknown++;
        if (result.httpStatus === 429) rateLimited++;
      } else broken++;
      done++;
      if (done % 25 === 0) console.log(`  ${done}/${targets.length}…`);

      const { error } = await db.from("file_health").upsert(
        {
          record_type: t.recordType,
          record_id: t.recordId,
          field: t.field,
          url: t.url,
          status: result.status,
          http_status: result.httpStatus,
          checked_at: new Date().toISOString(),
        },
        { onConflict: "record_type,record_id,field" },
      );
      if (error) console.error(`  ✖ upsert failed for ${t.recordType}/${t.recordId}/${t.field}:`, error.message);
    },
    CONCURRENCY,
  );

  console.log(
    `\nDone. ${ok} ok, ${broken} broken, ${unknown} unknown (couldn't be checked` +
      (rateLimited > 0 ? `; ${rateLimited} of them rate limited by storage` : "") +
      `), out of ${targets.length} total.`,
  );

  if (rateLimited > 0 && !ZIMA_API_KEY) {
    console.error("✖ Rows were rate limited and ZIMA_API_KEY is not configured — add it and re-run.");
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
