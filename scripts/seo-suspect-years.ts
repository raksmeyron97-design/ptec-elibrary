// scripts/seo-suspect-years.ts
//
//   NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… \
//     npx tsx scripts/seo-suspect-years.ts [--out docs/seo/suspect-publication-years.csv]
//
// READ-ONLY, anon key only. Lists published books whose publication year may
// be a DEFAULT rather than a fact, for librarians to confirm or clear.
//
// Until Phase 1 (decision D11), a book saved with no year was stored as the
// CURRENT year (validatedYear() in the admin book actions), so an import in
// 2026 of a book with no year on its title page published "2026" to Google
// Scholar and in JSON-LD. The code no longer does that; the rows it already
// wrote cannot be told apart from books genuinely published that year. The
// signal used here is the only one available: the stored year equals the year
// the record was created. It flags; it changes nothing and guesses nothing.

import { writeFileSync } from "node:fs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const outIdx = process.argv.indexOf("--out");
const OUT = outIdx > -1 ? process.argv[outIdx + 1] : "docs/seo/suspect-publication-years.csv";
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (read-only, anon).");
  process.exit(2);
}
console.log(`Reading published books from ${new URL(url).host} (anon, read-only)`);

type Row = { id: string; slug: string; title: string; published_at: string | null; created_at: string | null };

async function fetchAll(): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; ) {
    const res = await fetch(
      `${url}/rest/v1/books?select=id,slug,title,published_at,created_at&is_published=eq.true&order=id.asc`,
      { headers: { apikey: key!, authorization: `Bearer ${key}`, range: `${from}-${from + 999}` } },
    );
    if (!res.ok) throw new Error(`books ${res.status}: ${await res.text()}`);
    const page = (await res.json()) as Row[];
    if (page.length === 0) break;
    rows.push(...page);
    from += page.length;
  }
  return rows;
}

const csv = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function main(): Promise<void> {
  const rows = await fetchAll();
  const suspect = rows.filter((r) => {
    if (!r.published_at || !r.created_at) return false;
    const m = r.published_at.match(/^(\d{4})-01-01/);
    return m !== null && Number(m[1]) === new Date(r.created_at).getUTCFullYear();
  });
  const byYear = new Map<string, number>();
  for (const r of suspect) byYear.set(r.published_at!.slice(0, 4), (byYear.get(r.published_at!.slice(0, 4)) ?? 0) + 1);
  const lines = [["slug", "title", "stored_year", "record_created", "decision"].join(",")];
  for (const r of suspect.sort((a, b) => a.title.localeCompare(b.title))) {
    lines.push([csv(r.slug), csv(r.title.slice(0, 150)), r.published_at!.slice(0, 4), r.created_at!.slice(0, 10), ""].join(","));
  }
  writeFileSync(OUT, `${lines.join("\n")}\n`);
  console.log(`${rows.length} published books; ${suspect.length} whose year equals their creation year (${[...byYear].map(([y, n]) => `${y}: ${n}`).join(", ")}) → ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

export {};
