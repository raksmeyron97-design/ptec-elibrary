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
} from "@/lib/catalog";
import CatalogAdminActions from "./CatalogAdminActions";
import CsvImportWizard from "./import/CsvImportWizard";
import AdminCatalogToolbar from "./AdminCatalogToolbar";
import Pagination from "@/components/ui/core/Pagination";
import Icon from "@/components/ui/core/Icon";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

type SP = {
  q?: string;
  page?: string;
  sort?: string;   // newest | oldest | title | author | category | available
  cat?: string;
  dept?: string;
  status?: string; // active | deleted | ""
};

type BookWithCopies = CatalogBook & { catalog_copies: { status: string | null }[] };

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
  const sp = (await searchParams) ?? {};
  const supabase = createServiceClient();

  const page   = Math.max(1, Number(sp.page ?? "1") || 1);
  const q      = (sp.q ?? "").trim();
  const cat    = sp.cat ?? "";
  const dept   = sp.dept ?? "";
  const status = sp.status ?? "";
  const sort   = sp.sort ?? "newest";

  const from = (page - 1) * PAGE_SIZE;
  const to   = from + PAGE_SIZE - 1;

  // ── Page query (search / filter / sort / paginate — all in DB) ──
  let query = supabase
    .from("catalog_books")
    .select("*, catalog_copies(status)", { count: "exact" });

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
        `shelf_location.ilike.%${safe}%`,
        `accession_number.ilike.%${safe}%`,
      ].join(",")
    );
  }
  if (cat)  query = query.eq("category", cat);
  if (dept) query = query.eq("department", dept);
  if (status === "active")  query = query.eq("is_active", true);
  if (status === "deleted") query = query.eq("is_active", false);

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

  // ── Meta query: stats + filter options in ONE read (copy statuses embedded) ──
  const { data: metaRows } = await supabase
    .from("catalog_books")
    .select("category, department, is_active, isbn, year, cover_url, catalog_copies(status)");

  const meta = (metaRows ?? []) as Array<{
    category: string | null;
    department: string | null;
    is_active: boolean;
    isbn: string | null;
    year: number | null;
    cover_url: string | null;
    catalog_copies: { status: string | null }[];
  }>;

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

  const totalItems = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  const attention: { label: string; value: number; href?: string }[] = [
    { label: "records without copies", value: noCopyBooks },
    { label: "missing ISBN / year / category", value: missingMeta },
    { label: "without a cover", value: missingCovers },
    { label: "unlisted", value: unlistedBooks, href: "/admin/catalogs?status=deleted" },
    { label: "copies damaged / lost / missing", value: problemCopies },
  ].filter((a) => a.value > 0);

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <div className="mb-6 flex flex-wrap justify-end gap-3">
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
      </div>

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
            <p className={`mt-1 text-2xl font-bold ${color ?? "text-text-heading"}`}>{value}</p>
          </div>
        ))}
      </div>

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
        filters={{ q, cat, dept, status, sort }}
        totalItems={totalItems}
      />

      {/* ── Table ── */}
      <div className="overflow-hidden rounded-xl border border-divider bg-bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Physical catalog books</caption>
            <thead>
              <tr className="border-b border-divider bg-paper/60 text-left">
                <th scope="col" className="w-16 px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-text-muted">Cover</th>
                {["Title / Author", "Category", "Shelf", "Availability", "Copies", "Actions"].map((h) => (
                  <th key={h} scope="col" className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {pageBooks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-text-muted">
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
                    {/* Cover */}
                    <td className="px-4 py-3 text-center">
                      {book.cover_url ? (
                        <img
                          src={book.cover_url}
                          alt=""
                          width={40}
                          height={56}
                          loading="lazy"
                          className="mx-auto h-14 w-10 rounded object-cover shadow-sm"
                        />
                      ) : (
                        <div className="mx-auto flex h-14 w-10 items-center justify-center rounded border border-divider bg-paper text-text-muted">
                          <Icon name="library" className="h-5 w-5 opacity-50" />
                        </div>
                      )}
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
                    {/* Shelf */}
                    <td className="px-4 py-3">
                      {book.shelf_location
                        ? <span className="rounded-md bg-paper px-2 py-0.5 font-mono text-xs text-text-body">{book.shelf_location}</span>
                        : <span className="text-text-muted">—</span>}
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
                    {/* Actions */}
                    <td className="px-4 py-3">
                      <CatalogAdminActions book={book} copyCount={stats.total} />
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
