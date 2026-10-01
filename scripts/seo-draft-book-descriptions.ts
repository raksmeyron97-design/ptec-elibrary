// scripts/seo-draft-book-descriptions.ts
//
//   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
//     npx tsx scripts/seo-draft-book-descriptions.ts --limit 20 [--apply] [--out content/drafts/book-descriptions.json]
//
// SEO Phase 5.3 (F3). OFF BY DEFAULT: without `--limit` it prints this header
// and exits. Rule-built description DRAFTS for the books whose description is
// empty or shared with four or more others, most-viewed first. No model is
// called (D7) and nothing is published: every sentence is a database fact
// plus the chapter headings on the book's own contents page
// (lib/seo/description-draft.ts), and a book with no readable contents page
// gets no draft — it is listed for a librarian instead.
//
// Without `--apply` it reads, one request at a time, and writes the drafts to
// a review file (default content/drafts/book-descriptions.json, every entry
// `needs_review`). With `--apply` it also stores them in the RLS-closed
// `book_description_drafts` table (0164) with `source = 'extracted'` — never
// over an existing draft, and moving `description_status` from 'none' to
// 'draft' only — where they wait in /admin/data-quality/descriptions for a
// librarian to approve. Approval refuses a Khmer draft until its
// TODO(km-review) marker has been removed.
//
// The service-role key is needed because `book_pages` and the drafts table are
// service-role only. Safety rails, all checked before the first read:
//   • a non-local database needs `--confirm-host <host>`;
//   • `--apply` against a non-local database for more than 50 books needs
//     `--approved-over-50` — the programme's "ask first" line;
//   • it prints the request count and an estimate of the time before starting.
// No paid API is used. The extraction (pdftotext / tesseract khm+eng) has
// already been done by the indexer and the Khmer OCR batch, into `book_pages`;
// this reads that table rather than fetching any PDF again.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { composeDescriptionDraft, contentsHeadings, CONTENTS_PAGE_LIMIT } from "../lib/seo/description-draft";
import { clusterSizes, templateKey } from "../lib/seo/description-template";
import { TEMPLATED_CLUSTER_MIN } from "../lib/seo/description-gate";
import { trustedPublicationDate } from "../lib/seo/dates";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const flag = (name: string) => process.argv.includes(name);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const limit = Number(arg("--limit"));
const apply = flag("--apply");
const OUT = arg("--out") ?? "content/drafts/book-descriptions.json";
const DELAY_MS = 300;
const REMOTE_APPLY_MAX = 50;

