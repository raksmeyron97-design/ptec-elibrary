import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import Link from "next/link";
import { Users, FolderOpen } from "lucide-react";
import TeamClient from "./TeamClient";
import type { TeamMemberRow, TeamSection } from "./actions";

export default async function TeamPage() {
  await requireAdmin();
  const supabase = createServiceClient();

  const [{ data: membersRaw, error }, { data: sectionsRaw }] = await Promise.all([
    supabase
      .from("team_members_with_email")
      .select("*")
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("team_sections")
      .select("id, name_km, name_en, description_km, description_en, display_order")
      .order("display_order", { ascending: true }),
  ]);

  const members  = (membersRaw  ?? []) as TeamMemberRow[];
  const sections = (sectionsRaw ?? []) as TeamSection[];

  return (
    <div className="mx-auto max-w-5xl space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-heading">Library Team</h1>
          <p className="mt-0.5 text-sm text-text-muted">
            {members.length} member{members.length !== 1 ? "s" : ""} across{" "}
            {sections.length} section{sections.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/team/sections"
            className="inline-flex items-center gap-2 rounded-lg border border-divider bg-bg-surface px-3.5 py-2 text-sm font-semibold text-text-body transition hover:bg-paper cursor-pointer"
          >
            <FolderOpen className="w-4 h-4" />
            Manage sections
          </Link>
          <Link
            href="/admin/team/new"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand cursor-pointer"
          >
            <Users className="w-4 h-4" />
            Add member
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <strong>Database error:</strong> {error.message}
        </div>
      )}

      {/* Sections legend */}
      {sections.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {sections.map((s) => (
            <span
              key={s.id}
              className="rounded-full border border-divider bg-paper px-3 py-1 text-xs font-medium text-text-muted"
            >
              {s.name_km} · {s.name_en}
            </span>
          ))}
        </div>
      )}

      <TeamClient members={members} sections={sections} />
    </div>
  );
}
