// scripts/seo-cowork-descriptions.ts
//
// Description drafts WRITTEN BY CLAUDE, for the librarians' review queue
// (/admin/data-quality/descriptions). Two halves with a file between them, so
// the writing happens in a supervised session and nothing reaches the
// database that was not checked against what it was written from:
//
//   1. export — the N most-viewed books whose description is empty or a
//      shared template, with no draft yet, and for each its metadata plus the
//      readable text of its front pages (contents page, preface) and three
//      sampled body pages:
//
//        NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
//          npx tsx scripts/seo-cowork-descriptions.ts export --limit 20 \
//            --confirm-host <host> [--out content/drafts/cowork-bundle.json] \
//            [--exclude skipped.json]   (a JSON array of slugs a previous round skipped)
//
//   2. Claude reads the bundle and writes a drafts file:
//        { "bundle": "<bundle.generated>", "drafts": [{ "book_id", "slug", "draft_km", "draft_en"? }] }
//      Khmer always; English as well when the book is English (that is the
//      draft approval publishes). 80–150 words, Khmer numerals in Khmer.
//
//      Check them while writing — offline, no environment needed:
//        npx tsx scripts/seo-cowork-descriptions.ts check --bundle … --drafts …
//
//   3. apply — checks every draft against the bundle (lib/seo/cowork-description.ts:
//      language, length, Khmer digits and orthography, and no number the
//      source material does not contain). Dry run by default: prints the
//      verdicts and writes a review file. With `--apply` it stores the drafts
//      that pass in book_description_drafts with source = 'claude_cowork'
//      (needs migration 0165) and moves description_status 'none' → 'draft':
//
//        … npx tsx scripts/seo-cowork-descriptions.ts apply \
//            --bundle content/drafts/cowork-bundle.json --drafts content/drafts/cowork-drafts.json \
//            --confirm-host <host> [--apply]
//
// Nothing is published. books.description changes only when a librarian
// clicks Approve. Safety rails, checked before anything is written:
//   • a non-local database needs `--confirm-host <host>`, and apply refuses a
//     bundle exported from a different host;
//   • never over an existing draft (insert ignores a conflict), never for a
//     book whose status is no longer 'none' or whose description changed
//     since the export;
//   • more than 50 books on a non-local database needs `--approved-over-50`;
//   • one request at a time, 300 ms apart (production answers 502 under six
//     concurrent requests).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { assessPageText } from "../lib/ai/page-quality";
import { citationLocale } from "../lib/seo/citation";
import { checkCoworkDraft, COWORK_SOURCE, type CoworkBook, type CoworkDraft } from "../lib/seo/cowork-description";
import { contentsHeadings, isContentsPage, CONTENTS_PAGE_LIMIT } from "../lib/seo/description-draft";
import { TEMPLATED_CLUSTER_MIN } from "../lib/seo/description-gate";
import { clusterSizes, templateKey } from "../lib/seo/description-template";
import { trustedPublicationDate } from "../lib/seo/dates";

const command = process.argv[2];
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const flag = (name: string) => process.argv.includes(name);

const DELAY_MS = 300;
const REMOTE_MAX = 50;
/** Front pages kept per book, and characters kept per page. */
const FRONT_PAGES = 8;
const PAGE_CHARS = 1400;
/** Body pages sampled, as fractions of the book. */
const BODY_SAMPLES = [0.2, 0.45, 0.7];

if (command !== "export" && command !== "apply" && command !== "check") {
  console.error("Usage: seo-cowork-descriptions.ts export --limit N … | check --bundle F --drafts F | apply --bundle F --drafts F [--apply] …");
  process.exit(2);
}

