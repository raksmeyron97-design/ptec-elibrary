// app/admin/catalogs/edit/[id]/page.tsx
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";

import EditBookWizard from "./_components/EditBookWizard";
import { requireRouteAccess } from "@/lib/admin/route-guard";
import { loadCatalogEditorData } from "./load-record";

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

  // Shared with the review workspace, which embeds this same editor.
  const data = await loadCatalogEditorData(supabase, id);
  if (!data) notFound();

  return (
    <EditBookWizard
      book={data.book}
      coverSource={data.coverSource}
      categories={data.categories}
      initialCopies={data.initialCopies}
      initialTab={sp.tab === "copies" ? "copies" : "info"}
      koha={data.koha}
    />
  );
}
