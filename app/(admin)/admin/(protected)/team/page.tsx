import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import Link from "next/link";
import {
  UserPlus, FolderOpen, Users, Eye, EyeOff, LayoutGrid, ImageOff, Languages, ExternalLink,
} from "lucide-react";
import TeamClient from "./TeamClient";
import type { TeamMemberRow, TeamSection } from "./actions";

/** A member is "missing a translation" when a field is filled in one language only. */
function hasTranslationGap(m: TeamMemberRow): boolean {
  const pairs: [string | null | undefined, string | null | undefined][] = [
    [m.position_km, m.position_en],
    [m.bio_km, m.bio_en],
    [m.short_bio_km, m.short_bio_en],
  ];
  return pairs.some(([km, en]) => Boolean(km) !== Boolean(en));
}

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  await requireAdmin();
  const { created } = await searchParams;
  const supabase = createServiceClient();

  const [{ data: membersRaw, error }, { data: sectionsRaw }] = await Promise.all([
    supabase
      .from("team_members_with_email")
      .select("*")
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("team_sections")
      .select("*")
      .order("display_order", { ascending: true }),
  ]);

  const members  = (membersRaw  ?? []) as TeamMemberRow[];
  const sections = (sectionsRaw ?? []) as TeamSection[];

  const publishedCount   = members.filter((m) => m.is_published).length;
  const draftCount       = members.length - publishedCount;
  const missingPhoto     = members.filter((m) => !m.photo_url).length;
  const translationGaps  = members.filter(hasTranslationGap).length;

  const stats = [
    { label: "Total members",  value: members.length,  icon: Users,      tone: "text-blue-600 bg-blue-50" },
    { label: "Published",      value: publishedCount,  icon: Eye,        tone: "text-emerald-600 bg-emerald-50" },
    { label: "Drafts",         value: draftCount,      icon: EyeOff,     tone: "text-amber-600 bg-amber-50" },
    { label: "Sections",       value: sections.length, icon: LayoutGrid, tone: "text-violet-600 bg-violet-50" },
    { label: "Missing photo",  value: missingPhoto,    icon: ImageOff,   tone: "text-rose-600 bg-rose-50" },
    { label: "Translation gaps", value: translationGaps, icon: Languages, tone: "text-cyan-700 bg-cyan-50" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-heading">Team Management</h1>
          <p className="mt-0.5 text-sm text-text-muted">
            Manage the people shown on the public Library Team page
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/about/team"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-divider bg-bg-surface px-3.5 py-2 text-sm font-semibold text-text-body transition hover:bg-paper"
          >
            <ExternalLink className="h-4 w-4" />
            View public page
          </a>
          <Link
            href="/admin/team/sections"
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-divider bg-bg-surface px-3.5 py-2 text-sm font-semibold text-text-body transition hover:bg-paper"
          >
            <FolderOpen className="h-4 w-4" />
            Manage sections
          </Link>
          <Link
            href="/admin/team/new"
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand"
          >
            <UserPlus className="h-4 w-4" />
            Add member
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-xl border border-divider bg-bg-surface px-4 py-3 shadow-sm"
          >
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone}`}>
              <Icon className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-tight text-text-heading">{value}</p>
              <p className="truncate text-xs text-text-muted">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {created && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <strong>{created}</strong> was added to the team.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <strong>Database error:</strong> {error.message}
        </div>
      )}

      <TeamClient members={members} sections={sections} />
    </div>
  );
}
