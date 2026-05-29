// app/admin/edit/[id]/page.tsx
import { createServiceClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import EditForm from "./EditForm";

export default async function EditBookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = createServiceClient();

  // Fetch the book with its author + category names
  const { data: book } = await supabase
    .from("books")
    .select(`
      id, title, slug, description, language, published_at,
      department, isbn, pages, cover_url,
      authors(name),
      categories(name)
    `)
    .eq("id", id)
    .single();

  if (!book) notFound();

  // Flatten relations for the form
  const initial = {
    id:         book.id as string,
    title:      (book.title as string) ?? "",
    author:     ((book.authors as any)?.name as string) ?? "",
    category:   ((book.categories as any)?.name as string) ?? "",
    department: (book.department as string) ?? "Research",
    language:   (book.language as string) ?? "English",
    isbn:       (book.isbn as string) ?? "",
    year:       book.published_at
                  ? new Date(book.published_at as string).getFullYear()
                  : new Date().getFullYear(),
    pages:      (book.pages as number) ?? 1,
    summary:    (book.description as string) ?? "",
    coverUrl: (book.cover_url as string | null) ?? null,
  };

  return (
    <div className="mx-auto max-w-[800px] space-y-8">
      <EditForm initial={initial} />
    </div>
  );
}