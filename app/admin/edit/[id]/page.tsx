// app/admin/edit/[id]/page.tsx
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import EditForm from "./EditForm";

export default async function EditBookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) redirect(`/auth/login?callbackUrl=/admin/edit/${id}`);

  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") redirect("/books");

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
    <section className="min-h-screen bg-slate-50 px-6 py-10 md:px-12">
      <div className="mx-auto max-w-[800px] space-y-8">
        <div className="flex items-center justify-between rounded-xl bg-[#0a1629] p-6 text-white md:p-8">
          <div>
            <h1 className="text-2xl font-bold">Edit book</h1>
            <p className="mt-1 text-sm text-slate-300">{initial.title}</p>
          </div>
          <Link
            href="/admin"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-white px-5 font-semibold text-slate-900 transition hover:bg-cyan-50"
          >
            Back to admin
          </Link>
        </div>

        <EditForm initial={initial} />
      </div>
    </section>
  );
}