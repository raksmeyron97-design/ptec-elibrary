/* eslint-disable @next/next/no-img-element */
// app/admin/catalogs/page.tsx
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";

import type { CatalogBook } from "@/lib/catalog";
import {
  computeCopyStats,
  getCatalogAvailability,
  AVAILABILITY_ADMIN_LABEL,
  AVAILABILITY_TONE,
  TONE_DOT,
  CATALOG_SCAN_CAP,
} from "@/lib/catalog";
import { pagedScan } from "@/lib/db/paged-scan";
import CatalogAdminActions from "./_components/CatalogAdminActions";
import CsvImportWizard from "./import/CsvImportWizard";
import AdminCatalogToolbar from "./_components/AdminCatalogToolbar";
import Pagination from "@/components/ui/core/Pagination";
import AdminCoverThumb from "@/components/admin/catalogs/AdminCoverThumb";
import { requireRouteAccess } from "@/lib/admin/route-guard";
import { kohaOwnsLinkedRecords } from "@/lib/koha/catalog-writes";
import { kohaReadsPatrons } from "@/lib/koha/patron-server";
import { getTranslations } from "next-intl/server";
import { catalogReviewEnabled } from "@/lib/catalogs/review-flag";
import { loadReviewRows, openTaskCounts } from "@/lib/catalogs/review-server";
import { REVIEW_QUEUES, reviewCounts, reviewListHref, reviewQueueOf, reviewRecordHref, DEFAULT_REVIEW_QUERY, statusOf } from "@/lib/catalogs/review";
import { REVIEW_TASK_IDS, openTasks } from "@/lib/catalogs/review-tasks";
import { copyLocations, unshelvedCount } from "@/lib/catalogs/copy-location";
import { Badge } from "@/components/admin/kit";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

type SP = {
  q?: string;
  page?: string;
  sort?: string;   // newest | oldest | title | author | category | available
  cat?: string;
  dept?: string;
  status?: string; // active | deleted | ""
  cover?: string;  // has | missing | ""
};

type BookWithCopies = CatalogBook & {
  catalog_copies: { status: string | null; shelf_location: string | null; holding_library: string | null }[];
};

const TONE_TEXT: Record<string, string> = {
  positive: "text-emerald-600",
  warning:  "text-amber-600",
  danger:   "text-red-500",
  info:     "text-sky-600",
  neutral:  "text-text-muted",
};

