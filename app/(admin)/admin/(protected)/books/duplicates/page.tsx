import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ShieldCheck, SearchX, AlertTriangle } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";
import { pagedScan } from "@/lib/admin/paged-scan";
import { duplicateGroupFingerprint } from "@/lib/admin/duplicate-dismissal";

import { findDuplicateGroups, type DuplicateBook } from "@/lib/admin/duplicates";
import {
  compareDuplicateGroup,
  filterDuplicateGroups,
  orderSignals,
  parseConfidence,
  parseSignal,
  parseSort,
  sortDuplicateGroups,
  summarizeDuplicateGroups,
} from "@/lib/admin/duplicate-review";
import { PageHeader, EmptyState } from "@/components/admin/kit";
import Pagination from "@/components/ui/core/Pagination";
import BooksBreadcrumb from "@/components/admin/ebooks/BooksBreadcrumb";
import BooksWorkspaceNav from "@/components/admin/ebooks/BooksWorkspaceNav";
import { EBOOKS_DUPLICATES_PATH } from "@/lib/admin/ebooks-url";
import DuplicateSummary from "./_components/DuplicateSummary";
import DuplicateFilters from "./_components/DuplicateFilters";
import DuplicateGroupCard, { type UIGroup } from "./_components/DuplicateGroupCard";
import RefreshButton from "./_components/RefreshButton";
import DismissedGroups, { type UIDismissal } from "./_components/DismissedGroups";
import QueueViewTabs from "./_components/QueueViewTabs";
import { requireRouteAccess } from "@/lib/admin/route-guard";

// Duplicate review workspace. Detection is read-only and happens here; the
// retire action (app/actions/duplicates.ts) is the only thing that writes, and
// it archives + 301s rather than deleting or merging.
export const dynamic = "force-dynamic";

const BASE_PATH = EBOOKS_DUPLICATES_PATH;
const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZES = [10, 25, 50];
// Ceiling on how far the scan will page. Not a per-request limit — PostgREST
// ignores those above db-max-rows; see lib/admin/paged-scan.ts.
const DETECTION_SCAN_CAP = 20_000;

type SP = {
  view?: string;
  q?: string;
  confidence?: string;
  signal?: string;
  sort?: string;
  page?: string;
  size?: string;
};

type BookRow = {
  id: string;
  slug: string;
  title: string;
  isbn: string | null;
  published_at: string | null;
  created_at: string | null;
  pages: number | null;
  cover_url: string | null;
  is_published: boolean;
  authors: { name: string | null } | null;
  book_files: { file_size_kb: number | null; content_hash: string | null }[] | null;
};

/**
 * One SCAN, one pass.
 *
 * Detection is a whole-collection problem — a duplicate is only visible when
 * both records are in the same set — so the candidate pool is every PUBLISHED
 * book, joined to its author and its first file row. Union-find grouping is
 * near-linear in the pool size and runs on the server; only the current page
 * of groups is ever serialized to the browser.
 *
 * It PAGES, and that is the whole point. PostgREST clips every response at
 * db-max-rows (1000 here) whatever the request asks for, silently and with no
 * error — so a one-shot select handed this detector the OLDEST 1000 books of a
 * 1,956-book library and the newest 956 were invisible to it. Measured against
 * production on 2026-09-22: 10 groups found, 73 groups actually present, and
 * every one of the 63 missing groups sat in the bulk import that arrived after
 * the cut. A queue that reports "No duplicates found" over a library holding
 * them is worse than no queue.
 *
 * `.order("id")` is load-bearing, not tidiness: Postgres guarantees no row
 * order without a stable sort, so pages may hand the same row to two pages or
 * to neither. It is not the DISPLAY order — groups are ranked by confidence and
 * each group's books by created_at, both after the scan.
 *
 * Scale note: this is comfortable for a collection in the low thousands. Past
 * roughly 10k published books the fetch, not the grouping, becomes the cost,
 * and the answer is database-assisted candidate generation (bucket by ISBN /
 * content hash / normalized title in SQL, then score the candidates with the
 * same pure module) — NOT reimplementing the scoring rules as a query.
 */
