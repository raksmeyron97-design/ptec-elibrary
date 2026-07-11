/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import Icon from "@/components/ui/core/Icon";
import { createServiceClient } from "@/lib/supabase/server";
import UploadPageClient from "./UploadPageClient";

export default async function AdminUploadPage() {
  const supabase = createServiceClient();

  const { data: recentBooks } = await supabase
    .from("books")
    .select(`id, title, slug, published_at, created_at, authors(name), book_files(file_size_kb)`)
    // Most recently *uploaded* — published_at is NULL for undated imports.
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    <div className="mx-auto max-w-[1100px] space-y-8">
      <div className="flex flex-col gap-8">
        {/* ── Client Component with Tab Switcher ── */}
        <UploadPageClient recentBooks={recentBooks || []} />
      </div>
    </div>
  );
}