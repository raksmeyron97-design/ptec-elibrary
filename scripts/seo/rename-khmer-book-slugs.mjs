// scripts/seo/rename-khmer-book-slugs.mjs
//
// One-shot SEO cleanup: replaces the 7 legacy timestamp slugs
// (book-1781238…) with real Khmer slugs derived from each book's title via
// lib/slug.ts#unicodeSlug, and records a 301 in book_slug_redirects so the
// old URLs keep working (middleware slug gate consumes that table).
//
// ⚠️ RUN ONLY AFTER the decodeSlugParam fix (lib/slug.ts + [slug] pages) is
// DEPLOYED to production — before that, pages receive non-ASCII slugs
// percent-encoded and render soft-404s (verified 2026-07-18 with a canary).
//
// Usage:
//   node scripts/seo/rename-khmer-book-slugs.mjs --dry-run
//   node scripts/seo/rename-khmer-book-slugs.mjs
//
// Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.
// Verifies each rename live against SITE_BASE (new URL 200, old URL 301);
// on a failed verification it reverts that book and stops.

import { readFileSync } from "node:fs";

const SITE_BASE = "https://library.ptec.edu.kh";

// Precomputed with lib/slug.ts#unicodeSlug from each book's title
// (lib/slug.test.ts pins the algorithm).
const RENAMES = [
  { id: "2cb5a693-a532-4f00-bae4-2295b26380b3", oldSlug: "book-1781238136253", newSlug: "ឯកសារណែនាំស្តីពីឧបករណ៍ពិសោធ" },
  { id: "3d947a31-153c-4207-a5f3-74f1509c9b1a", oldSlug: "book-1781238135294", newSlug: "ការគ្រប់គ្រងមន្ទីរពិសោធវិទ្យាសាស្ត្រ" },
  { id: "49646f01-a6f5-4485-9fcc-b0a72e1a3e07", oldSlug: "book-1781238137178", newSlug: "ពិសោធគីមីវិទ្យា-ភាគ២" },
  { id: "97b4285a-ea71-474c-8937-41c4faa733a9", oldSlug: "book-1781238129420", newSlug: "កម្មវិធីសិក្សាលម្អិតវិធីសាស្ត្របង្រៀនគណិតវិទ្យា-២" },
  { id: "ab68bea2-afe5-4d38-b2da-e30381ce0a76", oldSlug: "book-1783313246982", newSlug: "អាំងតេក្រាល" },
  { id: "12ca2d37-c4b7-4353-9d69-26ad2d294772", oldSlug: "book-1781238128375", newSlug: "កម្មវិធីសិក្សាលម្អិតវិធីសាស្ត្របង្រៀនគណិតវិទ្យា-១" },
  { id: "22838ea0-d6e9-4c58-b291-f280acbf1be6", oldSlug: "book-1781238127030", newSlug: "កម្មវិធីសិក្សាលម្អិតចំណេះដឹងឯកទេសគណិតវិទ្យា" },
];

function loadEnv() {
  try {
    for (const line of readFileSync(new URL("../../.env", import.meta.url), "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* rely on ambient env */ }
}

loadEnv();
const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const dryRun = process.argv.includes("--dry-run");

async function rest(path, init = {}) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, { ...init, headers: { ...HEADERS, ...init.headers } });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function verifyLive(oldSlug, newSlug) {
  // The edge slug-gate snapshot refreshes within ~120s; poll up to 3 minutes.
  const newUrl = `${SITE_BASE}/books/${encodeURIComponent(newSlug)}`;
  const oldUrl = `${SITE_BASE}/books/${oldSlug}`;
  for (let i = 0; i < 9; i++) {
    const [n, o] = await Promise.all([
      fetch(newUrl).then(async (r) => ({ status: r.status, ok: (await r.text()).includes('id="details"') })),
      fetch(oldUrl, { redirect: "manual" }).then((r) => r.status),
    ]);
    if (n.status === 200 && n.ok && (o === 301 || o === 308)) return true;
    console.log(`    waiting for edge cache… new=${n.status}/detail:${n.ok} old=${o}`);
    await new Promise((r) => setTimeout(r, 20_000));
  }
  return false;
}

for (const { id, oldSlug, newSlug } of RENAMES) {
  console.log(`\n${oldSlug} → ${newSlug}`);
  const [book] = await rest(`books?select=id,slug,is_published&id=eq.${id}`);
  if (!book) { console.log("  SKIP: book not found"); continue; }
  if (book.slug === newSlug) { console.log("  SKIP: already renamed"); continue; }
  if (book.slug !== oldSlug) { console.log(`  SKIP: slug is now '${book.slug}', not '${oldSlug}'`); continue; }
  const clash = await rest(`books?select=id&slug=eq.${encodeURIComponent(newSlug)}`);
  if (clash.length > 0) { console.log("  SKIP: new slug already taken"); continue; }
  if (dryRun) { console.log("  DRY RUN: would rename + insert redirect"); continue; }

  await rest(`books?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ slug: newSlug }) });
  await rest(`book_slug_redirects`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ old_slug: oldSlug, book_id: id }),
  });
  console.log("  renamed + redirect inserted, verifying live…");

  if (await verifyLive(oldSlug, newSlug)) {
    console.log("  ✅ verified: new URL 200 with detail body, old URL 301");
  } else {
    console.log("  ❌ verification failed — REVERTING this book and stopping.");
    await rest(`books?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ slug: oldSlug }) });
    await rest(`book_slug_redirects?old_slug=eq.${oldSlug}`, { method: "DELETE" });
    process.exit(1);
  }
}
console.log("\nDone. Remember: sitemap regenerates on its own ISR schedule.");
