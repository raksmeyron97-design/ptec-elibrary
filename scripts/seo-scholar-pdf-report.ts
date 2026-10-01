// scripts/seo-scholar-pdf-report.ts
//
//   NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… \
//     [SUPABASE_SERVICE_ROLE_KEY=…] npx tsx scripts/seo-scholar-pdf-report.ts [--out docs/seo/scholar-pdf-report.csv]
//
// READ-ONLY, one request at a time. SEO Phase 3.4: which published theses
// Google Scholar would refuse as full text, BEFORE a librarian opens them.
// Scholar takes a PDF of 5 MB or less with searchable text; a scan, or a
// Khmer PDF in a legacy non-Unicode font, gives it nothing to index.
//
// Size comes from `research_reports.file_size_kb` (readable with the anon
// key). Whether the PDF has a text layer comes from `resource_index_state`,
// which only the service role can read — so with the anon key alone that
// column says "unknown" rather than guessing; run it with the service key on
// the box for the full report. Writes nothing to the database.

import { writeFileSync } from "node:fs";
import { escapeCsvCell } from "../lib/export/csv";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const outIdx = process.argv.indexOf("--out");
const OUT = outIdx > -1 ? process.argv[outIdx + 1] : "docs/seo/scholar-pdf-report.csv";
if (!url || !anon) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (read-only).");
  process.exit(2);
}

/** Google Scholar's documented ceiling for a full-text PDF. */
const SCHOLAR_MAX_KB = 5 * 1024;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function fetchAll<T>(q: string, key: string): Promise<T[] | null> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    await sleep(300);
    const res = await fetch(`${url}/rest/v1/${q}`, {
      headers: { apikey: key, authorization: `Bearer ${key}`, range: `${from}-${from + 999}` },
    });
    if (!res.ok) return null;
    const page = (await res.json()) as T[];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

// The shared cell writer (lib/export/csv.ts): RFC 4180 quoting AND the
// formula guard. These files are opened in Excel or Sheets by librarians, and a
// title or name beginning with =, +, - or @ would otherwise run as a formula.
const csv = (v: string | number | boolean | null | undefined) =>
  escapeCsvCell(typeof v === "boolean" ? String(v) : v);

type Thesis = { id: string; slug: string; title: string; file_url: string | null; file_size_kb: number | null; access?: string | null };
type IndexState = { record_id: string; record_type: string; status: string };

async function main(): Promise<void> {
  console.log(`Reading from ${new URL(url!).host} (${service ? "service role" : "anon"}, read-only, sequential)`);
  const theses =
    (await fetchAll<Thesis>("research_reports?select=id,slug,title,file_url,file_size_kb,access&is_published=eq.true&order=id.asc", anon!)) ??
    (await fetchAll<Thesis>("research_reports?select=id,slug,title,file_url,file_size_kb&is_published=eq.true&order=id.asc", anon!)) ??
    [];
  const states = service
    ? await fetchAll<IndexState>("resource_index_state?select=record_id,record_type,status&record_type=eq.thesis&order=record_id.asc", service)
    : null;
  const statusById = new Map((states ?? []).map((s) => [s.record_id, s.status]));

  const lines = [["slug", "title", "access", "size_mb", "text_layer", "scholar_ready", "reason"].join(",")];
  let ready = 0;
  for (const t of theses) {
    const problems: string[] = [];
    if (!t.file_url) problems.push("no PDF");
    const kb = t.file_size_kb ?? null;
    if (kb != null && kb > SCHOLAR_MAX_KB) problems.push(`over 5 MB (${(kb / 1024).toFixed(1)} MB)`);
    if (kb == null && t.file_url) problems.push("size not recorded");
    const status = states ? (statusById.get(t.id) ?? "never_attempted") : "unknown";
    if (status === "no_text_layer") problems.push("no text layer (a scan)");
    if (status === "failed" || status === "unfetchable") problems.push(`text extraction ${status}`);
    const verdict = problems.length === 0 ? (status === "indexed" ? "yes" : "size ok; text unknown") : "no";
    if (verdict === "yes") ready += 1;
    lines.push(
      [
        csv(t.slug),
        csv(t.title.slice(0, 150)),
        csv(t.access ?? "restricted"),
        kb != null ? (kb / 1024).toFixed(2) : "",
        status,
        verdict,
        csv(problems.join("; ")),
      ].join(","),
    );
  }
  writeFileSync(OUT, `${lines.join("\n")}\n`);
  console.log(`${theses.length} published theses; ${ready} Scholar-ready${states ? "" : " (text layer unknown without the service key)"} → ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

export {};
