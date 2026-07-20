import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/requireAdmin";
import { findDuplicateGroups, type DuplicateBook } from "@/lib/admin/duplicates";
import { PageHeader } from "@/components/admin/kit";
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
  const [t, books] = await Promise.all([
    getTranslations("adminDuplicates"),
    loadDuplicateBooks(),
  ]);
  const groups = findDuplicateGroups(books);

  return (
    <div className="mx-auto max-w-[1100px] space-y-6">
      <div>
        <Link
          href="/admin/manage"
          className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-text-muted hover:text-brand"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("back")}
        </Link>
        <PageHeader title={t("title")} description={t("description")} className="mb-0" />
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
