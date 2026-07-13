import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/requireAdmin";
import { findDuplicateGroups, type DuplicateBook } from "@/lib/admin/duplicates";
import DuplicateGroupsClient from "@/components/admin/ebooks/DuplicateGroupsClient";

// Duplicate e-book review workspace. Read-only detection here; the retire
// action (app/actions/duplicates.ts) is what actually archives + redirects.
export const dynamic = "force-dynamic";

type BookRow = {
  id: string;
  slug: string;
  title: string;
  isbn: string | null;
  published_at: string | null;
  created_at: string | null;
  pages: number | null;
  is_published: boolean;
  authors: { name: string | null } | null;
  book_files: { file_size_kb: number | null; content_hash: string | null }[] | null;
};

async function loadDuplicateBooks(): Promise<DuplicateBook[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("books")
    .select(
      "id, slug, title, isbn, published_at, created_at, pages, is_published, authors(name), book_files(file_size_kb, content_hash)",
    )
    .eq("is_published", true)
    .order("created_at", { ascending: true });

  return ((data ?? []) as unknown as BookRow[]).map((b) => {
    const file = b.book_files?.[0] ?? null;
    return {
      id: b.id,
      slug: b.slug,
      title: b.title,
      isbn: b.isbn,
      year: b.published_at ? new Date(b.published_at).getFullYear() : null,
      author: b.authors?.name ?? null,
      pages: b.pages,
      fileSizeKb: file?.file_size_kb ?? null,
      contentHash: file?.content_hash ?? null,
      createdAt: b.created_at,
    };
  });
}

export default async function DuplicatesPage() {
  await requirePermission("books", "write");
  const books = await loadDuplicateBooks();
  const groups = findDuplicateGroups(books);

  return (
    <div className="mx-auto max-w-[1100px] space-y-6">
      <div>
        <Link
          href="/admin/manage"
          className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-text-muted hover:text-brand"
        >
          <ArrowLeft className="h-4 w-4" />
          Manage E-books
        </Link>
        <h1 className="text-2xl font-bold text-text-heading">Duplicate Review</h1>
        <p className="mt-1 max-w-2xl text-sm text-text-muted">
          Probable duplicate records, grouped by shared ISBN, PDF file identity, or
          matching title with a corroborating signal. Nothing is merged automatically —
          pick the record to keep, then retire the others. Retiring archives the
          duplicate (its reviews and analytics are preserved) and adds a permanent 301
          redirect from its URL to the record you keep.
        </p>
      </div>

      <DuplicateGroupsClient
        groups={groups.map((g) => ({
          key: g.key,
          confidence: g.confidence,
          signals: g.signals,
          books: g.books.map((b) => ({
            id: b.id,
            slug: b.slug,
            title: b.title,
            isbn: b.isbn,
            year: b.year,
            author: b.author,
            pages: b.pages,
            fileSizeKb: b.fileSizeKb,
            hasHash: !!b.contentHash,
          })),
        }))}
      />
    </div>
  );
}
