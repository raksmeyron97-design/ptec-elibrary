// lib/seo/description-gate.server.ts
//
// The facts the description gate needs (lib/seo/description-gate.ts), for the
// whole collection at once: a template's size is only knowable across every
// book. One cached read under the `books` tag every book save fires. Read only
// when the gate is ON (SEO_DESCRIPTION_GATE=on) — off, it costs nothing.

import "server-only";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { pagedScan } from "@/lib/db/paged-scan";
import { clusterSizes, templateKey } from "@/lib/seo/description-template";
import { descriptionGateEnabled } from "@/lib/seo/seo-flags";
import { withheldByDescriptionGate } from "@/lib/seo/description-gate";

type Row = {
  slug: string;
  title: string;
  description: string | null;
  file_access: string | null;
  description_status?: string | null;
  categories: { name: string | null } | null;
  authors: { name: string | null } | null;
  book_files: { id: string }[] | null;
};

const BASE = "id, slug, title, description, file_access, categories(name), authors(name), book_files(id)";

async function loadWithheldSlugs(): Promise<string[]> {
  const supabase = createServiceClient();
  const scan = (columns: string) =>
    pagedScan<Row>(
      (from, to) =>
        supabase.from("books").select(columns).eq("is_published", true).order("id", { ascending: true }).range(from, to),
      50_000,
    );
  let result = await scan(`${BASE}, description_status`);
  if (result.error) result = await scan(BASE);
  // A failed or partial read THROWS: cached as "nothing withheld" it would be
  // harmless, but cached as a wrong list it would de-index real books.
  if (result.error || result.truncated) throw new Error(`description gate: ${result.error?.message ?? "truncated"}`);
  const keyed = result.data.map((b) => ({
    b,
    key: templateKey(b.description, { title: b.title, subject: b.categories?.name, author: b.authors?.name }),
  }));
  const sizes = clusterSizes(keyed.map((k) => k.key));
  return keyed
    .filter(({ b, key }) =>
      withheldByDescriptionGate(
        {
          hasFile: (b.book_files?.length ?? 0) > 0 && b.file_access !== "catalogue_only",
          templateClusterSize: key === "empty" ? 0 : (sizes.get(key) ?? 0),
          descriptionEmpty: key === "empty",
          descriptionStatus: b.description_status ?? null,
        },
        true,
      ),
    )
    .map(({ b }) => b.slug);
}

const cachedWithheld = unstable_cache(loadWithheldSlugs, ["description-gate-v1"], { revalidate: 3600, tags: ["books"] });

/** The slugs the gate withholds — empty when the gate is off or unreadable. */
export async function descriptionGateWithheldSlugs(): Promise<Set<string>> {
  if (!descriptionGateEnabled()) return new Set();
  try {
    return new Set(await cachedWithheld());
  } catch (error) {
    // Unreadable is "withhold nothing": the gate may only ever remove a page
    // it can prove qualifies.
    console.warn("[description-gate] read failed; withholding nothing:", error);
    return new Set();
  }
}
