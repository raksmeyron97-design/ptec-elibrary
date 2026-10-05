import "server-only";
// What the record editor needs, read once — shared by /admin/catalogs/edit/[id]
// and the review workspace (/admin/catalogs/review/[id]), which embeds the same
// editor. One loader, so the two screens cannot show one record differently.
// The caller has already passed its route guard and hands in its client.

import type { createServiceClient } from "@/lib/supabase/server";
import type { CatalogBook } from "@/lib/catalog";
import type { CatalogCopy } from "../../copy-actions";
import { coverSourceFromUrl } from "@/lib/catalog-cover";
import type { CoverSource } from "@/lib/catalog-cover-shared";
import { kohaOwnsLinkedRecords, kohaStaffLinksFor, kohaWritesItems, kohaWritesRecords, readKohaLocations } from "@/lib/koha/catalog-writes";

export type CatalogEditorData = {
  book: CatalogBook;
  coverSource: CoverSource;
  categories: string[];
  initialCopies: CatalogCopy[];
  koha: {
    owned: boolean;
    writes: boolean;
    itemWrites: boolean;
    locations: { code: string; label: string }[] | null;
    recordUrl: string | null;
    addItemUrl: string | null;
  };
};

export async function loadCatalogEditorData(
  supabase: ReturnType<typeof createServiceClient>,
  id: string,
): Promise<CatalogEditorData | null> {
  const { data: book } = await supabase.from("catalog_books").select("*").eq("id", id).single();
  if (!book) return null;

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

  const kohaId = b.koha_biblio_id ?? null;
  const links = kohaId !== null ? kohaStaffLinksFor(kohaId) : null;
  const koha = {
    owned: kohaOwnsLinkedRecords(),
    writes: kohaWritesRecords(),
    itemWrites: kohaWritesItems(),
    locations: kohaId !== null && kohaWritesItems() ? await readKohaLocations() : null,
    recordUrl: links?.record ?? null,
    addItemUrl: links?.addItem ?? null,
  };

  const initialCopies = ((copies ?? []) as CatalogCopy[]).sort(
    (a, c) => (a.copy_number ?? 1e9) - (c.copy_number ?? 1e9),
  );

  return { book: b, coverSource: coverSourceFromUrl(b.cover_url), categories, initialCopies, koha };
}