async function loadDuplicateBooks(): Promise<{
  books: DuplicateBook[];
  covers: Map<string, string | null>;
  /** True when a page of the scan failed: the pool below is PARTIAL, so an
   *  empty queue means "we could not look", never "the library is clean". */
  incomplete: boolean;
}> {
  const supabase = createServiceClient();
  const { data, error } = await pagedScan<BookRow>(
    (from, to) =>
      supabase
        .from("books")
        .select(
          "id, slug, title, isbn, published_at, created_at, pages, cover_url, is_published, authors(name), book_files(file_size_kb, content_hash)",
        )
        .eq("is_published", true)
        .order("id", { ascending: true })
        .range(from, to),
    DETECTION_SCAN_CAP,
  );

  const rows = data;
  // Covers are presentation only and deliberately kept out of DuplicateBook —
  // nothing the detector sees should be addable for the sake of a thumbnail.
  const covers = new Map<string, string | null>(rows.map((row) => [row.id, row.cover_url]));

  const books = rows.map((row) => {
    const file = row.book_files?.[0] ?? null;
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      isbn: row.isbn,
      year: row.published_at ? new Date(row.published_at).getFullYear() : null,
      author: row.authors?.name ?? null,
      pages: row.pages,
      fileSizeKb: file?.file_size_kb ?? null,
      contentHash: file?.content_hash ?? null,
      createdAt: row.created_at,
    } satisfies DuplicateBook;
  });

  return { books, covers, incomplete: Boolean(error) };
}

type DismissalRow = {
  fingerprint: string;
  book_ids: string[] | null;
  note: string | null;
  dismissed_at: string;
  dismissed_by: string | null;
};

/**
 * PostgREST's two ways of saying "that table is not there": the schema-cache
 * miss and the raw Postgres undefined_table. Either means migration 0153 has
 * not reached this database yet.
 */
const MISSING_TABLE_CODES = new Set(["PGRST205", "PGRST106", "42P01"]);

/**
 * Groups a librarian has already judged not to be duplicates (0153).
 *
 * A FAILED read returns no fingerprints, which means every dismissed group
 * comes BACK into the queue — deliberately the safe direction. The opposite
 * default would hide real duplicates because a table was briefly unreachable,
 * and a reviewer would have no way to tell that from an empty queue.
 *
 * A MISSING table is not that failure, and must not wear its warning. The
 * banner exists to say "groups you dismissed are showing again"; where the
 * table has never existed no group was ever dismissed, so there is nothing to
 * be showing again and nothing to warn about. That window is real — the code
 * can reach a database a minute before its migration does — and a warning that
 * appears on every load of a feature nobody has used yet is how the warning
 * that matters stops being read.
 */
async function loadDismissals(): Promise<{ rows: DismissalRow[]; unavailable: boolean }> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("duplicate_dismissals")
    .select("fingerprint, book_ids, note, dismissed_at, dismissed_by")
    .order("dismissed_at", { ascending: false })
    .limit(500);
  if (error) return { rows: [], unavailable: !MISSING_TABLE_CODES.has(error.code) };
  return { rows: (data ?? []) as DismissalRow[], unavailable: false };
}

