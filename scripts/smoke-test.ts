// scripts/smoke-test.ts
//
//   npx tsx scripts/smoke-test.ts
//   npx tsx scripts/smoke-test.ts --base http://localhost:3000
//
// The smallest set of requests that says "the site is up and serving real
// content", runnable after any deploy. Exits non-zero if any check fails, so
// it can gate a release.
//
// Every check asserts a STATUS and something about the BODY. Status alone is
// not health: a 200 that renders an empty error state looks identical to a
// working page from the outside, and that is the failure mode this exists to
// catch.

const baseIdx = process.argv.indexOf("--base");
const BASE = (baseIdx >= 0 ? process.argv[baseIdx + 1] : "https://library.ptec.edu.kh").replace(/\/$/, "");
const UA = "ptec-smoke/1.0 (bot; deploy verification)";

type Check = {
  name: string;
  path: string;
  /** Something the response must contain to count as working, not just up. */
  expect?: (body: string) => boolean;
  expectStatus?: number;
  json?: boolean;
};

const CHECKS: Check[] = [
  { name: "homepage",        path: "/",                        expect: (b) => /Digital resources|PTEC/i.test(b) },
  { name: "books listing",   path: "/books",                   expect: (b) => /book/i.test(b) },
  { name: "search",          path: "/search?q=research",       expect: (b) => /search/i.test(b) },
  { name: "authors hub",     path: "/authors",                 expect: (b) => /author/i.test(b) },
  { name: "subjects hub",    path: "/subjects",                expect: (b) => /subject|category/i.test(b) },
  { name: "physical catalog", path: "/catalogs",               expect: (b) => /librar/i.test(b) },
  { name: "khmer homepage",  path: "/km",                      expect: (b) => /[ក-៿]/.test(b) },
  { name: "search API",      path: "/api/search/native?q=research", json: true,
    expect: (b) => { const d = JSON.parse(b); return Array.isArray(d.results) && d.counts?.total >= 0; } },
  { name: "health API",      path: "/api/health",              json: true,
    expect: (b) => { const d = JSON.parse(b); return typeof d === "object" && d !== null; } },
  { name: "sitemap",         path: "/sitemap.xml",             expect: (b) => b.includes("<loc>") },
  { name: "robots",          path: "/robots.txt",              expect: (b) => /user-agent/i.test(b) },
  // Private surfaces must NOT be publicly readable. A 200 here is a finding.
  { name: "admin is gated",  path: "/admin",                   expectStatus: 307 },
  // An unknown slug must be a real 404, not a streamed 200 (resource-slug gate).
  { name: "unknown book 404", path: "/books/definitely-not-a-real-book-xyz", expectStatus: 404 },
];

async function main() {
  console.log(`Smoke test — ${BASE} — ${new Date().toISOString()}\n`);
  const rows: { check: string; status: string; ms: number; body: string }[] = [];
  let failed = 0;

  for (const c of CHECKS) {
    const started = Date.now();
    let status = 0, bodyOk = "—", statusText = "";
    try {
      const res = await fetch(`${BASE}${c.path}`, { headers: { "user-agent": UA }, redirect: "manual" });
      status = res.status;
      const body = await res.text();
      const wantStatus = c.expectStatus ?? 200;
      const statusOk = status === wantStatus;
      let contentOk = true;
      if (statusOk && c.expect) {
        try { contentOk = c.expect(body); } catch { contentOk = false; }
      }
      statusText = statusOk ? `${status}` : `${status} (want ${wantStatus})`;
      bodyOk = !statusOk ? "—" : contentOk ? "ok" : "EMPTY/WRONG";
      if (!statusOk || !contentOk) failed++;
    } catch (err) {
      statusText = "ERR";
      bodyOk = err instanceof Error ? err.message.slice(0, 30) : "error";
      failed++;
    }
    rows.push({ check: c.name, status: statusText, ms: Date.now() - started, body: bodyOk });
  }

  console.table(rows);
  const slow = rows.filter((r) => r.ms > 3000);
  if (slow.length) console.log(`slow (>3s): ${slow.map((r) => `${r.check} ${r.ms}ms`).join(", ")}`);
  console.log(failed === 0 ? `\nAll ${rows.length} checks passed.` : `\n${failed} of ${rows.length} checks FAILED.`);
  process.exitCode = failed ? 1 : 0;
}
main().catch((e) => { console.error(e); process.exit(1); });

// This file has no imports, so `export {}` is what makes it a MODULE rather
// than a global script — without it its top-level `BASE`/`UA`/`main` collide
// with every other import-free script under tsc.
export {};
