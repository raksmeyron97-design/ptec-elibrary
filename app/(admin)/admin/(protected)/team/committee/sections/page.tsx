import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { createServiceClient } from "@/lib/supabase/server";
import { requireRouteAccess } from "@/lib/admin/route-guard";
import CommitteeSectionsClient from "./_components/CommitteeSectionsClient";
import type { CommitteeSectionRow } from "../actions";

/**
 * Committee sections — the governance groupings readers see as headings.
 *
 * A dedicated table rather than a reuse of `team_sections` (see migration
 * 0150): a staff directory groups people by the SERVICE they run, a committee
 * groups them by the OFFICE they hold, and the two lists have different names,
 * a different order and, in the committee's case, a layout variant. Folding
 * them together would have made every rename on one page a rename on the other.
 */
export default async function CommitteeSectionsPage() {
  await requireRouteAccess("team.committee.sections");

  const supabase = createServiceClient();
  const [{ data: sectionRows }, { data: seatRows }] = await Promise.all([
    supabase.from("committee_sections").select("*").order("display_order", { ascending: true }),
    supabase.from("committee_members").select("committee_section_id"),
  ]);

  const sections = (sectionRows ?? []) as CommitteeSectionRow[];
  const seatCounts: Record<string, number> = {};
  for (const seat of seatRows ?? []) {
    if (seat.committee_section_id) {
      seatCounts[seat.committee_section_id] = (seatCounts[seat.committee_section_id] ?? 0) + 1;
    }
  }

  return (
    <div className="w-full space-y-6">
      <Link
        href="/admin/team/committee"
        className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-text-muted transition hover:text-text-body"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to committee
      </Link>

      <CommitteeSectionsClient sections={sections} seatCounts={seatCounts} />
    </div>
  );
}
