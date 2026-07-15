// app/admin/catalogs/edit/[id]/page.tsx
import { notFound, redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { LIBRARIAN_ROLES } from "@/lib/types/roles";
import type { CatalogBook } from "@/lib/catalog";
import type { CatalogCopy } from "../../copy-actions";
import EditBookWizard from "./EditBookWizard";

export default async function EditCatalogBookPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};

  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect("/auth/login");

  const supabase = createServiceClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!LIBRARIAN_ROLES.includes((profile?.role ?? "") as (typeof LIBRARIAN_ROLES)[number])) {
    redirect("/catalogs");
  }

  const { data: book } = await supabase.from("catalog_books").select("*").eq("id", id).single();
  if (!book) notFound();

  const b = book as CatalogBook;

  const [{ data: catRows }, { data: copies }] = await Promise.all([
    supabase
      .from("catalog_books")
      .select("category")
      .not("category", "is", null)
      .limit(200),
    supabase
      .from("catalog_copies")
      .select("*")
      .eq("catalog_book_id", id)
      .order("created_at", { ascending: true }),
  ]);

  const categories = [
    ...new Set((catRows ?? []).map((r: { category: string | null }) => r.category).filter(Boolean)),
  ].sort() as string[];

  const initialCopies = ((copies ?? []) as CatalogCopy[]).sort(
    (a, c) => (a.copy_number ?? 1e9) - (c.copy_number ?? 1e9),
  );

  return (
    <section className="min-h-screen bg-paper px-4 py-8 md:px-12">
      <div className="mx-auto max-w-[900px]">
        <EditBookWizard
          book={b}
          categories={categories}
          initialCopies={initialCopies}
          initialTab={sp.tab === "copies" ? "copies" : "info"}
        />
      </div>
    </section>
  );
}
