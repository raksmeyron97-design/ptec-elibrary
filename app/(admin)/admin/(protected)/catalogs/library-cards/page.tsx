// app/admin/catalogs/library-cards/page.tsx
//
// Koha Phase 7/8: link a reader's e-Library account to their Koha library card,
// at the desk, so they see their own loans and holds in My Library
// (docs/KOHA-PATRONS.md). Opening this page needs catalog WRITE: it shows
// readers' names and emails and Koha patron details.

import Link from "next/link";
import { requireRouteAccess } from "@/lib/admin/route-guard";
import { PageHeader } from "@/components/admin/kit";
import { createServiceClient } from "@/lib/supabase/server";
import { kohaReadsPatrons } from "@/lib/koha/patron-server";
import LibraryCardsPanel, { type LinkRow } from "./_components/LibraryCardsPanel";

export const dynamic = "force-dynamic";

const LIST_LIMIT = 100;

export default async function LibraryCardsPage() {
  await requireRouteAccess("catalog.library-cards");
  const on = kohaReadsPatrons();

  let rows: LinkRow[] = [];
  let total = 0;
  let missingTable = false;
  if (on) {
    const db = createServiceClient();
    const { data, count, error } = await db.from("koha_patron_links")
      .select("profile_id, card_hint, linked_at", { count: "exact" })
      .order("linked_at", { ascending: false }).limit(LIST_LIMIT);
    if (error) missingTable = true;
    else {
      total = count ?? 0;
      const ids = (data ?? []).map((r) => r.profile_id);
      const { data: people } = ids.length ? await db.from("profiles").select("id, email, full_name").in("id", ids) : { data: [] };
      const byId = new Map((people ?? []).map((p) => [p.id, p]));
      rows = (data ?? []).map((r) => ({
        profileId: r.profile_id, cardHint: r.card_hint, linkedAt: r.linked_at,
        name: byId.get(r.profile_id)?.full_name ?? null, email: byId.get(r.profile_id)?.email ?? "(unknown)",
      }));
    }
  }

  return (
    <div className="w-full max-w-5xl space-y-6">
      <PageHeader
        breadcrumb={<Link href="/admin/catalogs" className="hover:underline">Physical Library</Link>}
        title="Library cards"
        description="Link a reader's e-Library account to their Koha library card, so they see their own loans and holds in My Library. Check the card in person: the reader's name in Koha must match."
      />
      {!on ? (
        <p className="rounded-xl border border-warning-line bg-warning-soft p-4 text-sm text-warning-text">
          Library cards are not switched on. They need KOHA_READ_PATRONS=on in the e-Library and the Koha API user at PTEC_API_LEVEL=patrons (docs/KOHA-PATRONS.md).
        </p>
      ) : missingTable ? (
        <p className="rounded-xl border border-warning-line bg-warning-soft p-4 text-sm text-warning-text">
          The database does not have the library-card table yet. Migration 0159 must be applied first.
        </p>
      ) : (
        <LibraryCardsPanel rows={rows} total={total} />
      )}
    </div>
  );
}
