import { createServiceClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/admin/kit";
import UploadPageClient from "./UploadPageClient";

export default async function AdminUploadPage({
  searchParams,
}: {
  searchParams: Promise<{ title?: string }>;
}) {
  const supabase = createServiceClient();
  // "Add book from search gap" prefill (dashboard collection opportunities).
  const rawTitle = (await searchParams).title;
  const initialTitle = typeof rawTitle === "string" ? rawTitle.trim().slice(0, 200) : "";

  const { data: recentBooks } = await supabase
    .from("books")
    .select(`id, title, slug, published_at, created_at, authors(name), book_files(file_size_kb)`)
    // Most recently *uploaded* — published_at is NULL for undated imports.
    .order("created_at", { ascending: false })
    .limit(5);

  const t = await getTranslations("adminShell.nav");

  return (
    <div className="mx-auto max-w-[1100px] space-y-8">
      <div className="flex flex-col gap-8">
        <PageHeader title={t("uploadBook")} className="mb-0" />
        {/* ── Client Component with Tab Switcher ── */}
        <UploadPageClient recentBooks={recentBooks || []} initialTitle={initialTitle} />
      </div>
    </div>
  );
}