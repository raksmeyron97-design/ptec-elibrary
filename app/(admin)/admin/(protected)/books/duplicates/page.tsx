import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ShieldCheck, SearchX } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/requireAdmin";
import { findDuplicateGroups, type DuplicateBook } from "@/lib/admin/duplicates";
import {
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

// Duplicate review workspace. Detection is read-only and happens here; the
// retire action (app/actions/duplicates.ts) is the only thing that writes, and
// it archives + 301s rather than deleting or merging.
export const dynamic = "force-dynamic";

const BASE_PATH = EBOOKS_DUPLICATES_PATH;
const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZES = [10, 25, 50];

type SP = {
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
 * One query, one pass.
 *
 * Detection is a whole-collection problem — a duplicate is only visible when
 * both records are in the same set — so the candidate pool is every PUBLISHED
 * book, joined to its author and its first file row. Union-find grouping is
 * near-linear in the pool size and runs on the server; only the current page
 * of groups is ever serialized to the browser.
 *
 * Scale note: this is comfortable for a collection in the low thousands. Past
 * roughly 10k published books the fetch, not the grouping, becomes the cost,
 * and the answer is database-assisted candidate generation (bucket by ISBN /
 * content hash / normalized title in SQL, then score the candidates with the
 * same pure module) — NOT reimplementing the scoring rules as a query.
 */
async function loadDuplicateBooks(): Promise<{ books: DuplicateBook[]; covers: Map<string, string | null> }> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("books")
    .select(
      "id, slug, title, isbn, published_at, created_at, pages, cover_url, is_published, authors(name), book_files(file_size_kb, content_hash)",
    )
    .eq("is_published", true)
    .order("created_at", { ascending: true });

  const rows = (data ?? []) as unknown as BookRow[];
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

  return { books, covers };
}

export default async function DuplicatesPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePermission("books", "write");

  const [sp, t, locale, { books, covers }] = await Promise.all([
    searchParams,
    getTranslations("adminDuplicates"),
    getLocale(),
    loadDuplicateBooks(),
  ]);

  const allGroups = findDuplicateGroups(books);
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
    confidence: group.confidence,
    signals: orderSignals(group.signals),
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

      {summary.groups === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="h-6 w-6 text-success" />}
          title={t("empty.title")}
          description={t("empty.description")}
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
