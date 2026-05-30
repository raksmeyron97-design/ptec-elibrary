// app/admin/catalogs/edit/[id]/page.tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { CatalogBook } from "@/lib/catalog";
import { updateCatalogBook } from "../../actions";

import EditBookWizard from "./EditBookWizard";

export default async function EditCatalogBookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect("/auth/login");

  const supabase = createServiceClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/catalogs");

  const { data: book } = await supabase.from("catalog_books").select("*").eq("id", id).single();
  if (!book) notFound();

  const b = book as CatalogBook;

  // categories datalist
  const { data: catRows } = await supabase
    .from("catalog_books")
    .select("category")
    .not("category", "is", null)
    .limit(200);
  const categories = [...new Set((catRows ?? []).map((r: any) => r.category).filter(Boolean))].sort();

  return (
    <section className="min-h-screen bg-slate-50 px-4 py-8 md:px-12">
      <div className="mx-auto max-w-[760px]">
        <EditBookWizard book={b} categories={categories} />
      </div>
    </section>
  );
}