export default async function DuplicatesPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireRouteAccess("books.duplicates");

  const [sp, t, locale, { books, covers, incomplete }, dismissals] = await Promise.all([
    searchParams,
    getTranslations("adminDuplicates"),
    getLocale(),
    loadDuplicateBooks(),
    loadDismissals(),
  ]);

  // Detection runs over the whole collection first; dismissal is applied AFTER,
  // so the fingerprint is always computed from the group the detector actually
  // produced and a dismissed group can be listed back with its real membership.
  const detected = findDuplicateGroups(books).map((group) => ({
    group,
    fingerprint: duplicateGroupFingerprint(group.books.map((book) => book.id)),
  }));
  const dismissedFingerprints = new Set(dismissals.rows.map((row) => row.fingerprint));
  const live = detected.filter((entry) => !dismissedFingerprints.has(entry.fingerprint));

  const view = sp.view === "dismissed" ? "dismissed" : "queue";
  const allGroups = live.map((entry) => entry.group);
  const fingerprintOf = new Map(live.map((entry) => [entry.group.key, entry.fingerprint]));
  const summary = summarizeDuplicateGroups(allGroups);

  // ── URL state ───────────────────────────────────────────────────────────
  const search = (sp.q ?? "").slice(0, 120);
  const confidence = parseConfidence(sp.confidence);
  const signal = parseSignal(sp.signal);
  const sort = parseSort(sp.sort);
  const pageSize = PAGE_SIZES.includes(Number(sp.size)) ? Number(sp.size) : DEFAULT_PAGE_SIZE;

  const filtered = sortDuplicateGroups(
    filterDuplicateGroups(allGroups, { search, confidence, signal }),
    sort,
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  // Clamp rather than 404: narrowing a filter can shrink the set under the
  // page number already in the URL, and an empty page there looks like the
  // queue was cleared.
  const page = Math.min(Math.max(1, Number(sp.page ?? "1") || 1), totalPages);
  const pageGroups = filtered.slice((page - 1) * pageSize, page * pageSize);

  const dateFormat = new Intl.DateTimeFormat(locale === "km" ? "km-KH" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const formatCreated = (iso: string | null): string | null => {
    if (!iso) return null;
    const value = new Date(iso);
    return Number.isNaN(value.getTime()) ? null : dateFormat.format(value);
  };

  const uiGroups: UIGroup[] = pageGroups.map((group) => ({
    key: group.key,
    fingerprint: fingerprintOf.get(group.key) ?? "",
    confidence: group.confidence,
    signals: orderSignals(group.signals),
    // Computed once per group on the server: the client is handed the verdict
    // of the comparison, never the raw rows to re-derive it from.
    comparison: compareDuplicateGroup(group.books),
    books: group.books.map((book) => ({
      id: book.id,
      slug: book.slug,
      title: book.title,
      isbn: book.isbn,
      year: book.year,
      author: book.author,
      pages: book.pages,
      fileSizeKb: book.fileSizeKb,
      coverUrl: covers.get(book.id) ?? null,
      hasHash: Boolean(book.contentHash),
      createdLabel: formatCreated(book.createdAt),
    })),
  }));

  // The restore list names the books by the titles they had when the group was
  // dismissed — or says the record is gone, which is itself the answer to "why
  // is this not in my queue any more".
  const titleById = new Map(books.map((book) => [book.id, book.title]));
  const uiDismissals: UIDismissal[] = dismissals.rows.map((row) => ({
    fingerprint: row.fingerprint,
    dismissedLabel: formatCreated(row.dismissed_at),
    note: row.note,
    books: (row.book_ids ?? []).map((id) => ({ id, title: titleById.get(id) ?? null })),
  }));

  const searchParamsRecord = sp as Record<string, string | undefined>;

  return (
    <div className="w-full space-y-6">
      <PageHeader
        breadcrumb={<BooksBreadcrumb current={t("title")} />}
        title={t("title")}
        description={t("description")}
        actions={<RefreshButton />}
        className="mb-4"
      />

      {/* Same strip, same position, as the collection and upload pages. It
          replaces the lone "← Manage E-books" link this page used to carry. */}
      <BooksWorkspaceNav current="duplicates" duplicateCount={summary.groups} />

      {/* A partial scan may not claim a clean library. The pool is whatever the
          failing page left behind, so any group shown is real but the absence
          of one says nothing. */}
      {incomplete && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-warning-line bg-warning-soft px-4 py-3 text-sm leading-6 text-warning-text"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{t("incomplete")}</p>
        </div>
      )}

      {/* A dismissal read that failed means every dismissed group is back in
          this queue. That is the safe direction — the alternative hides real
          duplicates behind an outage — but it must be SAID, or a reviewer sees
          groups they have already cleared and concludes the button does not
          work. */}
      {dismissals.unavailable && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-warning-line bg-warning-soft px-4 py-3 text-sm leading-6 text-warning-text"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{t("dismissals.unavailable")}</p>
        </div>
      )}

      {/* Two views over one scan. The dismissed list is not a filter of the
          queue — a dismissed group is, by definition, absent from it — so it
          gets its own switch rather than a fourth confidence chip. */}
      <QueueViewTabs
        basePath={BASE_PATH}
        view={view}
        queueCount={summary.groups}
        dismissedCount={uiDismissals.length}
      />

      {view === "dismissed" ? (
        <DismissedGroups dismissals={uiDismissals} unavailable={dismissals.unavailable} />
      ) : summary.groups === 0 ? (
        <EmptyState
          icon={
            incomplete ? (
              <AlertTriangle className="h-6 w-6 text-warning" />
            ) : (
              <ShieldCheck className="h-6 w-6 text-success" />
            )
          }
          title={incomplete ? t("scanFailed.title") : t("empty.title")}
          description={incomplete ? t("scanFailed.description") : t("empty.description")}
        />
      ) : (
        <>
          <DuplicateSummary
            summary={summary}
            activeConfidence={confidence}
            basePath={BASE_PATH}
            searchParams={searchParamsRecord}
          />

          <DuplicateFilters
            basePath={BASE_PATH}
            search={search}
            confidence={confidence}
            signal={signal}
            sort={sort}
            shown={filtered.length}
            total={summary.groups}
          />

          {filtered.length === 0 ? (
            <EmptyState
              icon={<SearchX className="h-6 w-6" />}
              title={t("noResults.title")}
              description={t("noResults.description", { total: summary.groups })}
              action={
                <Link
                  href={BASE_PATH}
                  className="focus-field inline-flex items-center rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-contrast transition hover:bg-brand-hover"
                >
                  {t("noResults.action")}
                </Link>
              }
            />
          ) : (
            <div className="space-y-4">
              {uiGroups.map((group) => (
                <DuplicateGroupCard key={group.key} group={group} />
              ))}
            </div>
          )}

          {/* Pagination carries a rows-per-page selector, so it renders even
              for a single page — but not over an empty result set, where it
              would read "Showing 1–0 of 0". */}
          {filtered.length > 0 && (
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={filtered.length}
              pageSize={pageSize}
              searchParams={searchParamsRecord}
              basePath={BASE_PATH}
              pageSizeOptions={PAGE_SIZES}
            />
          )}
        </>
      )}
    </div>
  );
}