if (!Number.isInteger(limit) || limit <= 0) {
  console.error("Off by default. Pass --limit N (a positive whole number) to draft the N most-viewed candidates.");
  process.exit(2);
}
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (book_pages and the drafts table are service-role only).");
  process.exit(2);
}
const host = new URL(url).hostname;
const local = /^(localhost|127\.0\.0\.1|::1|\[::1\]|host\.docker\.internal)$/.test(host) || host.endsWith(".local");
if (!local && arg("--confirm-host") !== host) {
  console.error(`${host} is not a local database. Re-run with --confirm-host ${host} if that is intended.`);
  process.exit(2);
}
if (apply && !local && limit > REMOTE_APPLY_MAX && !flag("--approved-over-50")) {
  console.error(`Writing drafts for more than ${REMOTE_APPLY_MAX} books on ${host} needs the owner's approval (--approved-over-50).`);
  process.exit(2);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const headers = { apikey: key, authorization: `Bearer ${key}` };

async function get<T>(pathAndQuery: string, range?: string): Promise<T> {
  await sleep(DELAY_MS);
  const res = await fetch(`${url}/rest/v1/${pathAndQuery}`, { headers: { ...headers, ...(range ? { range } : {}) } });
  if (!res.ok) throw new Error(`${pathAndQuery.split("?")[0]} ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

async function getAll<T>(pathAndQuery: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const page = await get<T[]>(pathAndQuery, `${from}-${from + 999}`);
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

async function write(method: "POST" | "PATCH", pathAndQuery: string, body: unknown, prefer: string): Promise<unknown[]> {
  await sleep(DELAY_MS);
  const res = await fetch(`${url}/rest/v1/${pathAndQuery}`, {
    method,
    headers: { ...headers, "content-type": "application/json", prefer },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${pathAndQuery.split("?")[0]} ${res.status}: ${await res.text()}`);
  return (await res.json()) as unknown[];
}

type Book = {
  id: string;
  slug: string;
  title: string;
  publisher: string | null;
  language: string | null;
  pages: number | null;
  tags: string[] | null;
  description: string | null;
  description_status: string | null;
  published_at: string | null;
  created_at: string | null;
  view_count: number | null;
  file_access: string | null;
  allow_download: boolean | null;
  categories: { name: string | null; name_en: string | null } | null;
  authors: { name: string | null } | null;
  book_files: { id: string }[] | null;
};

async function main(): Promise<void> {
  console.log(`Target: ${host}${local ? " (local)" : ""} · mode: ${apply ? "APPLY (drafts table only)" : "dry run (review file only)"}`);
  const books = await getAll<Book>(
    "books?select=id,slug,title,publisher,language,pages,tags,description,description_status,published_at,created_at," +
      "view_count,file_access,allow_download,categories(name,name_en),authors(name),book_files(id)&is_published=eq.true&order=id.asc",
  );
  const keys = books.map((b) =>
    templateKey(b.description?.trim() ?? "", { title: b.title, subject: b.categories?.name ?? null, author: b.authors?.name ?? null }),
  );
  const sizes = clusterSizes(keys);
  const candidates = books
    .map((b, i) => ({ b, template: keys[i] }))
    .filter(({ b }) => (b.description_status ?? "none") === "none")
    .filter(({ template }) => template === "empty" || (sizes.get(template) ?? 0) >= TEMPLATED_CLUSTER_MIN)
    .sort((a, c) => (c.b.view_count ?? 0) - (a.b.view_count ?? 0) || a.b.id.localeCompare(c.b.id))
    .slice(0, limit);

  const requests = candidates.length * (apply ? 3 : 1) + Math.ceil(candidates.length / 100) + Math.ceil(books.length / 1000);
  console.log(
    `${books.length} published books; ${candidates.length} candidates (empty or templated, no draft yet). ` +
      `About ${requests} sequential requests, ~${Math.ceil((requests * (DELAY_MS + 250)) / 1000)} s. No paid API.`,
  );

  // In chunks: 100 ids is ~3.7 KB of URL, inside Kong's 8 KB request line.
  const existing = new Set<string>();
  for (let i = 0; i < candidates.length; i += 100) {
    const ids = candidates.slice(i, i + 100).map((c) => c.b.id).join(",");
    for (const r of await get<{ book_id: string }[]>(`book_description_drafts?select=book_id&book_id=in.(${ids})`)) existing.add(r.book_id);
  }

  const entries: Record<string, unknown>[] = [];
  let drafted = 0;
  let stored = 0;
  for (const { b, template } of candidates) {
    if (existing.has(b.id)) {
      entries.push({ slug: b.slug, status: "skipped", reason: "draft_exists" });
      continue;
    }
    const pages = await get<{ page_no: number; content: string }[]>(
      `book_pages?select=page_no,content&record_type=eq.book&record_id=eq.${b.id}&page_no=lte.${CONTENTS_PAGE_LIMIT}&order=page_no.asc`,
    );
    const readable = (b.book_files?.length ?? 0) > 0 && b.file_access !== "catalogue_only";
    const date = trustedPublicationDate(b.published_at, b.created_at);
    const draft = composeDescriptionDraft({
      title: b.title,
      author: b.authors?.name ?? null,
      publisher: b.publisher,
      year: date ? Number(date.slice(0, 4)) : null,
      language: b.language,
      // A page count below a page we hold text for is wrong; say nothing.
      pages: b.pages && b.pages >= Math.max(0, ...pages.map((p) => p.page_no)) ? b.pages : null,
      subject: b.categories?.name ? { name: b.categories.name, nameEn: b.categories.name_en } : null,
      tags: b.tags,
      readable,
      downloadable: readable && b.allow_download !== false,
      headings: contentsHeadings(pages.map((p) => ({ pageNo: p.page_no, content: p.content }))),
    });
    const base = {
      url: `/books/${b.slug}`,
      slug: b.slug,
      title: b.title,
      views: b.view_count ?? 0,
      template_cluster_size: template === "empty" ? 0 : sizes.get(template) ?? 0,
      pages_read: pages.length,
    };
    if (draft.status === "skipped") {
      entries.push({ ...base, status: "skipped", reason: draft.reason, headings: draft.headings });
      continue;
    }
    drafted += 1;
    entries.push({ ...base, status: "needs_review", source: "extracted", locale: draft.locale, words: draft.words, short: draft.short, text: draft.text });
    if (!apply) continue;
    const inserted = await write(
      "POST",
      "book_description_drafts?on_conflict=book_id&select=book_id",
      { book_id: b.id, [draft.locale === "km" ? "draft_km" : "draft_en"]: draft.text, source: "extracted" },
      "resolution=ignore-duplicates,return=representation",
    );
    if (inserted.length === 0) continue; // a draft appeared since the read — never overwritten
    await write("PATCH", `books?id=eq.${b.id}&description_status=eq.none&select=id`, { description_status: "draft" }, "return=representation");
    stored += 1;
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(
    OUT,
    `${JSON.stringify(
      {
        _comment:
          "SEO Phase 5.3 — rule-built description drafts (scripts/seo-draft-book-descriptions.ts). needs_review: nothing here is published. " +
          "Khmer drafts carry TODO(km-review); approval in /admin/data-quality/descriptions refuses them until it is removed.",
        generated: new Date().toISOString().slice(0, 10),
        target: host,
        entries,
      },
      null,
      2,
    )}\n`,
  );
  const skipped = entries.filter((e) => e.status === "skipped");
  const reasons = skipped.reduce<Record<string, number>>((acc, e) => ({ ...acc, [String(e.reason)]: (acc[String(e.reason)] ?? 0) + 1 }), {});
  console.log(
    `${drafted} drafted (${entries.filter((e) => e.short).length} short of 80 words), ${skipped.length} skipped ${JSON.stringify(reasons)}` +
      `${apply ? `, ${stored} stored as drafts` : ""} → ${OUT}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

export {};
