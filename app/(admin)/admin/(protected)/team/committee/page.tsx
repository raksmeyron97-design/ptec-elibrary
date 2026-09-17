import Link from "next/link";
import { ExternalLink, FolderOpen, Eye, EyeOff, LayoutGrid, UsersRound } from "lucide-react";

import { createServiceClient } from "@/lib/supabase/server";
import { requireRouteAccess } from "@/lib/admin/route-guard";
import TeamWorkspaceTabs from "../_components/TeamWorkspaceTabs";
import CommitteeClient from "./_components/CommitteeClient";
import type {
  CommitteeCandidate,
  CommitteeMemberRow,
  CommitteeSectionRow,
} from "./actions";

/**
 * Library Committee management.
 *
 * READ opens the roster and its health counts — who is seated, who is still a
 * draft, which groupings exist — which is what an editor checks before asking
 * someone to fix them. Seating, editing, ordering, publishing and removing are
 * `users: write`, checked per action in ./actions.ts.
 *
 * The seat rows and the person rows are fetched SEPARATELY and joined here
 * rather than through a PostgREST embed. Two reads of a few dozen rows each is
 * cheaper than it looks, and the second one is the candidate list the "add"
 * dialog needs anyway — an embed would have meant fetching the people twice.
 */
export default async function CommitteePage() {
  const { can } = await requireRouteAccess("team.committee");
  /* Only the section-management LINK is decided here. Every control inside the
     roster asks the registry for itself through `useCan` — a control four
     components down that had to be handed a prop is a control someone
     eventually forgets to hand it to. */
  const canManageSections = can("team.committee.sections");

  const supabase = createServiceClient();

  const [{ data: seatRows, error }, { data: sectionRows }, { data: peopleRows }] =
    await Promise.all([
      supabase
        .from("committee_members")
        .select("*")
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("committee_sections")
        .select("*")
        .order("display_order", { ascending: true }),
      supabase
        .from("team_members")
        .select(
          "id,name_km,name_en,position_km,position_en,photo_url,photo_alt,slug,is_published",
        )
        .order("display_order", { ascending: true })
        .order("name_en", { ascending: true }),
    ]);

  type PersonRow = NonNullable<CommitteeMemberRow["person"]>;
  const people = (peopleRows ?? []) as PersonRow[];
  const byId = new Map(people.map((p) => [p.id, p]));

  const sections = (sectionRows ?? []) as CommitteeSectionRow[];
  const seats: CommitteeMemberRow[] = (
    (seatRows ?? []) as Omit<CommitteeMemberRow, "person">[]
  ).map((seat) => ({ ...seat, person: byId.get(seat.team_member_id) ?? null }));

  const seated = new Set(seats.map((s) => s.team_member_id));
  const candidates: CommitteeCandidate[] = people.map((p) => ({
    id: p.id,
    name_km: p.name_km,
    name_en: p.name_en,
    position_km: p.position_km,
    position_en: p.position_en,
    photo_url: p.photo_url,
    photo_alt: p.photo_alt,
    is_published: p.is_published,
    onCommittee: seated.has(p.id),
  }));

  const publishedCount = seats.filter((s) => s.is_published).length;

  /* Every figure is a count of rows this page is holding. There is no
     "3 departments" here that nothing can produce. */
  const stats = [
    { label: "Committee members", value: seats.length, icon: UsersRound, tone: "text-blue-600 bg-blue-50" },
    { label: "Published", value: publishedCount, icon: Eye, tone: "text-emerald-600 bg-emerald-50" },
    { label: "Drafts", value: seats.length - publishedCount, icon: EyeOff, tone: "text-amber-600 bg-amber-50" },
    { label: "Sections", value: sections.length, icon: LayoutGrid, tone: "text-violet-600 bg-violet-50" },
  ];

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-heading">Team Management</h1>
          <p className="mt-0.5 text-sm text-text-muted">
            The Library Committee is a role given to people who already exist in the team
            directory — adding someone here never creates a second profile.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/about/committee"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-divider bg-bg-surface px-3.5 py-2 text-sm font-semibold text-text-body transition hover:bg-paper"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            View public page
          </a>
          {canManageSections && (
            <Link
              href="/admin/team/committee/sections"
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-divider bg-bg-surface px-3.5 py-2 text-sm font-semibold text-text-body transition hover:bg-paper"
            >
              <FolderOpen className="h-4 w-4" aria-hidden="true" />
              Manage sections
            </Link>
          )}
        </div>
      </div>

      <TeamWorkspaceTabs current="committee" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-xl border border-divider bg-bg-surface px-4 py-3 shadow-sm"
          >
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone}`}>
              <Icon className="h-4.5 w-4.5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-tight text-text-heading">{value}</p>
              <p className="truncate text-xs text-text-muted">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <strong>Database error:</strong> {error.message}
          {/^(42P01|PGRST205)$/.test(error.code ?? "") && (
            <> — apply migration 0150 to enable committee management.</>
          )}
        </div>
      )}

      <CommitteeClient seats={seats} sections={sections} candidates={candidates} />
    </div>
  );
}
