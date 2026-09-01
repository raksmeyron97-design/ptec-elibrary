// app/admin/catalogs/edit/[id]/page.tsx
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";

import type { CatalogBook } from "@/lib/catalog";
import type { CatalogCopy } from "../../copy-actions";
import { coverSourceFromUrl } from "@/lib/catalog-cover";
import EditBookWizard from "./_components/EditBookWizard";
import { requireRouteAccess } from "@/lib/admin/route-guard";

export default async function EditCatalogBookPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string }>;
}) {
  await requireRouteAccess("catalog.edit");

  const { id } = await params;
  const sp = (await searchParams) ?? {};

  /* Same story as /admin/catalogs/add: a hand-rolled role check that neither
     the permission table nor `is_super_admin` reached, redirecting a refused
     admin out to the public catalog. */

  const supabase = createServiceClient();

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
    <EditBookWizard
      book={b}
      coverSource={coverSourceFromUrl(b.cover_url)}
      categories={categories}
      initialCopies={initialCopies}
      initialTab={sp.tab === "copies" ? "copies" : "info"}
    />
  );
}
