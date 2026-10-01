// scripts/seo-description-quality.ts
//
//   NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… \
//     npx tsx scripts/seo-description-quality.ts [--out docs/seo/description-quality.csv]
//
// READ-ONLY, anon key only, one request at a time. SEO Phase 5.1 (F3): for
// every published book, the URL, whether it has a file a reader can open,
// how long its description is, how many other books share its description
// TEMPLATE (lib/seo/description-template.ts — the title, subject, author and
// numbers removed, then shingled and hashed), whether its date is an import
// placeholder, and its views and downloads. A summary of the largest
// templates goes to the matching .md file. It flags; it writes nothing.

import { writeFileSync } from "node:fs";
import { clusterSizes, isPlaceholderDate, templateKey } from "../lib/seo/description-template";
import { TEMPLATED_CLUSTER_MIN } from "../lib/seo/description-gate";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const outIdx = process.argv.indexOf("--out");
const OUT = outIdx > -1 ? process.argv[outIdx + 1] : "docs/seo/description-quality.csv";
const SUMMARY = OUT.replace(/\.csv$/, ".md");
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (read-only, anon).");
  process.exit(2);
}

type Book = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  published_at: string | null;
  created_at: string | null;
  download_count: number | null;
  view_count: number | null;
  file_access: string | null;
  categories: { name: string | null } | null;
  authors: { name: string | null } | null;
  book_files: { id: string }[] | null;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function fetchAll<T>(q: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    await sleep(400);
    const res = await fetch(`${url}/rest/v1/${q}`, {
      headers: { apikey: key!, authorization: `Bearer ${key}`, range: `${from}-${from + 999}` },
    });
    if (!res.ok) throw new Error(`${q.split("?")[0]} ${res.status}: ${await res.text()}`);
    const page = (await res.json()) as T[];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

const csv = (v: string | number | boolean | null | undefined) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function main(): Promise<void> {
  console.log(`Reading from ${new URL(url!).host} (anon, read-only, sequential)`);
  const books = await fetchAll<Book>(
    "books?select=id,slug,title,description,published_at,created_at,download_count,view_count,file_access," +
      "categories(name),authors(name),book_files(id)&is_published=eq.true&order=id.asc",
  );
  const rows = books.map((b) => {
    const subject = b.categories?.name ?? null;
    const author = b.authors?.name ?? null;
    const description = b.description?.trim() ?? "";
    return {
      b,
      hasFile: (b.book_files?.length ?? 0) > 0 && b.file_access !== "catalogue_only",
      length: [...description].length,
      template: templateKey(description, { title: b.title, subject, author }),
      placeholderDate: isPlaceholderDate(b.published_at, b.created_at),
      subject,
    };
  });
  const sizes = clusterSizes(rows.map((r) => r.template));

  const header = ["url", "title", "has_file", "description_chars", "template", "template_cluster_size", "placeholder_date", "views", "downloads"];
  const lines = [header.join(",")];
  for (const r of [...rows].sort((a, c) => (c.b.view_count ?? 0) - (a.b.view_count ?? 0))) {
    lines.push(
      [
        csv(`/books/${r.b.slug}`),
        csv(r.b.title.slice(0, 150)),
        r.hasFile,
        r.length,
        r.template,
        sizes.get(r.template) ?? 0,
        r.placeholderDate,
        r.b.view_count ?? 0,
        r.b.download_count ?? 0,
      ].join(","),
    );
  }
  writeFileSync(OUT, `${lines.join("\n")}\n`);

  // Summary: how many records share each template, largest first.
  const empty = rows.filter((r) => r.template === "empty").length;
  const templated = rows.filter((r) => r.template !== "empty" && (sizes.get(r.template) ?? 0) >= TEMPLATED_CLUSTER_MIN);
  const top = [...sizes.entries()].filter(([k]) => k !== "empty").sort((a, c) => c[1] - a[1]).slice(0, 15);
  const example = (k: string) => rows.find((r) => r.template === k)?.b;
  const md = [
    "# Description quality (SEO Phase 5.1)",
    "",
    `Generated ${new Date().toISOString().slice(0, 10)} from ${new URL(url!).host} (anon, read-only). Per-record rows: \`${OUT}\`.`,
    "",
    `- Published books: **${rows.length}**`,
    `- With a file a reader can open: **${rows.filter((r) => r.hasFile).length}**`,
    `- Empty description (nothing left once the title, subject and author are removed): **${empty}**`,
    `- Sharing a template with 4 or more other books: **${templated.length}**`,
    `- Date that looks like an import placeholder: **${rows.filter((r) => r.placeholderDate).length}**`,
    `- No file AND empty or templated description (what the 5.4 gate would withhold, if switched on): **${
      rows.filter((r) => !r.hasFile && (r.template === "empty" || (sizes.get(r.template) ?? 0) >= TEMPLATED_CLUSTER_MIN)).length
    }**`,
    "",
    "## Largest templates",
    "",
    "| Books | Template | Example (title → description, first 140 characters) |",
    "|---:|---|---|",
    ...top.map(([k, n]) => {
      const b = example(k);
      const d = (b?.description ?? "").replace(/\s+/g, " ").replace(/\|/g, "\\|").slice(0, 140);
      return `| ${n} | \`${k}\` | ${(b?.title ?? "").replace(/\|/g, "\\|").slice(0, 60)} → ${d} |`;
    }),
    "",
  ].join("\n");
  writeFileSync(SUMMARY, md);
  console.log(`${rows.length} books → ${OUT}; summary → ${SUMMARY}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

export {};
