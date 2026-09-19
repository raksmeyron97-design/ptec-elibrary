// scripts/audit-sitemap-links.ts
//
//   npx tsx scripts/audit-sitemap-links.ts
//   npx tsx scripts/audit-sitemap-links.ts --base https://library.ptec.edu.kh
//   npx tsx scripts/audit-sitemap-links.ts --concurrency 2 --strict
//
// Crawls every URL the production sitemap advertises and reports anything a
// crawler would treat as a broken promise: a 404/410, a redirect (the sitemap
// should list the canonical URL, not a hop to it), or a 5xx.
//
// A sitemap is a claim about what exists. An entry that 404s does not just
// waste crawl budget — it is the library telling Google about a page it does
// not have, and it has happened here before (author URLs whose slug was null).
//
// Read-only: GET with a bot UA, bounded concurrency, no writes.
//
// ── A dropped connection is not a dead link ─────────────────────────────────
//
// This file used to file a transport failure under "BROKEN sitemap URLs" and
// exit 1 on it, while carrying a comment explaining precisely why that is
// wrong. On 2026-09-19 a full run at concurrency 6 reported **141 of 2,313
// URLs broken**; every one spot-checked afterwards answered 200 on the first
// serial request, and the same crawl of the same URLs minutes later at
// concurrency 2 reported **2313 passed (2313 URLs)** — no 404, no redirect,
// no 5xx, nothing unanswered. The origin resets connections under parallel
// load, and the auditor was reading its own load as the library's defect. A
// number that moves with the observer was never measuring the library.
//
// So it now speaks the fault vocabulary every other instrument here speaks
// (lib/verify/http.ts), and the three rules that vocabulary exists for apply
// unchanged:
//
//   * a transport failure is `unknown` — never a pass, never a defect;
//   * an INCOMPLETE run exits 0 and says so, because a red that means weather
//     is how a red that means a regression stops being read;
//   * "passed" is counted, never computed by subtraction.
//
// `--strict` inverts the exit code for a deliberate manual audit, and
// `--concurrency` is now a flag, defaulting to 4, because the right response
// to an origin that resets under load is to ask more gently — not to widen
// what counts as broken.

import {
  errorOutcome,
  exitCodeFor,
  fetchWithRetry,
  incompleteBanner,
  summaryLine,
  tally,
  type Outcome,
} from "../lib/verify/http";

const argv = process.argv.slice(2);
const flag = (name: string, fallback?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};

const BASE = (flag("base", "https://library.ptec.edu.kh") as string).replace(/\/$/, "");
const CONCURRENCY = Math.max(1, Number(flag("concurrency", "4")));
const STRICT = argv.includes("--strict");
const UA = "ptec-link-audit/1.0 (bot; sitemap verification)";

/** Statuses the caller inspects itself rather than treating as an error. */
const REDIRECTS = [301, 302, 303, 307, 308] as const;

type Row = {
  url: string;
  outcome: Outcome;
  /** The status the origin answered with, or null when it did not answer. */
  status: number | null;
  detail?: string;
};

async function probe(url: string): Promise<Row> {
  try {
    // `redirect: "manual"` because the redirect IS the finding: following it
    // would report the destination's 200 and hide that the sitemap advertised
    // a hop.
    const res = await fetchWithRetry(url, { allowStatuses: REDIRECTS, redirect: "manual" });
    if ((REDIRECTS as readonly number[]).includes(res.status)) {
      return {
        url,
        outcome: "fail",
        status: res.status,
        detail: res.headers.get("location") ?? "(no Location header)",
      };
    }
    return { url, outcome: "ok", status: res.status };
  } catch (err) {
    // 404/410 → `warn` (a record moved, which is cataloguing drift);
    // a persisting 5xx → `fail`; anything with no answer at all → `unknown`.
    const [outcome, detail] = errorOutcome(err);
    const status = /\b(\d{3})\b/.exec(detail)?.[1];
    return { url, outcome, status: status ? Number(status) : null, detail };
  }
}

async function main() {
  const res = await fetch(`${BASE}/sitemap.xml`, { headers: { "user-agent": UA } });
  const xml = await res.text();
  const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) =>
    m[1].replace(/&amp;/g, "&").trim(),
  );
  console.log(`sitemap: ${urls.length} URLs from ${BASE} (concurrency ${CONCURRENCY})\n`);

  const rows: Row[] = [];
  let i = 0;
  async function worker() {
    for (;;) {
      const idx = i++;
      if (idx >= urls.length) return;
      rows.push(await probe(urls[idx]));
      if (idx % 50 === 0) process.stdout.write(`  ${idx}/${urls.length}\r`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const counts = tally(rows.map((r) => r.outcome));
  const show = (label: string, of: Outcome, cap: number) => {
    const picked = rows.filter((r) => r.outcome === of);
    if (picked.length === 0) return;
    console.log(`\n${picked.length} ${label}:`);
    for (const r of picked.slice(0, cap)) {
      console.log(`  ${String(r.status ?? "—").padStart(3)}  ${r.url}`);
      if (r.detail) console.log(`        ${r.detail}`);
    }
    if (picked.length > cap) console.log(`  … and ${picked.length - cap} more`);
  };

  show("sitemap URLs a crawler would treat as BROKEN (5xx, or a redirect where the canonical URL belongs)", "fail", 40);
  show("sitemap URLs that answered 404/410 — a record moved or was unpublished", "warn", 20);
  show("sitemap URLs the origin did not answer — NOT checked, and NOT evidence of a defect", "unknown", 20);

  console.log(`\n${summaryLine(counts)} (${urls.length} URLs)`);
  const banner = incompleteBanner(counts);
  if (banner) {
    console.log(banner);
    console.log(
      "  A transport failure here is usually this auditor's own parallel load, not the library's. " +
        "Re-run with --concurrency 1 to confirm before recording any of them as a finding.",
    );
  }
  process.exitCode = exitCodeFor(counts, STRICT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
