"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Pencil, Trash2, ChevronUp, ChevronDown,
  UserCircle, Mail, Users, Search, X, Check,
} from "lucide-react";
import { deleteTeamMember, reorderTeamMember, toggleTeamMemberPublished } from "./actions";
import type { TeamMemberRow, TeamSection } from "./actions";

type Group = {
  section: TeamSection | null;
  members: TeamMemberRow[];
};

type StatusFilter = "all" | "published" | "draft";

export default function TeamClient({
  members,
  sections,
}: {
  members: TeamMemberRow[];
  sections: TeamSection[];
}) {
  const [list, setList]              = useState(members);
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId]  = useState<string | null>(null);
  const [collapsed, setCollapsed]    = useState<Record<string, boolean>>({});

  // Toolbar filters
  const [query, setQuery]                 = useState("");
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter]   = useState<StatusFilter>("all");

  const isFiltering = query.trim() !== "" || sectionFilter !== "all" || statusFilter !== "all";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((m) => {
      if (statusFilter === "published" && !m.is_published) return false;
      if (statusFilter === "draft" && m.is_published) return false;
      if (sectionFilter === "unsectioned" && m.section_id) return false;
      if (sectionFilter !== "all" && sectionFilter !== "unsectioned" && m.section_id !== sectionFilter) return false;
      if (!q) return true;
      return [m.name_en, m.name_km, m.position_en, m.position_km, m.user_email]
        .some((v) => v?.toLowerCase().includes(q));
    });
  }, [list, query, sectionFilter, statusFilter]);

  // Build grouped structure — keep empty sections visible when not filtering
  const groups: Group[] = sections
    .map((s) => ({
      section: s,
      members: filtered.filter((m) => m.section_id === s.id),
    }))
    .filter((g) => g.members.length > 0 || !isFiltering);

  const unsectioned = filtered.filter((m) => !m.section_id);
  if (unsectioned.length > 0) {
    groups.push({ section: null, members: unsectioned });
  }

  function toggleSection(key: string) {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleDelete(id: string) {
    setDeletingId(id);
    startTransition(async () => {
      await deleteTeamMember(id);
      setList((prev) => prev.filter((m) => m.id !== id));
      setDeletingId(null);
    });
  }

  function handleTogglePublish(id: string, next: boolean) {
    // Optimistic flip
    setList((prev) => prev.map((m) => (m.id === id ? { ...m, is_published: next } : m)));
    startTransition(async () => {
      try {
        await toggleTeamMemberPublished(id, next);
      } catch {
        setList((prev) => prev.map((m) => (m.id === id ? { ...m, is_published: !next } : m)));
      }
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

      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, position or email…"
            className="h-10 w-full rounded-lg border border-divider bg-bg-surface pl-9 pr-8 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-muted transition hover:text-text-body cursor-pointer"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <select
          value={sectionFilter}
          onChange={(e) => setSectionFilter(e.target.value)}
          className="h-10 rounded-lg border border-divider bg-bg-surface px-3 text-sm text-text-body outline-none transition focus:border-brand cursor-pointer"
          aria-label="Filter by section"
        >
          <option value="all">All sections</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>{s.name_en}</option>
          ))}
          <option value="unsectioned">Unsectioned</option>
        </select>

        <div className="flex overflow-hidden rounded-lg border border-divider" role="group" aria-label="Filter by status">
          {(["all", "published", "draft"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setStatusFilter(v)}
              className={`px-3.5 py-2 text-sm font-medium capitalize transition cursor-pointer ${
                statusFilter === v
                  ? "bg-blue-950 text-white"
                  : "bg-bg-surface text-text-muted hover:bg-paper hover:text-text-body"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* ── Filter result summary / empty ────────────────────── */}
      {isFiltering && filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-divider py-16 text-center">
          <Search className="mx-auto mb-3 h-10 w-10 text-text-muted/40" />
          <p className="text-sm font-semibold text-text-body">No members match your filters</p>
          <button
            type="button"
            onClick={() => { setQuery(""); setSectionFilter("all"); setStatusFilter("all"); }}
            className="mt-3 rounded-lg border border-divider px-3.5 py-1.5 text-sm font-semibold text-text-body transition hover:bg-paper cursor-pointer"
          >
            Clear filters
          </button>
        </div>
      ) : (
        groups.map(({ section, members: sMembers }) => {
          const key         = section?.id ?? "unsectioned";
          const isCollapsed = collapsed[key] ?? false;
          const hue         = section
            ? (sections.findIndex((s) => s.id === section.id) * 47) % 360
            : null;

          return (
            <div key={key} className="overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm">

              {/* ── Section header ────────────────────────────── */}
              <button
                type="button"
                onClick={() => toggleSection(key)}
                className="flex w-full items-center justify-between px-5 py-3.5 cursor-pointer transition hover:bg-paper"
                aria-expanded={!isCollapsed}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ background: hue !== null ? `hsl(${hue} 65% 50%)` : "#94a3b8" }}
                  />
                  <div className="min-w-0 text-left">
                    {section ? (
                      <>
                        <span className="font-kh text-sm font-bold text-text-heading">
                          {section.name_km}
                        </span>
                        <span className="mx-2 text-text-muted">·</span>
                        <span className="text-sm font-semibold text-text-heading">
                          {section.name_en}
                        </span>
                        {section.description_en && (
                          <p className="mt-0.5 truncate text-xs text-text-muted">
                            {section.description_en}
                          </p>
                        )}
                      </>
                    ) : (
                      <span className="text-sm font-semibold text-text-heading">Unsectioned</span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <span className="flex items-center gap-1.5 rounded-full border border-divider bg-paper px-2.5 py-0.5 text-xs font-semibold text-text-muted">
                    <Users className="h-3 w-3" />
                    {sMembers.length}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-text-muted transition-transform duration-200 ${isCollapsed ? "" : "rotate-180"}`}
                  />
                </div>
              </button>

              {/* ── Members list ──────────────────────────────── */}
              {!isCollapsed && (
                sMembers.length === 0 ? (
                  <div className="border-t border-divider px-5 py-6 text-center text-sm text-text-muted">
                    No members in this section yet.
                  </div>
                ) : (
                  <div className="divide-y divide-divider border-t border-divider">
                    {sMembers.map((member, idx) => (
                      <MemberRow
                        key={member.id}
                        member={member}
                        idx={idx}
                        total={sMembers.length}
                        canReorder={!isFiltering}
                        isDeleting={deletingId === member.id}
                        isPending={isPending}
                        onDelete={() => handleDelete(member.id)}
                        onTogglePublish={(next) => handleTogglePublish(member.id, next)}
                        onReorder={(dir) => handleReorder(member.id, dir, sMembers)}
                      />
                    ))}
                  </div>
                )
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function MemberRow({
  member,
  idx,
  total,
  canReorder,
  isDeleting,
  isPending,
  onDelete,
  onTogglePublish,
  onReorder,
}: {
  member: TeamMemberRow;
  idx: number;
  total: number;
  canReorder: boolean;
  isDeleting: boolean;
  isPending: boolean;
  onDelete: () => void;
  onTogglePublish: (next: boolean) => void;
  onReorder: (dir: "up" | "down") => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 transition sm:flex-nowrap ${
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
            unoptimized={true}
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ background: "linear-gradient(135deg,#1E3A8A,#4f46e5)" }}
          >
            <span className="select-none text-base font-bold text-white">
              {member.name_en.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-semibold text-text-heading">{member.name_en}</p>
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

      {/* Reorder within section — hidden while filtering (order is section-wide) */}
      {canReorder && (
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
      )}

      {/* Publish toggle */}
      <button
        type="button"
        role="switch"
        aria-checked={member.is_published}
        aria-label={member.is_published ? "Unpublish member" : "Publish member"}
        title={member.is_published ? "Published — click to unpublish" : "Draft — click to publish"}
        onClick={() => onTogglePublish(!member.is_published)}
        disabled={isPending}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors cursor-pointer disabled:cursor-not-allowed ${
          member.is_published ? "bg-emerald-500" : "bg-divider"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
            member.is_published ? "left-[18px]" : "left-0.5"
          }`}
        />
      </button>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href={`/admin/team/${member.id}/edit`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-divider px-3 py-1.5 text-xs font-semibold text-text-body transition hover:bg-paper cursor-pointer"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Link>
        {confirming ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => { setConfirming(false); onDelete(); }}
              disabled={isPending}
              className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 cursor-pointer disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-divider p-1.5 text-text-muted transition hover:bg-paper cursor-pointer"
              aria-label="Cancel delete"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
