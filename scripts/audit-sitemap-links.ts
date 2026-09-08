// scripts/audit-sitemap-links.ts
//
//   npx tsx scripts/audit-sitemap-links.ts
//   npx tsx scripts/audit-sitemap-links.ts --base https://library.ptec.edu.kh
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

const baseIdx = process.argv.indexOf("--base");
const BASE = (baseIdx >= 0 ? process.argv[baseIdx + 1] : "https://library.ptec.edu.kh").replace(/\/$/, "");
const CONCURRENCY = 6;
const UA = "ptec-link-audit/1.0 (bot; sitemap verification)";

/** Fetch a URL, retrying transport failures before calling it broken. */
async function probe(
  url: string,
  attempts: number,
): Promise<{ url: string; status: number; location?: string }> {
  let lastErr = "";
  for (let n = 0; n < attempts; n++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA }, redirect: "manual" });
      return { url, status: res.status, location: res.headers.get("location") ?? undefined };
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      await new Promise((r) => setTimeout(r, 400 * (n + 1)));
    }
  }
  return { url, status: 0, location: `transport: ${lastErr}` };
}

async function main() {
  const xml = await (await fetch(`${BASE}/sitemap.xml`, { headers: { "user-agent": UA } })).text();
  const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) =>
    m[1].replace(/&amp;/g, "&").trim(),
  );
  console.log(`sitemap: ${urls.length} URLs from ${BASE}\n`);

  const results: { url: string; status: number; location?: string }[] = [];
  let i = 0;
  async function worker() {
    for (;;) {
      const idx = i++;
      if (idx >= urls.length) return;
      const url = urls[idx];
      // A transport failure is retried before it is believed. Measured: at
      // concurrency 6 two long Khmer book URLs came back as connection errors
      // and returned 200 the moment they were asked again on their own — a
      // reset from the edge under parallel load, not a broken page. Reporting
      // those as dead links is how a link auditor stops being read.
      results.push(await probe(url, 2));
      if (idx % 50 === 0) process.stdout.write(`  ${idx}/${urls.length}\r`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const tally = new Map<number, number>();
  for (const r of results) tally.set(r.status, (tally.get(r.status) ?? 0) + 1);
  console.log("status distribution:");
  console.table([...tally].sort((a, b) => a[0] - b[0]).map(([status, n]) => ({ status, urls: n })));

  const bad = results.filter((r) => r.status >= 400 || r.status === 0);
  const redirects = results.filter((r) => r.status >= 300 && r.status < 400);

  if (bad.length) {
    console.log(`\n${bad.length} BROKEN sitemap URLs:`);
    for (const r of bad.slice(0, 40)) console.log(`  ${r.status}  ${r.url}`);
    if (bad.length > 40) console.log(`  … and ${bad.length - 40} more`);
  } else console.log("\nNo broken sitemap URLs.");

  if (redirects.length) {
    console.log(`\n${redirects.length} sitemap URLs that REDIRECT (should list the target):`);
    for (const r of redirects.slice(0, 20)) console.log(`  ${r.status}  ${r.url}\n        → ${r.location}`);
    if (redirects.length > 20) console.log(`  … and ${redirects.length - 20} more`);
  } else console.log("No redirecting sitemap URLs.");

  process.exitCode = bad.length ? 1 : 0;
}
main().catch((e) => { console.error(e); process.exit(1); });
