/* eslint-disable @typescript-eslint/no-explicit-any */
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
      department, isbn, publisher, pages, cover_url, tags, license,
      authors(name),
      categories(name),
      departments(name),
      book_files(file_url, file_size_kb, format)
    `)
    .eq("id", id)
    .single();

  if (!book) notFound();

  // Fetch departments and categories for the searchable selects
  const [{ data: deptRows }, { data: catRows }] = await Promise.all([
    supabase.from("departments").select("name").order("name", { ascending: true }),
    supabase.from("categories").select("name").order("name", { ascending: true }),
  ]);
  const departments = (deptRows ?? []).map((d) => d.name);
  const categories  = (catRows  ?? []).map((c) => c.name);

  // book_files may come back as an array or a single embedded object
  // depending on how PostgREST infers the relation cardinality.
  const fileRows = Array.isArray(book.book_files) ? book.book_files : book.book_files ? [book.book_files] : [];
  const primaryFile = fileRows.find((f: any) => f?.file_url) ?? fileRows[0] ?? null;

  // Flatten relations for the form
  const initial = {
    id:         book.id as string,
    title:      (book.title as string) ?? "",
    author:     ((book.authors as any)?.name as string) ?? "",
    category:   ((book.categories as any)?.name as string) ?? "",
    department: ((book.departments as any)?.name as string) ?? (book.department as string) ?? "Research",
    language:   (book.language as string) ?? "English",
    isbn:       (book.isbn as string) ?? "",
    publisher:  (book.publisher as string) ?? "",
    year:       book.published_at
                  ? new Date(book.published_at as string).getFullYear()
                  : new Date().getFullYear(),
    pages:      (book.pages as number) ?? 1,
    summary:    (book.description as string) ?? "",
    tags:       Array.isArray(book.tags) ? (book.tags as string[]) : [],
    coverUrl: (book.cover_url as string | null) ?? null,
    license:  (book.license as string | null) ?? "",
    fileUrl:     (primaryFile?.file_url as string | null) ?? null,
    fileSizeKb:  (primaryFile?.file_size_kb as number | null) ?? null,
    fileFormat:  (primaryFile?.format as string | null) ?? null,
  };

  return (
    <div className="mx-auto max-w-[800px] space-y-8">
      <EditForm initial={initial} departments={departments} categories={categories} />
    </div>
  );
}