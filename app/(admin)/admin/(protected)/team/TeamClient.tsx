"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Pencil, Trash2, ChevronUp, ChevronDown,
  Eye, EyeOff, UserCircle, Mail, Users,
} from "lucide-react";
import { deleteTeamMember, reorderTeamMember } from "./actions";
import type { TeamMemberRow, TeamSection } from "./actions";

type Group = {
  section: TeamSection | null;
  members: TeamMemberRow[];
};

export default function TeamClient({
  members,
  sections,
}: {
  members: TeamMemberRow[];
  sections: TeamSection[];
}) {
  const [list, setList]             = useState(members);
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Track which sections are collapsed
  const [collapsed, setCollapsed]   = useState<Record<string, boolean>>({});

  // Build grouped structure
  const groups: Group[] = sections.map((s) => ({
    section: s,
    members: list.filter((m) => m.section_id === s.id),
  })).filter((g) => g.members.length > 0);

  const unsectioned = list.filter((m) => !m.section_id);
  if (unsectioned.length > 0) {
    groups.push({ section: null, members: unsectioned });
  }

  function toggleSection(key: string) {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleDelete(id: string, name: string) {
    if (!confirm(`Remove "${name}" from the team?`)) return;
    setDeletingId(id);
    startTransition(async () => {
      await deleteTeamMember(id);
      setList((prev) => prev.filter((m) => m.id !== id));
      setDeletingId(null);
    });
  }

  function handleReorder(id: string, direction: "up" | "down", sectionMembers: TeamMemberRow[]) {
    startTransition(async () => {
      await reorderTeamMember(id, direction);
      // Optimistic reorder within same section
      setList((prev) => {
        const arr = [...prev];
        const globalIdx = arr.findIndex((m) => m.id === id);
        if (globalIdx === -1) return arr;

        const sectionIdx = sectionMembers.findIndex((m) => m.id === id);
        const swapSectionIdx = direction === "up" ? sectionIdx - 1 : sectionIdx + 1;
        if (swapSectionIdx < 0 || swapSectionIdx >= sectionMembers.length) return arr;

        const swapId = sectionMembers[swapSectionIdx].id;
        const swapGlobalIdx = arr.findIndex((m) => m.id === swapId);
        if (swapGlobalIdx === -1) return arr;

        [arr[globalIdx], arr[swapGlobalIdx]] = [arr[swapGlobalIdx], arr[globalIdx]];
        return arr;
      });
    });
  }

  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-divider py-20 text-center">
        <UserCircle className="mx-auto mb-4 h-14 w-14 text-text-muted/40" />
        <p className="text-base font-semibold text-text-body">No team members yet</p>
        <p className="mt-1 text-sm text-text-muted">Add the first member using the button above.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map(({ section, members: sMembers }) => {
        const key        = section?.id ?? "unsectioned";
        const isCollapsed = collapsed[key] ?? false;

        return (
          <div key={key} className="rounded-2xl border border-divider bg-bg-surface shadow-sm overflow-hidden">

            {/* ── Section header ────────────────────────────────── */}
            <button
              type="button"
              onClick={() => toggleSection(key)}
              className="flex w-full items-center justify-between px-5 py-3.5 cursor-pointer transition hover:bg-paper"
            >
              <div className="flex items-center gap-3 min-w-0">
                {/* Colour dot per section index */}
                <div
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{
                    background: section
                      ? `hsl(${(sections.findIndex((s) => s.id === section.id) * 47) % 360} 65% 50%)`
                      : "#94a3b8",
                  }}
                />
                <div className="text-left min-w-0">
                  {section ? (
                    <>
                      <span className="font-kh font-bold text-text-heading text-sm">
                        {section.name_km}
                      </span>
                      <span className="mx-2 text-text-muted">·</span>
                      <span className="font-semibold text-text-heading text-sm">
                        {section.name_en}
                      </span>
                    </>
                  ) : (
                    <span className="font-semibold text-text-heading text-sm">Unsectioned</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="flex items-center gap-1.5 rounded-full bg-paper border border-divider px-2.5 py-0.5 text-xs font-semibold text-text-muted">
                  <Users className="h-3 w-3" />
                  {sMembers.length}
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-text-muted transition-transform duration-200 ${isCollapsed ? "" : "rotate-180"}`}
                />
              </div>
            </button>

            {/* ── Members list ──────────────────────────────────── */}
            {!isCollapsed && (
              <div className="divide-y divide-divider border-t border-divider">
                {sMembers.map((member, idx) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    idx={idx}
                    total={sMembers.length}
                    isDeleting={deletingId === member.id}
                    isPending={isPending}
                    onDelete={() => handleDelete(member.id, member.name_en)}
                    onReorder={(dir) => handleReorder(member.id, dir, sMembers)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MemberRow({
  member,
  idx,
  total,
  isDeleting,
  isPending,
  onDelete,
  onReorder,
}: {
  member: TeamMemberRow;
  idx: number;
  total: number;
  isDeleting: boolean;
  isPending: boolean;
  onDelete: () => void;
  onReorder: (dir: "up" | "down") => void;
}) {
  return (
    <div
      className={`flex items-center gap-4 px-5 py-3.5 transition ${
        isDeleting ? "opacity-40 pointer-events-none" : ""
      } ${!member.is_published ? "opacity-60" : ""} hover:bg-paper/50`}
    >
      {/* Photo */}
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-divider bg-paper">
        {member.photo_url ? (
          <Image
            src={member.photo_url}
            alt={member.name_en}
            width={48}
            height={48}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ background: "linear-gradient(135deg,#1E3A8A,#4f46e5)" }}
          >
            <span className="text-base font-bold text-white select-none">
              {member.name_en.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-text-heading truncate">{member.name_en}</p>
          {member.name_km && (
            <span className="font-kh text-sm text-text-muted">{member.name_km}</span>
          )}
          {!member.is_published && (
            <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-yellow-700">
              Draft
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          {member.position_en && (
            <span className="text-xs text-text-muted">{member.position_en}</span>
          )}
          {member.user_email && (
            <span className="flex items-center gap-1 text-xs text-text-muted">
              <Mail className="h-3 w-3" />
              {member.user_email}
            </span>
          )}
        </div>
      </div>

      {/* Reorder within section */}
      <div className="flex shrink-0 flex-col gap-0.5">
        <button
          type="button"
          onClick={() => onReorder("up")}
          disabled={isPending || idx === 0}
          className="rounded p-1 text-text-muted transition hover:bg-paper hover:text-text-body disabled:opacity-25 cursor-pointer disabled:cursor-not-allowed"
          aria-label="Move up"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onReorder("down")}
          disabled={isPending || idx === total - 1}
          className="rounded p-1 text-text-muted transition hover:bg-paper hover:text-text-body disabled:opacity-25 cursor-pointer disabled:cursor-not-allowed"
          aria-label="Move down"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Published */}
      <div className="shrink-0">
        {member.is_published
          ? <Eye className="h-4 w-4 text-emerald-500" />
          : <EyeOff className="h-4 w-4 text-text-muted" />
        }
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href={`/admin/team/${member.id}/edit`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-divider px-3 py-1.5 text-xs font-semibold text-text-body transition hover:bg-paper cursor-pointer"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Link>
        <button
          type="button"
          onClick={onDelete}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
      </div>
    </div>
  );
}