// `check` is the writer's loop: the same checks apply runs, on the two files
// alone. No database, no environment, nothing written.
if (command === "check") {
  const bundlePath = arg("--bundle");
  const draftsPath = arg("--drafts");
  if (!bundlePath || !draftsPath) {
    console.error("Pass --bundle <export file> and --drafts <drafts file>.");
    process.exit(2);
  }
  const bundle = JSON.parse(readFileSync(bundlePath, "utf8")) as { generated: string; books: CoworkBook[] };
  const file = JSON.parse(readFileSync(draftsPath, "utf8")) as { bundle?: string; drafts: CoworkDraft[] };
  const books = new Map(bundle.books.map((b) => [b.book_id, b]));
  let refused = file.bundle && file.bundle !== bundle.generated ? 1 : 0;
  if (refused) console.log(`FAIL drafts were written from bundle ${file.bundle}, not ${bundle.generated}`);
  for (const draft of file.drafts) {
    const v = checkCoworkDraft(draft, books);
    if (!v.ok) refused += 1;
    console.log(
      `${v.ok ? "ok  " : "FAIL"} ${draft.slug} km ${v.words.km ?? "-"} / en ${v.words.en ?? "-"} words` +
        `${v.ok ? "" : ` — ${v.problems.map((p) => p.problem + (p.detail ? ` (${p.detail})` : "")).join("; ")}`}`,
    );
  }
  console.log(refused ? `${refused} refused` : `all ${file.drafts.length} pass`);
  process.exit(refused ? 1 : 0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const headers = { apikey: key, authorization: `Bearer ${key}` };

async function get<T>(pathAndQuery: string, range?: string): Promise<T> {
  await sleep(DELAY_MS);
  const res = await fetch(`${url}/rest/v1/${pathAndQuery}`, { headers: { ...headers, ...(range ? { range } : {}) } });
  if (!res.ok) throw new Error(`${pathAndQuery.split("?")[0]} ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

// 250-row pages: a 1,000-row page of books with its embeds hit production's
// statement timeout (57014) on 2026-10-01.
const PAGE_ROWS = 250;

async function getAll<T>(pathAndQuery: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const page = await get<T[]>(pathAndQuery, `${from}-${from + PAGE_ROWS - 1}`);
    rows.push(...page);
    if (page.length < PAGE_ROWS) return rows;
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

function save(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

type BookRow = {
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

type Bundle = { generated: string; target: string; books: CoworkBook[] };

const trim = (text: string) => {
  const flat = text.replace(/\s+/gu, " ").trim();
  return flat.length > PAGE_CHARS ? `${flat.slice(0, PAGE_CHARS)}…` : flat;
};

async function exportBundle(): Promise<void> {
  const limit = Number(arg("--limit"));
  if (!Number.isInteger(limit) || limit <= 0) {
    console.error("Pass --limit N (a positive whole number): the N most-viewed candidates.");
    process.exit(2);
  }
  if (!local && limit > REMOTE_MAX && !flag("--approved-over-50")) {
    console.error(`More than ${REMOTE_MAX} books on ${host} needs the owner's approval (--approved-over-50).`);
    process.exit(2);
  }
  const out = arg("--out") ?? "content/drafts/cowork-bundle.json";
  console.log(`Target: ${host}${local ? " (local)" : ""} · export (read only)`);

  const books = await getAll<BookRow>(
    "books?select=id,slug,title,publisher,language,pages,tags,description,description_status,published_at,created_at," +
      "view_count,file_access,allow_download,categories(name,name_en),authors(name),book_files(id)&is_published=eq.true&order=id.asc",
  );
  // The review page's "templated" rule (data-quality/descriptions/page.tsx).
  const keys = books.map((b) =>
    templateKey(b.description?.trim() ?? "", { title: b.title, subject: b.categories?.name ?? null, author: b.authors?.name ?? null }),
  );
  const sizes = clusterSizes(keys);
  const ranked = books
    .map((b, i) => ({ b, template: keys[i] }))
    .filter(({ b }) => (b.description_status ?? "none") === "none")
    .filter(({ template }) => template === "empty" || (sizes.get(template) ?? 0) >= TEMPLATED_CLUSTER_MIN)
    .sort((a, c) => (c.b.view_count ?? 0) - (a.b.view_count ?? 0) || a.b.id.localeCompare(c.b.id));

  // Books an earlier round looked at and could not describe (not a book, no
  // readable text) have no draft, so without this every export starts with them.
  const excludePath = arg("--exclude");
  const excluded = new Set<string>(
    excludePath ? (JSON.parse(readFileSync(excludePath, "utf8")) as string[]) : [],
  );
  const eligible = ranked.filter(({ b }) => !excluded.has(b.slug));
  if (excluded.size) console.log(`Excluding ${ranked.length - eligible.length} book(s) listed in ${excludePath}.`);

  // Over-read, then drop books that already hold a draft (any source).
  const pool = eligible.slice(0, limit * 2);
  const existing = new Set<string>();
  for (let i = 0; i < pool.length; i += 100) {
    const ids = pool.slice(i, i + 100).map((c) => c.b.id).join(",");
    for (const r of await get<{ book_id: string }[]>(`book_description_drafts?select=book_id&book_id=in.(${ids})`)) existing.add(r.book_id);
  }
  const candidates = pool.filter(({ b }) => !existing.has(b.id)).slice(0, limit);
  console.log(`${books.length} published books; ${ranked.length} empty or templated with status 'none'; exporting ${candidates.length}.`);

  const out_books: CoworkBook[] = [];
  for (const { b } of candidates) {
    const front = await get<{ page_no: number; content: string }[]>(
      `book_pages?select=page_no,content&record_type=eq.book&record_id=eq.${b.id}&page_no=lte.${CONTENTS_PAGE_LIMIT}&order=page_no.asc`,
    );
    const last = await get<{ page_no: number }[]>(
      `book_pages?select=page_no&record_type=eq.book&record_id=eq.${b.id}&order=page_no.desc&limit=1`,
    );
    const maxPage = last[0]?.page_no ?? 0;
    const sampleNos = maxPage > CONTENTS_PAGE_LIMIT + 10 ? [...new Set(BODY_SAMPLES.map((f) => Math.round(maxPage * f)))] : [];
    const body = sampleNos.length
      ? await get<{ page_no: number; content: string }[]>(
          `book_pages?select=page_no,content&record_type=eq.book&record_id=eq.${b.id}&page_no=in.(${sampleNos.join(",")})&order=page_no.asc`,
        )
      : [];

    // Contents pages first (they say what the book covers), then the first
    // readable prose. Unreadable Khmer and near-empty pages are never shown:
    // a description written from broken text repeats the breakage.
    const assessed = front.map((p) => ({ ...p, q: assessPageText(p.content), contents: isContentsPage(p.content) }));
    const usable = assessed.filter((p) => p.q.kind !== "unreadable" && p.q.kind !== "sparse");
    const chosen = [...usable.filter((p) => p.contents), ...usable.filter((p) => !p.contents)]
      .slice(0, FRONT_PAGES)
      .sort((a, c) => a.page_no - c.page_no);
    const bodyUsable = body.map((p) => ({ ...p, q: assessPageText(p.content) })).filter((p) => p.q.kind === "prose");

    const readable = (b.book_files?.length ?? 0) > 0 && b.file_access !== "catalogue_only";
    const date = trustedPublicationDate(b.published_at, b.created_at);
    out_books.push({
      book_id: b.id,
      slug: b.slug,
      title: b.title,
      language: b.language,
      locale: citationLocale(b.language, b.title),
      author: b.authors?.name ?? null,
      publisher: b.publisher,
      year: date ? Number(date.slice(0, 4)) : null,
      // A page count below a page we hold text for is wrong; say nothing.
      pages: b.pages && b.pages >= maxPage ? b.pages : null,
      subject: b.categories?.name ? { name: b.categories.name, name_en: b.categories.name_en } : null,
      tags: b.tags ?? [],
      views: b.view_count ?? 0,
      current_description: b.description,
      readable,
      downloadable: readable && b.allow_download !== false,
      contents_headings: contentsHeadings(front.map((p) => ({ pageNo: p.page_no, content: p.content }))),
      pages_text: [
        ...chosen.map((p) => ({ page: p.page_no, kind: p.contents ? "contents" : p.q.kind, text: trim(p.content) })),
        ...bodyUsable.map((p) => ({ page: p.page_no, kind: "body", text: trim(p.content) })),
      ],
    });
    console.log(`  ${b.slug}: ${front.length} front pages (${chosen.length} kept), ${bodyUsable.length} body samples`);
  }

  const bundle: Bundle & { _comment: string } = {
    _comment:
      "Read-only export for Claude-written description drafts (scripts/seo-cowork-descriptions.ts). " +
      "Contains unpublished page text — keep it out of git and delete it after apply.",
    generated: new Date().toISOString(),
    target: host,
    books: out_books,
  };
  save(out, bundle);
  const thin = out_books.filter((b) => b.pages_text.length === 0).length;
  console.log(`${out_books.length} books → ${out} (${thin} with no readable page text: metadata only).`);
}

async function applyDrafts(): Promise<void> {
  const bundlePath = arg("--bundle");
  const draftsPath = arg("--drafts");
  if (!bundlePath || !draftsPath) {
    console.error("Pass --bundle <export file> and --drafts <drafts file>.");
    process.exit(2);
  }
  const apply = flag("--apply");
  const bundle = JSON.parse(readFileSync(bundlePath, "utf8")) as Bundle;
  const file = JSON.parse(readFileSync(draftsPath, "utf8")) as { bundle?: string; drafts: CoworkDraft[] };
  if (bundle.target !== host) {
    console.error(`The bundle was exported from ${bundle.target}, not ${host}. Book ids are per database.`);
    process.exit(2);
  }
  if (file.bundle && file.bundle !== bundle.generated) {
    console.error(`The drafts were written from bundle ${file.bundle}, not ${bundle.generated}.`);
    process.exit(2);
  }
  if (apply && !local && file.drafts.length > REMOTE_MAX && !flag("--approved-over-50")) {
    console.error(`Writing more than ${REMOTE_MAX} drafts on ${host} needs the owner's approval (--approved-over-50).`);
    process.exit(2);
  }
  console.log(`Target: ${host}${local ? " (local)" : ""} · ${apply ? "APPLY (drafts table only)" : "dry run (nothing written)"}`);

  const books = new Map(bundle.books.map((b) => [b.book_id, b]));
  const results: Record<string, unknown>[] = [];
  let stored = 0;
  for (const draft of file.drafts) {
    const verdict = checkCoworkDraft(draft, books);
    const book = books.get(draft.book_id);
    const entry: Record<string, unknown> = {
      slug: draft.slug,
      title: book?.title,
      locale: verdict.locale,
      words: verdict.words,
      problems: verdict.problems,
      draft_km: draft.draft_km ?? null,
      draft_en: draft.draft_en ?? null,
    };
    results.push(entry);
    const mark = verdict.ok ? "ok  " : "FAIL";
    console.log(
      `${mark} ${draft.slug} [${verdict.locale ?? "?"}] km ${verdict.words.km ?? "-"} / en ${verdict.words.en ?? "-"} words` +
        `${verdict.ok ? "" : ` — ${verdict.problems.map((p) => p.problem + (p.detail ? ` (${p.detail})` : "")).join("; ")}`}`,
    );
    if (!verdict.ok || !apply || !book) {
      entry.status = verdict.ok ? "ready" : "refused";
      continue;
    }

    // The book as it is NOW: a librarian may have acted since the export.
    const [now] = await get<{ description: string | null; description_status: string | null }[]>(
      `books?select=description,description_status&id=eq.${book.book_id}`,
    );
    if (!now) {
      entry.status = "skipped: book no longer exists";
      continue;
    }
    if ((now.description_status ?? "none") !== "none") {
      entry.status = `skipped: status is ${now.description_status}`;
      continue;
    }
    if ((now.description ?? "") !== (book.current_description ?? "")) {
      entry.status = "skipped: description changed since export";
      continue;
    }
    const inserted = await write(
      "POST",
      "book_description_drafts?on_conflict=book_id&select=book_id",
      {
        book_id: book.book_id,
        draft_km: draft.draft_km?.trim() || null,
        draft_en: draft.draft_en?.trim() || null,
        source: COWORK_SOURCE,
      },
      "resolution=ignore-duplicates,return=representation",
    );
    if (inserted.length === 0) {
      entry.status = "skipped: a draft exists (never overwritten)";
      continue;
    }
    await write("PATCH", `books?id=eq.${book.book_id}&description_status=eq.none&select=id`, { description_status: "draft" }, "return=representation");
    entry.status = "stored";
    stored += 1;
  }

  const out = arg("--out") ?? draftsPath.replace(/\.json$/, "") + ".review.json";
  save(out, { generated: new Date().toISOString(), target: host, applied: apply, results });
  const refused = results.filter((r) => r.status === "refused").length;
  console.log(`${results.length} drafts: ${results.length - refused} pass, ${refused} refused${apply ? `, ${stored} stored` : ""} → ${out}`);
  if (refused > 0) process.exitCode = 1;
}

(command === "export" ? exportBundle() : applyDrafts()).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

export {};