export default async function AdminCatalogsPage({
  searchParams,
}: {
  searchParams?: Promise<SP>;
}) {
  /* READ — the physical collection is browsable by anyone with `catalog: read`.
     Creating, importing and editing are separate write routes. */
  const { can } = await requireRouteAccess("catalog.manage");
  const canCreate = can("catalog.create");
  const kohaOn = kohaOwnsLinkedRecords();

  /* The physical collection reads through the service client, so this guard is
     the whole access control for the route — there was none, and the sidebar's
     `catalog` gate was the only thing standing in front of it. */

  const sp = (await searchParams) ?? {};
  const supabase = createServiceClient();

  const page   = Math.max(1, Number(sp.page ?? "1") || 1);
  const q      = (sp.q ?? "").trim();
  const cat    = sp.cat ?? "";
  const dept   = sp.dept ?? "";
  const status = sp.status ?? "";
  const cover  = sp.cover ?? "";
  const sort   = sp.sort ?? "newest";

  const from = (page - 1) * PAGE_SIZE;
  const to   = from + PAGE_SIZE - 1;

  // ── Page query (search / filter / sort / paginate — all in DB) ──
  let query = supabase
    .from("catalog_books")
    .select("*, catalog_copies(status, shelf_location, holding_library)", { count: "exact" });

  if (q) {
    // `.or()` is comma-separated, so strip chars that would break the filter string.
    const safe = q.replace(/[,()]/g, " ").trim();
    query = query.or(
      [
        `title.ilike.%${safe}%`,
        `author.ilike.%${safe}%`,
        `isbn.ilike.%${safe}%`,
        `category.ilike.%${safe}%`,
        `department.ilike.%${safe}%`,
        `ddc.ilike.%${safe}%`,
        `shelf_location.ilike.%${safe}%`,
        `accession_number.ilike.%${safe}%`,
      ].join(",")
    );
  }
  if (cat)  query = query.eq("category", cat);
  if (dept) query = query.eq("department", dept);
  if (status === "active")  query = query.eq("is_active", true);
  if (status === "deleted") query = query.eq("is_active", false);
  if (cover === "has")     query = query.not("cover_url", "is", null);
  if (cover === "missing") query = query.is("cover_url", null);

  switch (sort) {
    case "oldest":
      query = query.order("created_at", { ascending: true });
      break;
    case "title":
      query = query.order("title", { ascending: true });
      break;
    case "author":
      query = query.order("author", { ascending: true });
      break;
    case "category":
      query = query
        .order("category", { ascending: true, nullsFirst: false })
        .order("title", { ascending: true });
      break;
    case "ddc":
      query = query
        .order("ddc", { ascending: true, nullsFirst: false })
        .order("title", { ascending: true });
      break;
    case "available":
      query = query.order("copies_available", { ascending: false });
      break;
    case "newest":
    default:
      query = query.order("created_at", { ascending: false });
      break;
  }

  // Stable tie-breaker, then paginate.
  query = query.order("id", { ascending: true }).range(from, to);

  const { data: books, count } = await query;
  const pageBooks = (books ?? []) as BookWithCopies[];

  // ── Meta query: stats + filter options over the WHOLE collection ──
  // Paged: a one-shot select is clipped at 1,000 records, so every figure
  // below described an arbitrary 1,000 once the PMB import landed. A read that
  // fails or is cut short renders "—", never a count of what it happened to get.
  const metaScan = await pagedScan<{
    id: string;
    title: string | null;
    author: string | null;
    language: string | null;
    category: string | null;
    department: string | null;
    ddc: string | null;
    shelf_location: string | null;
    publisher: string | null;
    description: string | null;
    is_active: boolean;
    isbn: string | null;
    year: number | null;
    cover_url: string | null;
    catalog_copies: { status: string | null; shelf_location: string | null }[];
  }>(
    (from, to) =>
      supabase
        .from("catalog_books")
        // The review's task fields ride on the same scan (no second read): the
        // overview's work figures and the Review column are derived from it.
        .select("id, title, author, language, category, department, ddc, shelf_location, publisher, description, is_active, isbn, year, cover_url, catalog_copies(status, shelf_location)")
        .order("id", { ascending: true })
        .range(from, to),
    CATALOG_SCAN_CAP,
  );
  const metaUnavailable = Boolean(metaScan.error) || metaScan.truncated;
  if (metaScan.error) console.error("[admin/catalogs] collection stats read failed:", metaScan.error.message);
  const meta = metaUnavailable ? [] : metaScan.data;

  const categories = Array.from(
    new Set(meta.map((m) => m.category).filter(Boolean) as string[])
  ).sort();
  const departments = Array.from(
    new Set(meta.map((m) => m.department).filter(Boolean) as string[])
  ).sort();

  const activeMeta = meta.filter((m) => m.is_active);
  const allStats   = activeMeta.map((m) => computeCopyStats(m.catalog_copies));
  const totalCopies   = allStats.reduce((s, st) => s + st.total, 0);
  const availCopies   = allStats.reduce((s, st) => s + st.available, 0);
  const onLoanCopies  = allStats.reduce((s, st) => s + st.onLoan + st.reserved, 0);
  const problemCopies = allStats.reduce((s, st) => s + st.unavailable, 0);

  const noCopyBooks    = allStats.filter((st) => st.total === 0).length;
  const missingMeta    = activeMeta.filter((m) => !m.isbn || !m.year || !m.category).length;
  const missingCovers  = activeMeta.filter((m) => !m.cover_url).length;
  const unlistedBooks  = meta.length - activeMeta.length;

  // Librarian review (docs/CATALOG-REVIEW.md), behind CATALOG_REVIEW. The
  // per-language counts come from the scan above plus the review rows — no
  // second read of the catalogue. Unknown renders as unknown, never as zero.
  const reviewOn = catalogReviewEnabled();
  const tr = reviewOn ? await getTranslations("adminCatalog.review") : null;
  const reviewRows = reviewOn && !metaUnavailable ? await loadReviewRows(supabase) : null;
  const review = reviewRows?.ok ? reviewCounts(meta, reviewRows.rows) : null;
  const work = reviewRows?.ok ? openTaskCounts(meta, reviewRows.rows) : null;
  const tl = await getTranslations("adminCatalog.list");

  const totalItems = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  const attention: { label: string; value: number; href?: string }[] = [
    { label: "records without copies", value: noCopyBooks },
    { label: "missing ISBN / year / category", value: missingMeta },
    { label: "using a generated cover", value: missingCovers, href: "/admin/catalogs?cover=missing" },
    { label: "unlisted", value: unlistedBooks, href: "/admin/catalogs?status=deleted" },
    { label: "copies damaged / lost / missing", value: problemCopies },
  ].filter((a) => !metaUnavailable && a.value > 0);

  return (
    <div className="w-full space-y-6">
      {/* Koha sync opens on the same `catalog: read` as this page (it shows
          state; starting a run is a write the page itself gates). Bulk CSV
          import and "Add Book" both end in `catalog: write` actions. */}
      <div className="mb-6 flex flex-wrap justify-end gap-3">
        <Link
          href="/admin/catalogs/koha-sync"
          className="focus-field inline-flex h-10 items-center gap-2 rounded-lg border border-divider bg-bg-surface px-4 text-sm font-semibold text-text-body shadow-sm transition hover:bg-paper"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path d="M21 12a9 9 0 0 1-15.5 6.2M3 12a9 9 0 0 1 15.5-6.2M18.5 2v4h-4M5.5 22v-4h4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Koha sync
        </Link>
        {canCreate && kohaReadsPatrons() && (
          <Link
            href="/admin/catalogs/library-cards"
            className="focus-field inline-flex h-10 items-center gap-2 rounded-lg border border-divider bg-bg-surface px-4 text-sm font-semibold text-text-body shadow-sm transition hover:bg-paper"
          >
            Library cards
          </Link>
        )}
        {canCreate && (
          <>
            <CsvImportWizard />
            <Link
              href="/admin/catalogs/add"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-white transition hover:bg-brand-hover"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
              Add Book
            </Link>
          </>
        )}
      </div>

      {/* ── Librarian review: one card per language queue ── */}
      {reviewOn && tr && (
        <section aria-labelledby="catalog-review-heading" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="catalog-review-heading" className="text-sm font-bold uppercase tracking-wider text-text-muted">{tr("overviewHeading")}</h2>
            <Link href="/admin/catalogs/review" className="text-xs font-semibold text-admin-accent-text hover:underline">{tr("overviewAll")}</Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {REVIEW_QUEUES.map((queue) => {
              const c = review?.[queue];
              return (
                <div key={queue} className="rounded-xl border border-divider bg-bg-surface p-4 shadow-sm">
                  <p className="text-xs font-semibold text-text-muted">{tr(`queue.${queue}`)}</p>
                  {c ? (
                    <>
                      <p className="mt-1 text-sm text-text-body">
                        {tr("cardTotal", { count: c.total })} · <span className="font-semibold text-text-heading">{tr("cardNeedsReview", { count: c.needsReview })}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-text-muted">{tr("cardBreakdown", { inReview: c.inReview, verified: c.verified, blocked: c.blocked })}</p>
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-text-muted">{tr("countsUnavailable")}</p>
                  )}
                  <Link
                    href={reviewListHref({ ...DEFAULT_REVIEW_QUERY, language: queue })}
                    className="focus-field mt-3 inline-flex h-10 items-center rounded-lg border border-divider bg-bg-surface px-4 text-sm font-semibold text-text-body hover:bg-paper"
                  >
                    {tr(`open.${queue}`)}
                  </Link>
                </div>
              );
            })}
          </div>
          {review && review.noLanguage > 0 && (
            <p role="status" className="text-xs text-warning-text">{tr("noLanguage", { count: review.noLanguage })}</p>
          )}

          {/* Work, not inventory: open tasks per queue, each a link into that
              queue filtered to that task. Waived tasks are not open. */}
          {work && (
            <div className="overflow-x-auto rounded-xl border border-divider bg-bg-surface shadow-sm">
              <table className="w-full text-sm">
                <caption className="px-4 pt-3 text-left text-xs font-bold uppercase tracking-wider text-text-muted">{tl("workHeading")}</caption>
                <thead>
                  <tr className="border-b border-divider text-left">
                    <th scope="col" className="px-4 py-2 text-xs font-semibold text-text-muted">{tl("workTask")}</th>
                    {REVIEW_QUEUES.map((queue) => (
                      <th key={queue} scope="col" className="px-4 py-2 text-right text-xs font-semibold text-text-muted">{tr(`queue.${queue}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-divider">
                  {REVIEW_TASK_IDS.filter((id) => REVIEW_QUEUES.some((queue) => work.counts[queue][id])).map((id) => (
                    <tr key={id}>
                      <th scope="row" className="px-4 py-2 text-left font-medium text-text-body">{tr(`task.${id}`)}</th>
                      {REVIEW_QUEUES.map((queue) => {
                        const n = work.counts[queue][id] ?? 0;
                        return (
                          <td key={queue} className="px-4 py-2 text-right tabular-nums">
                            {n ? (
                              <Link
                                href={reviewListHref({ ...DEFAULT_REVIEW_QUERY, language: queue, task: id })}
                                className="font-semibold text-admin-accent-text hover:underline"
                                aria-label={tl("workLinkAria", { count: n, task: tr(`task.${id}`), queue: tr(`queue.${queue}`) })}
                              >
                                {n.toLocaleString("en")}
                              </Link>
                            ) : (
                              <span className="text-text-muted">0</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ── Stats row (always reflects ALL active books, derived from copy rows) ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Listed Books",     value: activeMeta.length },
          { label: "Total Copies",     value: totalCopies },
          { label: "Available Copies", value: availCopies,  color: "text-emerald-600" },
          { label: "On Loan / Reserved", value: onLoanCopies, color: "text-amber-500" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-divider bg-bg-surface p-4 shadow-sm">
            <p className="text-xs font-medium text-text-muted">{label}</p>
            <p className={`mt-1 text-2xl font-bold ${metaUnavailable ? "text-text-muted" : color ?? "text-text-heading"}`}>
              {metaUnavailable ? "—" : value}
            </p>
          </div>
        ))}
      </div>
      {metaUnavailable && (
        <p role="status" className="text-xs text-text-muted">
          Collection statistics could not be loaded — the figures above are unknown, not zero. The list below is unaffected.
        </p>
      )}

      {/* ── Needs attention ── */}
      {attention.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-2.5 dark:border-amber-500/25 dark:bg-amber-500/5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Needs attention</span>
          {attention.map((a) =>
            a.href ? (
              <Link key={a.label} href={a.href} className="rounded-full border border-amber-200 bg-bg-surface px-2.5 py-0.5 text-[11px] font-semibold text-text-body transition hover:border-amber-400">
                <span className="font-bold text-amber-700">{a.value}</span> {a.label}
              </Link>
            ) : (
              <span key={a.label} className="rounded-full border border-amber-200 bg-bg-surface px-2.5 py-0.5 text-[11px] font-semibold text-text-body">
                <span className="font-bold text-amber-700">{a.value}</span> {a.label}
              </span>
            )
          )}
        </div>
      )}

      {/* ── Toolbar: search + sort + filters ── */}
      <AdminCatalogToolbar
        categories={categories}
        departments={departments}
        filters={{ q, cat, dept, status, cover, sort }}
        totalItems={totalItems}
      />

      {/* ── Table ── */}
      <div className="overflow-hidden rounded-xl border border-divider bg-bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{tl("caption")}</caption>
            <thead>
              <tr className="border-b border-divider bg-paper/60 text-left">
                <th scope="col" className="w-16 px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-text-muted">{tl("colCover")}</th>
                {/* "Call number", not "DDC": for a Koha record the column holds the
                    best copy's call number (lib/koha/projection.ts). "Location" is
                    the copies' Koha shelves — the book-level field Koha never
                    syncs is not shown as if it were the shelf. */}
                {[
                  tl("colBook"),
                  tl("colCategory"),
                  tl("colCallNumber"),
                  tl("colLocation"),
                  tl("colAvailability"),
                  tl("colCopies"),
                  ...(work ? [tl("colReview")] : []),
                  tl("colActions"),
                ].map((h) => (
                  <th key={h} scope="col" className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {pageBooks.length === 0 ? (
                <tr>
                  <td colSpan={work ? 9 : 8} className="px-4 py-16 text-center text-text-muted">
                    {q
                      ? <>No books matched <span className="font-semibold text-text-muted">&ldquo;{q}&rdquo;</span>. Try a different search.</>
                      : <>No books yet. Click &ldquo;Add Book&rdquo; or import CSV to get started.</>}
                  </td>
                </tr>
              ) : pageBooks.map((book) => {
                const stats = computeCopyStats(book.catalog_copies);
                const availability = getCatalogAvailability(stats);
                const tone = AVAILABILITY_TONE[availability];
                return (
                  <tr key={book.id} className={`transition hover:bg-paper/50 ${!book.is_active ? "opacity-40" : ""}`}>
                    {/* Cover — generated fallback shown as readers see it,
                        with admin-only Generated / Broken URL tags */}
                    <td className="px-4 py-3 text-center">
                      <AdminCoverThumb
                        coverUrl={book.cover_url}
                        title={book.title}
                        category={book.category}
                        seed={book.slug}
                      />
                    </td>
                    {/* Title */}
                    <td className="max-w-[240px] px-4 py-3">
                      <p className="truncate font-semibold text-text-heading">{book.title}</p>
                      <p className="truncate text-xs text-text-muted">{book.author}</p>
                      {book.isbn && <p className="font-mono text-[10px] text-text-muted">{book.isbn}</p>}
                      {!book.is_active && (
                        <span className="text-[10px] font-bold text-red-400">UNLISTED</span>
                      )}
                    </td>
                    {/* Category */}
                    <td className="whitespace-nowrap px-4 py-3 text-text-muted">
                      {book.category ?? <span className="text-text-muted">—</span>}
                    </td>
                    {/* Call number (catalog_books.ddc — Koha's best copy call number) */}
                    <td className="whitespace-nowrap px-4 py-3">
                      {book.ddc
                        ? <span className="font-mono text-xs text-text-body">{book.ddc}</span>
                        : <span className="text-text-muted">—</span>}
                    </td>
                    {/* Location — from the copies, as Koha holds them */}
                    <td className="px-4 py-3 text-xs">
                      {(() => {
                        const groups = copyLocations(book.catalog_copies);
                        if (groups.length === 0) return <span className="text-text-muted">{tl("noCopies")}</span>;
                        const shelved = groups.filter((g) => g.shelf !== null).slice(0, 2);
                        const unshelved = unshelvedCount(groups);
                        return (
                          <div className="space-y-0.5">
                            {shelved.map((g) => (
                              <p key={`${g.library}|${g.shelf}`} className="whitespace-nowrap text-text-body">
                                {g.library ? `${g.library} · ` : ""}<span className="font-mono">{g.shelf}</span> ×{g.count}
                              </p>
                            ))}
                            {unshelvedCount(groups) > 0 && (
                              <p className="whitespace-nowrap text-text-muted">{tl("noShelf", { count: unshelved })}</p>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    {/* Availability */}
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${TONE_TEXT[tone]}`}>
                        <span aria-hidden className={`h-2 w-2 rounded-full ${TONE_DOT[tone]}`} />
                        {AVAILABILITY_ADMIN_LABEL[availability]}
                      </span>
                    </td>
                    {/* Copies */}
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`font-bold ${TONE_TEXT[tone]}`}>{stats.available}</span>
                      <span className="text-text-muted">/{stats.total}</span>
                    </td>
                    {/* Review — status and open tasks, a link into the queue */}
                    {work && tr && (
                      <td className="whitespace-nowrap px-4 py-3 text-xs">
                        {(() => {
                          const status = statusOf(reviewRows?.ok ? reviewRows.rows.get(book.id) ?? null : null);
                          const open = openTasks(work.tasksById.get(book.id) ?? []).length;
                          const queue = reviewQueueOf(book.language);
                          const badge = <Badge tone={status === "verified" ? "success" : status === "blocked" ? "danger" : status === "in_review" ? "info" : "warning"}>{tr(`status.${status}`)}</Badge>;
                          return (
                            <div className="space-y-1">
                              {queue ? <Link href={reviewRecordHref(book.id, { ...DEFAULT_REVIEW_QUERY, language: queue })}>{badge}</Link> : badge}
                              <p className="text-text-muted">{open ? tr("needsTasks", { count: open }) : tr("noOpenTasks")}</p>
                            </div>
                          );
                        })()}
                      </td>
                    )}
                    {/* Actions */}
                    <td className="px-4 py-3">
                      <CatalogAdminActions book={book} copyCount={stats.total} kohaOwned={kohaOn && book.koha_biblio_id != null} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Pagination ── */}
      <Pagination
        currentPage={page}
        totalPages={totalPages}
        totalItems={totalItems}
        pageSize={PAGE_SIZE}
        searchParams={sp as Record<string, string | undefined>}
        basePath="/admin/catalogs"
      />
    </div>
  );
}
