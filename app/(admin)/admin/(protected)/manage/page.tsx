// app/admin/manage/page.tsx
import { createServiceClient } from "@/lib/supabase/server";
import ManageClient from "./ManageClient";

export default async function ManageBooksPage() {
  const supabase = createServiceClient();

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
    <div className="mx-auto max-w-[1200px] space-y-6">
      {/* Client-side table with search + pagination */}
      <ManageClient books={rows} />
    </div>
  );
}