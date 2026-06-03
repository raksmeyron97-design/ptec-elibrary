import Link from "next/link";
import Icon from "@/components/ui/core/Icon";
import { createServiceClient } from "@/lib/supabase/server";
import UploadPageClient from "./UploadPageClient";

export default async function AdminUploadPage() {
  const supabase = createServiceClient();

  const { data: recentBooks } = await supabase
    .from("books")
    .select(`id, title, slug, published_at, authors(name), book_files(file_size_kb)`)
    .order("published_at", { ascending: false })
    .limit(5);

  return (
    <div className="mx-auto max-w-[1100px] space-y-8">
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        {/* ── Client Component with Tab Switcher ── */}
        <UploadPageClient />

        {/* ── Sidebar: Recent uploads ── */}
        <div className="h-fit rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-bold text-slate-800">Recent uploads</h2>
          {recentBooks && recentBooks.length > 0 ? (
            <ul className="space-y-3">
              {recentBooks.map((book: any) => (
                <li key={book.id} className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#1E3A8A]/10">
                    <Icon name="pdf" className="text-sm text-[#1E3A8A]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/books/${book.slug}`}
                      className="block truncate text-sm font-semibold text-slate-800 transition hover:text-[#DDB022]"
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
                        className="text-xs font-semibold text-[#DDB022] hover:underline"
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
  );
}