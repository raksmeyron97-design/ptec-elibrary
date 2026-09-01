import { createServiceClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import SectionsClient from "./_components/SectionsClient";
import type { TeamSection } from "../actions";
import { requireRouteAccess } from "@/lib/admin/route-guard";

export default async function TeamSectionsPage() {
  await requireRouteAccess("team.sections");

  const supabase = createServiceClient();

  const [{ data: sectionsRaw }, { data: membersRaw }] = await Promise.all([
    supabase
      .from("team_sections")
      .select("*")
      .order("display_order", { ascending: true }),
    supabase.from("team_members").select("section_id"),
  ]);

  const sections = (sectionsRaw ?? []) as TeamSection[];

  const memberCounts: Record<string, number> = {};
  for (const m of membersRaw ?? []) {
    if (m.section_id) {
      memberCounts[m.section_id] = (memberCounts[m.section_id] ?? 0) + 1;
    }
  }

  return (
    <div className="w-full space-y-6">

      {/* Back link */}
      <Link
        href="/admin/team"
        className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-body transition cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to team
      </Link>

      <SectionsClient sections={sections} memberCounts={memberCounts} />
    </div>
  );
}
