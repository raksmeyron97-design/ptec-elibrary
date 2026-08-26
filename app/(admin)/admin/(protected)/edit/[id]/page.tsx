/* eslint-disable @typescript-eslint/no-explicit-any */
// app/admin/edit/[id]/page.tsx
import { createServiceClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import EditForm from "./_components/EditForm";

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
      seo_title, seo_description, og_image,
      status, verified_at, verified_by, source_attribution,
      authors(name),
      categories(name),
      departments(name),
      book_files(file_url, file_size_kb, format)
    `)
    .eq("id", id)
    .single();

  if (!book) notFound();

  /*
    Who verified this record. A second query rather than a PostgREST embed:
    books has two FKs into profiles (verified_by, created_by), so an embed
    would have to name the constraint, and this page already runs a small
    fan-out of lookups.
  */
  let verifierName: string | null = null;
  if (book.verified_by) {
    const { data: verifier } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", book.verified_by as string)
      .maybeSingle();
    verifierName = verifier?.full_name || verifier?.email || null;
  }

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
    slug:       (book.slug as string) ?? "",
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
    seoTitle:       (book.seo_title as string | null) ?? "",
    seoDescription: (book.seo_description as string | null) ?? "",
    ogImage:        (book.og_image as string | null) ?? "",
    fileUrl:     (primaryFile?.file_url as string | null) ?? null,
    fileSizeKb:  (primaryFile?.file_size_kb as number | null) ?? null,
    fileFormat:  (primaryFile?.format as string | null) ?? null,
    status:            (book.status as string | null) ?? "draft",
    verifiedAt:        (book.verified_at as string | null) ?? null,
    verifierName,
    sourceAttribution: (book.source_attribution as string | null) ?? "",
  };

  /*
    Breadcrumb, heading, tabs, context sidebar and action bar all come from
    FormShell inside EditForm — the sidebar previews the form's own live state,
    so it cannot be assembled here. The route stays a data loader.

    The h1 used to be `sr-only`, so the page rendered with no visible heading at
    all: an admin arriving from a list of near-identical Khmer titles had to read
    the Title field to confirm which record they had opened. It is the real
    heading now, and it names the book.
  */
  return (
    <EditForm
      initial={initial}
      departments={departments}
      categories={categories}
      pageTitle={initial.title.trim() || "Untitled e-book"}
      pageDescription="Metadata, cover image and PDF file for this e-book."
    />
  );
}