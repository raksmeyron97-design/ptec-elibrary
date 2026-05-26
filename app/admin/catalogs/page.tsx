// app/admin/catalogs/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { CatalogBook } from "@/lib/catalog";
import {
  getAvailability,
  AVAILABILITY_LABEL,
  AVAILABILITY_COLOR,
  AVAILABILITY_DOT,
} from "@/lib/catalog";
import CatalogAdminActions from "./CatalogAdminActions";
import CsvImportModal from "./CsvImportModal";

export const dynamic = "force-dynamic";

export default async function AdminCatalogsPage() {
  // Auth
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect("/auth/login?callbackUrl=/admin/catalogs");

  const supabase = createServiceClient();
  const { data: profile } = await supabase.from("profiles").select("role, email").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/catalogs");

  // Fetch all (including inactive for admin)
  const { data: books } = await supabase
    .from("catalog_books")
    .select("*")
    .order("created_at", { ascending: false });

  const allBooks = (books ?? []) as CatalogBook[];
  const activeBooks = allBooks.filter((b) => b.is_active);
  const totalCopies = activeBooks.reduce((s, b) => s + b.copies_total, 0);
  const availCopies = activeBooks.reduce((s, b) => s + b.copies_available, 0);

  return (
    <section className="min-h-screen bg-slate-50 px-4 py-8 md:px-12">
      <div className="mx-auto max-w-[1200px] space-y-6">

        {/* ── Header ── */}
        <div className="flex flex-col gap-4 rounded-xl bg-[#0a1629] p-6 text-white md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-cyan-100">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
              Physical Library Catalogue
            </div>
            <h1 className="text-2xl font-bold">Books In Library — Admin</h1>
            <p className="mt-1 text-sm text-slate-300">
              {profile.email} · {activeBooks.length} books · {availCopies}/{totalCopies} copies available
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <CsvImportModal />
            <Link
              href="/admin/catalogs/add"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-5 text-sm font-semibold text-[#0a1629] transition hover:bg-cyan-50"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
              Add Book
            </Link>
            <Link
              href="/catalogs"
              className="inline-flex h-10 items-center rounded-lg border border-white/20 px-5 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              View Catalogue →
            </Link>
          </div>
        </div>

        {/* ── Stats row ── */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Total Books",      value: activeBooks.length },
            { label: "Total Copies",     value: totalCopies },
            { label: "Available Copies", value: availCopies,                         color: "text-emerald-600" },
            { label: "Checked Out",      value: totalCopies - availCopies,            color: "text-amber-500" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl bg-white border border-slate-100 p-4 shadow-sm">
              <p className="text-xs text-slate-400 font-medium">{label}</p>
              <p className={`text-2xl font-bold mt-1 ${color ?? "text-slate-800"}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* ── Table ── */}
        <div className="rounded-xl bg-white border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-left">
                  {["Title / Author", "Category", "Shelf", "Availability", "Copies", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {allBooks.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-16 text-center text-slate-400">
                      No books yet. Click &ldquo;Add Book&rdquo; or import CSV to get started.
                    </td>
                  </tr>
                ) : allBooks.map((book) => {
                  const status  = getAvailability(book);
                  const txtCls  = AVAILABILITY_COLOR[status];
                  const dotCls  = AVAILABILITY_DOT[status];
                  return (
                    <tr key={book.id} className={`hover:bg-slate-50/50 transition ${!book.is_active ? "opacity-40" : ""}`}>
                      {/* Title */}
                      <td className="px-4 py-3 max-w-[240px]">
                        <p className="font-semibold text-slate-800 truncate">{book.title}</p>
                        <p className="text-xs text-slate-400 truncate">{book.author}</p>
                        {book.isbn && <p className="text-[10px] text-slate-300 font-mono">{book.isbn}</p>}
                        {!book.is_active && (
                          <span className="text-[10px] font-bold text-red-400">DELETED</span>
                        )}
                      </td>
                      {/* Category */}
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {book.category ?? <span className="text-slate-300">—</span>}
                      </td>
                      {/* Shelf */}
                      <td className="px-4 py-3">
                        {book.shelf_location
                          ? <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded-md text-slate-600">{book.shelf_location}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      {/* Availability */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${txtCls}`}>
                          <span className={`h-2 w-2 rounded-full ${dotCls}`} />
                          {AVAILABILITY_LABEL[status]}
                        </span>
                      </td>
                      {/* Copies */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`font-bold ${txtCls}`}>{book.copies_available}</span>
                        <span className="text-slate-400">/{book.copies_total}</span>
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

      </div>
    </section>
  );
}