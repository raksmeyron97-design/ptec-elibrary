// app/admin/catalogs/add/page.tsx
import { createServiceClient } from "@/lib/supabase/server";
import { CATALOG_SCAN_CAP } from "@/lib/catalog";
import { pagedScan } from "@/lib/db/paged-scan";

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

  // Suggestions only, so a failed read offers none rather than blocking the
  // form. Paged, because `.limit(200)` took the first 200 ROWS — with 2,638
  // records that is not the category list.
  const catScan = await pagedScan<{ category: string | null }>(
    (from, to) =>
      supabase
        .from("catalog_books")
        .select("category")
        .not("category", "is", null)
        .order("id", { ascending: true })
        .range(from, to),
    CATALOG_SCAN_CAP,
  );
  const catRows = catScan.error || catScan.truncated ? [] : catScan.data;
  const categories = [...new Set(catRows.map((r) => r.category).filter(Boolean) as string[])].sort();

  return <AddBookWizard categories={categories} />;
}