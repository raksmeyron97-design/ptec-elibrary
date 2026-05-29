// app/admin/catalogs/edit/[id]/page.tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { CatalogBook } from "@/lib/catalog";
import { updateCatalogBook } from "../../actions";

export default async function EditCatalogBookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect("/auth/login");

  const supabase = createServiceClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/catalogs");

  const { data: book } = await supabase.from("catalog_books").select("*").eq("id", id).single();
  if (!book) notFound();

  const b = book as CatalogBook;

  // categories datalist
  const { data: catRows } = await supabase
    .from("catalog_books")
    .select("category")
    .not("category", "is", null)
    .limit(200);
  const categories = [...new Set((catRows ?? []).map((r: any) => r.category).filter(Boolean))].sort();

  const updateWithId = updateCatalogBook.bind(null, id);

  return (
    <section className="min-h-screen bg-slate-50 px-4 py-8 md:px-12">
      <div className="mx-auto max-w-[760px] space-y-6">

        <div>
          <Link href="/admin/catalogs" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#007c91] transition mb-3">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M19 12H5m0 0 7 7m-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to catalogue admin
          </Link>
          <h1 className="text-2xl font-bold text-[#0a1629]">Edit Book</h1>
          <p className="text-sm text-slate-500 mt-1 truncate">{b.title}</p>
        </div>

        <form action={updateWithId} className="rounded-2xl bg-white border border-slate-100 shadow-sm p-6 space-y-5">

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls}>Title *</label>
              <input name="title" required defaultValue={b.title} className={inputCls} />
            </div>

            <div>
              <label className={labelCls}>Author *</label>
              <input name="author" required defaultValue={b.author} className={inputCls} />
            </div>

            <div>
              <label className={labelCls}>Language *</label>
              <select name="language" defaultValue={b.language} className={inputCls}>
                <option value="km">Khmer (ខ្មែរ)</option>
                <option value="en">English</option>
                <option value="fr">French</option>
                <option value="zh">Chinese</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className={labelCls}>ISBN</label>
              <input name="isbn" defaultValue={b.isbn ?? ""} className={inputCls} />
            </div>

            <div>
              <label className={labelCls}>Year</label>
              <input name="year" type="number" min={1900} max={2100} defaultValue={b.year ?? ""} className={inputCls} />
            </div>

            <div>
              <label className={labelCls}>Category</label>
              <input name="category" list="cat-list" defaultValue={b.category ?? ""} className={inputCls} />
              <datalist id="cat-list">
                {categories.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>

            <div>
              <label className={labelCls}>Department</label>
              <input name="department" defaultValue={b.department ?? ""} className={inputCls} />
            </div>
          </div>

          <hr className="border-slate-100" />
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Library Details</h2>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={labelCls}>Shelf Location</label>
              <input name="shelf_location" defaultValue={b.shelf_location ?? ""} className={inputCls} placeholder="A-3-12" />
            </div>
            <div>
              <label className={labelCls}>Total Copies *</label>
              <input name="copies_total" type="number" min={1} required defaultValue={b.copies_total} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Accession No.</label>
              <input name="accession_number" defaultValue={b.accession_number ?? ""} className={inputCls} />
            </div>
          </div>

          {/* Cover URL */}
          <div>
            <label className={labelCls}>Cover Image URL</label>
            {b.cover_url && (
              <div className="mb-2 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.cover_url} alt="" className="h-16 w-12 object-cover rounded-lg border border-slate-200" />
                <span className="text-xs text-slate-500 truncate max-w-[200px]">{b.cover_url}</span>
              </div>
            )}
            <input name="cover_url" type="url" defaultValue="" className={inputCls} placeholder="New URL (leave blank to keep existing) or type __remove__ to clear" />
          </div>

          <div>
            <label className={labelCls}>Description</label>
            <textarea name="description" rows={4} defaultValue={b.description ?? ""} className={inputCls + " resize-none"} />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Link href="/admin/catalogs" className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
              Cancel
            </Link>
            <button
              type="submit"
              className="rounded-xl bg-gradient-to-br from-[#0a1629] to-[#007c91] px-8 py-2.5 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(0,124,145,0.3)] transition hover:shadow-[0_6px_24px_rgba(0,124,145,0.45)] active:scale-[0.98]"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

const labelCls = "block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5";
const inputCls = `
  w-full rounded-xl border border-slate-200 bg-slate-50/50
  px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400
  outline-none transition
  focus:border-[#007c91]/50 focus:bg-white focus:ring-2 focus:ring-[#007c91]/15
`;