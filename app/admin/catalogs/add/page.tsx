// app/admin/catalogs/add/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { addCatalogBook } from "../actions";

export default async function AddCatalogBookPage() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect("/auth/login?callbackUrl=/admin/catalogs/add");

  const supabase = createServiceClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/catalogs");

  // Fetch existing categories for datalist
  const { data: catRows } = await supabase
    .from("catalog_books")
    .select("category")
    .not("category", "is", null)
    .limit(200);
  const categories = [...new Set((catRows ?? []).map((r: any) => r.category).filter(Boolean))].sort();

  return (
    <section className="min-h-screen bg-slate-50 px-4 py-8 md:px-12">
      <div className="mx-auto max-w-[760px] space-y-6">

        {/* Header */}
        <div>
          <Link href="/admin/catalogs" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#007c91] transition mb-3">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M19 12H5m0 0 7 7m-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to catalogue admin
          </Link>
          <h1 className="text-2xl font-bold text-[#0a1629]">Add Physical Book</h1>
          <p className="text-sm text-slate-500 mt-1">Add a new book to the physical library catalogue.</p>
        </div>

        {/* Form */}
        <form action={addCatalogBook} className="rounded-2xl bg-white border border-slate-100 shadow-sm p-6 space-y-5">

          {/* ── Core info ── */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Title *</label>
              <input name="title" required className={inputCls} placeholder="e.g. Introduction to Cambodian Law" />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Author *</label>
              <input name="author" required className={inputCls} placeholder="Author full name" />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Language *</label>
              <select name="language" defaultValue="km" className={inputCls}>
                <option value="km">Khmer (ខ្មែរ)</option>
                <option value="en">English</option>
                <option value="fr">French</option>
                <option value="zh">Chinese</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">ISBN</label>
              <input name="isbn" className={inputCls} placeholder="978-0-000-00000-0" />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Year</label>
              <input name="year" type="number" min={1900} max={2100} className={inputCls} placeholder={String(new Date().getFullYear())} />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Category</label>
              <input name="category" list="cat-list" className={inputCls} placeholder="e.g. Law, Science…" />
              <datalist id="cat-list">
                {categories.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Department</label>
              <input name="department" className={inputCls} placeholder="e.g. Public Law" />
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* ── Library-specific ── */}
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Library Details</h2>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Shelf Location</label>
              <input name="shelf_location" className={inputCls} placeholder="A-3-12" />
              <p className="mt-1 text-[10px] text-slate-400">Format: Section-Row-Shelf</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Total Copies *</label>
              <input name="copies_total" type="number" min={1} defaultValue={1} required className={inputCls} />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Available Copies</label>
              <input name="copies_available" type="number" min={0} defaultValue={1} className={inputCls} />
              <p className="mt-1 text-[10px] text-slate-400">≤ Total copies</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Accession No.</label>
              <input name="accession_number" className={inputCls} placeholder="ACC-001" />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Cover Image URL</label>
              <input name="cover_url" type="url" className={inputCls} placeholder="https://…" />
              <p className="mt-1 text-[10px] text-slate-400">Leave blank for auto-generated cover</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Description</label>
            <textarea name="description" rows={4} className={inputCls + " resize-none"} placeholder="Brief description of the book…" />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Link
              href="/admin/catalogs"
              className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="rounded-xl bg-gradient-to-br from-[#0a1629] to-[#007c91] px-8 py-2.5 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(0,124,145,0.3)] transition hover:shadow-[0_6px_24px_rgba(0,124,145,0.45)] active:scale-[0.98]"
            >
              Add Book
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

const inputCls = `
  w-full rounded-xl border border-slate-200 bg-slate-50/50
  px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400
  outline-none transition
  focus:border-[#007c91]/50 focus:bg-white focus:ring-2 focus:ring-[#007c91]/15
`;