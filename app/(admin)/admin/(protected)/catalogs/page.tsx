/* eslint-disable @next/next/no-img-element */
// app/admin/catalogs/page.tsx
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import type { CatalogBook } from "@/lib/catalog";
import {
  getAvailability,
  AVAILABILITY_LABEL,
  AVAILABILITY_COLOR,
  AVAILABILITY_DOT,
} from "@/lib/catalog";
import CatalogAdminActions from "./CatalogAdminActions";
import CsvImportModal from "./CsvImportModal";
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
    .select("*", { count: "exact" });

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
  const pageBooks = (books ?? []) as CatalogBook[];

  // ── Meta query: stats + filter options in ONE small read ──
  // Reads only 5 light columns. At very large scale, move this to a Postgres
  // RPC / materialized view (see notes).
  const { data: metaRows } = await supabase
    .from("catalog_books")
    .select("category, department, copies_total, copies_available, is_active");

  const meta = (metaRows ?? []) as Array<{
    category: string | null;
    department: string | null;
    copies_total: number;
    copies_available: number;
    is_active: boolean;
  }>;

  const categories = Array.from(
    new Set(meta.map((m) => m.category).filter(Boolean) as string[])
  ).sort();
  const departments = Array.from(
    new Set(meta.map((m) => m.department).filter(Boolean) as string[])
  ).sort();

  const activeMeta  = meta.filter((m) => m.is_active);
  const activeBooks = activeMeta.length;
  const totalCopies = activeMeta.reduce((s, b) => s + (b.copies_total ?? 0), 0);
  const availCopies = activeMeta.reduce((s, b) => s + (b.copies_available ?? 0), 0);

  const totalItems = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <div className="flex flex-wrap justify-end gap-3 mb-6">
        <CsvImportModal />
        <Link
          href="/admin/catalogs/add"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-white transition hover:bg-brand-hover"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          Add Book
        </Link>
      </div>

      {/* ── Stats row (always reflects ALL active books) ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Total Books",      value: activeBooks },
          { label: "Total Copies",     value: totalCopies },
          { label: "Available Copies", value: availCopies,               color: "text-emerald-600" },
          { label: "Checked Out",      value: totalCopies - availCopies, color: "text-amber-500" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl bg-bg-surface border border-divider p-4 shadow-sm">
            <p className="text-xs text-text-muted font-medium">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color ?? "text-text-heading"}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Toolbar: search + sort + filters ── */}
      <AdminCatalogToolbar
        categories={categories}
        departments={departments}
        filters={{ q, cat, dept, status, sort }}
        totalItems={totalItems}
      />

      {/* ── Table ── */}
      <div className="rounded-xl bg-bg-surface border border-divider shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-divider bg-paper/60 text-left">
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-text-muted text-center w-16">Cover</th>
                {["Title / Author", "Category", "Shelf", "Availability", "Copies", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-text-muted">
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
                const statusKey = getAvailability(book);
                const txtCls = AVAILABILITY_COLOR[statusKey];
                const dotCls = AVAILABILITY_DOT[statusKey];
                return (
                  <tr key={book.id} className={`hover:bg-paper/50 transition ${!book.is_active ? "opacity-40" : ""}`}>
                    {/* Cover */}
                    <td className="px-4 py-3 text-center">
                      {book.cover_url ? (
                        <img
                          src={book.cover_url}
                          alt={`${book.title} cover`}
                          className="w-10 h-14 object-cover rounded shadow-sm mx-auto"
                        />
                      ) : (
                        <div className="w-10 h-14 bg-paper rounded border border-divider flex items-center justify-center mx-auto text-text-muted">
                          <Icon name="library" className="w-5 h-5 opacity-50" />
                        </div>
                      )}
                    </td>
                    {/* Title */}
                    <td className="px-4 py-3 max-w-[240px]">
                      <p className="font-semibold text-text-heading truncate">{book.title}</p>
                      <p className="text-xs text-text-muted truncate">{book.author}</p>
                      {book.isbn && <p className="text-[10px] text-text-muted font-mono">{book.isbn}</p>}
                      {!book.is_active && (
                        <span className="text-[10px] font-bold text-red-400">DELETED</span>
                      )}
                    </td>
                    {/* Category */}
                    <td className="px-4 py-3 text-text-muted whitespace-nowrap">
                      {book.category ?? <span className="text-text-muted">—</span>}
                    </td>
                    {/* Shelf */}
                    <td className="px-4 py-3">
                      {book.shelf_location
                        ? <span className="font-mono text-xs bg-paper px-2 py-0.5 rounded-md text-text-body">{book.shelf_location}</span>
                        : <span className="text-text-muted">—</span>}
                    </td>
                    {/* Availability */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${txtCls}`}>
                        <span className={`h-2 w-2 rounded-full ${dotCls}`} />
                        {AVAILABILITY_LABEL[statusKey]}
                      </span>
                    </td>
                    {/* Copies */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`font-bold ${txtCls}`}>{book.copies_available}</span>
                      <span className="text-text-muted">/{book.copies_total}</span>
                    </td>
                    {/* Actions */}
                    <td className="px-4 py-3">
                      <CatalogAdminActions book={book} />
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