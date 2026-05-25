// app/admin/manage/page.tsx
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import ManageClient from "./ManageClient";

export default async function ManageBooksPage() {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) redirect("/auth/login?callbackUrl=/admin/manage");

  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") redirect("/books");

  // Fetch ALL books with author, category, file size
  const { data: books } = await supabase
    .from("books")
    .select(`
      id,
      title,
      slug,
      department,
      language,
      published_at,
      is_published,
      download_count,
      authors ( name ),
      categories ( name ),
      book_files ( file_size_kb )
    `)
    .order("published_at", { ascending: false });

  const rows = (books ?? []).map((b: any) => ({
    id:          b.id as string,
    title:       b.title as string,
    slug:        b.slug as string,
    author:      b.authors?.name ?? "—",
    category:    b.categories?.name ?? "—",
    department:  b.department ?? "—",
    language:    b.language ?? "—",
    year:        b.published_at ? new Date(b.published_at).getFullYear() : null,
    isPublished: b.is_published as boolean,
    fileSizeKb:  b.book_files?.[0]?.file_size_kb ?? null,
    downloadCount: b.download_count ?? 0,
  }));

  return (
    <section className="min-h-screen bg-slate-50 px-4 py-8 md:px-10">
      <div className="mx-auto max-w-[1200px] space-y-6">

        {/* Header */}
        <div className="flex flex-col gap-4 rounded-xl bg-[#0a1629] p-6 text-white md:flex-row md:items-center md:justify-between md:p-8">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-cyan-400">
              Admin · Library
            </p>
            <h1 className="text-2xl font-bold md:text-3xl">Manage All Books</h1>
            <p className="mt-1 text-sm text-slate-400">
              {rows.length} book{rows.length !== 1 ? "s" : ""} total
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/admin"
              className="inline-flex h-10 items-center rounded-lg border border-white/20 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              ← Upload
            </Link>
            <Link
              href="/books"
              className="inline-flex h-10 items-center rounded-lg bg-white px-4 text-sm font-semibold text-slate-900 transition hover:bg-cyan-50"
            >
              View Catalogue
            </Link>
          </div>
        </div>

        {/* Client-side table with search + pagination */}
        <ManageClient books={rows} />

      </div>
    </section>
  );
}