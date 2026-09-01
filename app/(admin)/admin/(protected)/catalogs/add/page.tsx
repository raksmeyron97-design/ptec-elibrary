/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
// app/admin/catalogs/add/page.tsx
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";

import AddBookWizard from "./_components/AddBookWizard";
import { requireRouteAccess } from "@/lib/admin/route-guard";
export default async function AddCatalogBookPage() {
  await requireRouteAccess("catalog.create");

  /* Was a hand-rolled check: fetch the user, read `profiles.role`, compare it
     against a local `["librarian","admin","super_admin"]` array, and on failure
     redirect out to the PUBLIC catalog. Three problems in one block — it was a
     third authorization mechanism beside the guards and the permission table,
     it ignored the legacy `is_super_admin` flag, and bouncing an admin to a
     public page is not an answer to "am I allowed in here?". The guard checks
     the same `catalog` permission the sidebar gates on, and a refusal renders
     the panel's own Access Denied boundary. */

  const supabase = createServiceClient();

  const { data: catRows } = await supabase
    .from("catalog_books")
    .select("category")
    .not("category", "is", null)
    .limit(200);
  const categories = [...new Set((catRows ?? []).map((r: any) => r.category).filter(Boolean))].sort();

  return <AddBookWizard categories={categories} />;
}