/* eslint-disable @typescript-eslint/no-explicit-any */
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
        <div className="h-fit overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm">
          {/* Header */}
          <div
            className="border-b border-divider px-5 py-4"
            style={{ background: "linear-gradient(135deg,#1E3A8A,#0F2160)" }}
          >
            <h2 className="text-sm font-bold text-white">Recent uploads</h2>
            <p className="mt-0.5 text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>
              Last 5 books added
            </p>
          </div>

          {recentBooks && recentBooks.length > 0 ? (
            <ul className="divide-y divide-divider">
              {recentBooks.map((book: any, i: number) => (
                <li key={book.id} className="flex items-start gap-3 px-5 py-3.5">
                  <div
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-sm"
                    style={{ background: "rgba(30,58,138,0.08)" }}
                  >
                    <Icon name="pdf" className="text-sm text-brand" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/books/${book.slug}`}
                      className="block truncate text-sm font-semibold text-text-heading transition-colors hover:text-[#DDB022]"
                    >
                      {book.title}
                    </Link>
                    <div className="mt-0.5 flex items-center gap-2">
                      <p className="truncate text-[11px] text-text-muted">
                        {(book.authors as any)?.name}
                        {book.book_files?.[0]?.file_size_kb
                          ? ` · ${(book.book_files[0].file_size_kb / 1024).toFixed(1)} MB`
                          : ""}
                      </p>
                      <Link
                        href={`/admin/edit/${book.id}`}
                        className="shrink-0 text-[11px] font-semibold transition-colors hover:underline"
                        style={{ color: "#DDB022" }}
                      >
                        Edit
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-4 text-sm text-text-muted">No books uploaded yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}