import { getTranslations } from "next-intl/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/requireAdmin";
import { PageHeader } from "@/components/admin/kit";
import BooksBreadcrumb from "@/components/admin/ebooks/BooksBreadcrumb";
import BooksWorkspaceNav from "@/components/admin/ebooks/BooksWorkspaceNav";
import UploadPageClient from "./_components/UploadPageClient";

/**
 * The creation workflow.
 *
 * The page owns identity and context (header, workspace nav, recent uploads);
 * the client component owns the single/bulk switch and the forms. The guard is
 * explicit here rather than inherited: every other write surface in the
 * workspace states its own permission, and `/api/admin/upload` plus
 * `saveBookRecord` re-check server-side regardless — this one only decides
 * whether the page renders at all.
 */
export default async function BooksUploadPage({
  searchParams,
}: {
  searchParams: Promise<{ title?: string }>;
}) {
  await requirePermission("books", "write");

  const supabase = createServiceClient();
  // "Add book from search gap" prefill (dashboard collection opportunities).
  const rawTitle = (await searchParams).title;
  const initialTitle = typeof rawTitle === "string" ? rawTitle.trim().slice(0, 200) : "";

  const [{ data: recentBooks }, t] = await Promise.all([
    supabase
      .from("books")
      .select(`id, title, slug, published_at, created_at, authors(name), book_files(file_size_kb)`)
      // Most recently *uploaded* — published_at is NULL for undated imports.
      .order("created_at", { ascending: false })
      .limit(5),
    getTranslations("adminUpload"),
  ]);

  return (
    <div className="w-full space-y-6">
      <PageHeader
        breadcrumb={<BooksBreadcrumb current={t("title")} />}
        title={t("title")}
        description={t("description")}
        className="mb-4"
      />

      <BooksWorkspaceNav current="upload" />

      <UploadPageClient recentBooks={recentBooks || []} initialTitle={initialTitle} />
    </div>
  );
}
