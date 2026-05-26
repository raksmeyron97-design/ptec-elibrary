import Link from "next/link";
import Icon from "@/components/ui/Icon";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import UploadForm from "./UploadForm";

export default async function AdminPage() {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) redirect("/auth/login?callbackUrl=/admin");

  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, email")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") redirect("/books");

  const { data: recentBooks } = await supabase
    .from("books")
    .select(`id, title, slug, published_at, authors(name), book_files(file_size_kb)`)
    .order("published_at", { ascending: false })
    .limit(5);

  return (
    <section className="min-h-screen bg-slate-50 px-6 py-10 md:px-12">
      <div className="mx-auto max-w-[1100px] space-y-8">

        {/* Header */}
        <div className="flex flex-col gap-4 rounded-xl bg-[#0a1629] p-6 text-white md:flex-row md:items-center md:justify-between md:p-8">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm text-cyan-100">
              <Icon name="pdf" className="text-base" />
              Library administration
            </div>
            <h1 className="text-3xl font-bold">Upload Books</h1>
            <p className="mt-2 text-sm text-slate-300">
              Logged in as{" "}
              <span className="font-semibold text-cyan-300">{profile.email}</span>
            </p>
          </div>
          <Link
            href="/admin/manage"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-white/20 px-5 font-semibold text-white transition hover:bg-white/10"
          >
            Manage all books
          </Link>
          <Link
            href="/admin/catalogs"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-white/20 px-5 font-semibold text-white transition hover:bg-white/10"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 10 12 3 21 10" />
              <line x1="6"  y1="10" x2="6"  y2="19" />
              <line x1="10" y1="10" x2="10" y2="19" />
              <line x1="14" y1="10" x2="14" y2="19" />
              <line x1="18" y1="10" x2="18" y2="19" />
              <line x1="2" y1="19" x2="22" y2="19" />
              <line x1="1" y1="22" x2="23" y2="22" />
            </svg>
            Manage Library
          </Link>
          <Link
            href="/books"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-white px-5 font-semibold text-slate-900 transition hover:bg-cyan-50"
          >
            View catalogue
          </Link>

        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">

          {/* ── Upload Form (client component, direct-to-Supabase) ── */}
          <UploadForm />

          {/* ── Sidebar: Recent uploads ── */}
          <div className="h-fit rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-bold text-slate-800">Recent uploads</h2>
            {recentBooks && recentBooks.length > 0 ? (
              <ul className="space-y-3">
                {recentBooks.map((book: any) => (
                  <li key={book.id} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#0a1629]/10">
                      <Icon name="pdf" className="text-sm text-[#0a1629]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/books/${book.slug}`}
                        className="block truncate text-sm font-semibold text-slate-800 transition hover:text-[#007c91]"
                      >
                        {book.title}
                      </Link>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-slate-400">
                          {(book.authors as any)?.name} ·{" "}
                          {book.book_files?.[0]?.file_size_kb
                            ? `${(book.book_files[0].file_size_kb / 1024).toFixed(1)} MB`
                            : "PDF"}
                        </p>
                        <Link
                          href={`/admin/edit/${book.id}`}
                          className="text-xs font-semibold text-[#007c91] hover:underline"
                        >
                          Edit
                        </Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400">No books uploaded yet.</p>
            )}
          </div>

        </div>
      </div>
    </section>
  );
}