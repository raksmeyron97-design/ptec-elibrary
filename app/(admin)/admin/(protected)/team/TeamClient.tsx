"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  Pencil, Trash2, ChevronUp, ChevronDown, UserCircle, Mail, Users,
  Search, X, Check, Star, Copy, FolderInput, Eye, EyeOff,
} from "lucide-react";
import {
  deleteTeamMember, reorderTeamMember, toggleTeamMemberPublished,
  duplicateTeamMember, bulkSetPublished, bulkMoveToSection, bulkDeleteMembers,
} from "./actions";
import type { TeamMemberRow, TeamSection, ActionResult } from "./actions";

type Group = { section: TeamSection | null; members: TeamMemberRow[] };

type StatusFilter = "all" | "published" | "draft";
type GapFilter = "all" | "no-photo" | "no-bio" | "no-en" | "no-km";
type SortKey = "order" | "name" | "updated" | "section";

const GAP_OPTIONS: { value: GapFilter; label: string }[] = [
  { value: "all",      label: "All completeness" },
  { value: "no-photo", label: "Missing photo" },
  { value: "no-bio",   label: "Missing bio" },
  { value: "no-en",    label: "Missing English text" },
  { value: "no-km",    label: "Missing Khmer text" },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "order",   label: "Display order" },
  { value: "name",    label: "Name A–Z" },
  { value: "updated", label: "Recently updated" },
  { value: "section", label: "Section" },
];

function matchesGap(m: TeamMemberRow, gap: GapFilter): boolean {
  switch (gap) {
    case "no-photo": return !m.photo_url;
    case "no-bio":   return !m.bio_km && !m.bio_en && !m.short_bio_km && !m.short_bio_en;
    case "no-en":    return !m.position_en || (!m.bio_en && !!m.bio_km);
    case "no-km":    return !m.position_km || (!m.bio_km && !!m.bio_en);
    default:         return true;
  }
}

export default function TeamClient({
  members,
  sections,
}: {
  members: TeamMemberRow[];
  sections: TeamSection[];
}) {
  const router = useRouter();
  const [list, setList]              = useState(members);
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId]          = useState<string | null>(null);
  const [collapsed, setCollapsed]    = useState<Record<string, boolean>>({});
  const [error, setError]            = useState<string | null>(null);
  const [selected, setSelected]      = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState<"delete" | null>(null);
  const [bulkMoveTarget, setBulkMoveTarget] = useState("");

  // Keep local list in sync after router.refresh()
  const [prevMembers, setPrevMembers] = useState(members);
  if (prevMembers !== members) {
    setPrevMembers(members);
    setList(members);
  }

  // Toolbar filters
  const [query, setQuery]                 = useState("");
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter]   = useState<StatusFilter>("all");
  const [gapFilter, setGapFilter]         = useState<GapFilter>("all");
  const [sortKey, setSortKey]             = useState<SortKey>("order");

  const isFiltering =
    query.trim() !== "" || sectionFilter !== "all" || statusFilter !== "all" || gapFilter !== "all";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = list.filter((m) => {
      if (statusFilter === "published" && !m.is_published) return false;
      if (statusFilter === "draft" && m.is_published) return false;
      if (sectionFilter === "unsectioned" && m.section_id) return false;
      if (sectionFilter !== "all" && sectionFilter !== "unsectioned" && m.section_id !== sectionFilter) return false;
      if (!matchesGap(m, gapFilter)) return false;
      if (!q) return true;
      return [m.name_en, m.name_km, m.position_en, m.position_km, m.user_email, m.section_name_en]
        .some((v) => v?.toLowerCase().includes(q));
    });

    if (sortKey === "name") {
      return [...result].sort((a, b) => a.name_en.localeCompare(b.name_en));
    }
    if (sortKey === "updated") {
      return [...result].sort((a, b) =>
        (b.updated_at ?? b.created_at).localeCompare(a.updated_at ?? a.created_at)
      );
    }
    if (sortKey === "section") {
      return [...result].sort((a, b) =>
        (a.section_name_en ?? "￿").localeCompare(b.section_name_en ?? "￿")
      );
    }
    return result;
  }, [list, query, sectionFilter, statusFilter, gapFilter, sortKey]);

  // Grouped view only makes sense in display order; other sorts show a flat list.
  const grouped = sortKey === "order";
  const groups: Group[] = grouped
    ? [
        ...sections
          .map((s) => ({ section: s, members: filtered.filter((m) => m.section_id === s.id) }))
          .filter((g) => g.members.length > 0 || !isFiltering),
        ...(filtered.some((m) => !m.section_id)
          ? [{ section: null, members: filtered.filter((m) => !m.section_id) }]
          : []),
      ]
    : [{ section: null, members: filtered }];

  function toggleSection(key: string) {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function runAction(id: string | null, action: () => Promise<ActionResult>, onSuccess?: () => void) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const result = await action();
      setBusyId(null);
      if ("error" in result) {
        setError(result.error);
      } else {
        onSuccess?.();
        router.refresh();
      }
    });
  }

  function handleTogglePublish(id: string, next: boolean) {
    setList((prev) => prev.map((m) => (m.id === id ? { ...m, is_published: next } : m)));
    setError(null);
    startTransition(async () => {
      const result = await toggleTeamMemberPublished(id, next);
      if ("error" in result) {
        setList((prev) => prev.map((m) => (m.id === id ? { ...m, is_published: !next } : m)));
        setError(result.error);
      }
    });
  }

  function handleReorder(id: string, direction: "up" | "down", sectionMembers: TeamMemberRow[]) {
    startTransition(async () => {
      await reorderTeamMember(id, direction);
      setList((prev) => {
        const arr = [...prev];
        const globalIdx = arr.findIndex((m) => m.id === id);
        if (globalIdx === -1) return arr;
        const sectionIdx = sectionMembers.findIndex((m) => m.id === id);
        const swapSectionIdx = direction === "up" ? sectionIdx - 1 : sectionIdx + 1;
        if (swapSectionIdx < 0 || swapSectionIdx >= sectionMembers.length) return arr;
        const swapGlobalIdx = arr.findIndex((m) => m.id === sectionMembers[swapSectionIdx].id);
        if (swapGlobalIdx === -1) return arr;
        [arr[globalIdx], arr[swapGlobalIdx]] = [arr[swapGlobalIdx], arr[globalIdx]];
        return arr;
      });
    });
  }

  // ── Selection & bulk ──────────────────────────────────────────
  const allVisibleSelected = filtered.length > 0 && filtered.every((m) => selected.has(m.id));

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected(allVisibleSelected ? new Set() : new Set(filtered.map((m) => m.id)));
  }

  function runBulk(action: () => Promise<ActionResult>) {
    runAction(null, action, () => {
      setSelected(new Set());
      setBulkConfirm(null);
      setBulkMoveTarget("");
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
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, role, section, email…"
            aria-label="Search team members"
            className="h-10 w-full rounded-lg border border-divider bg-bg-surface pl-9 pr-8 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer rounded p-0.5 text-text-muted transition hover:text-text-body"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <select
          value={sectionFilter}
          onChange={(e) => setSectionFilter(e.target.value)}
          className="h-10 cursor-pointer rounded-lg border border-divider bg-bg-surface px-3 text-sm text-text-body outline-none transition focus:border-brand"
          aria-label="Filter by section"
        >
          <option value="all">All sections</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>{s.name_en}</option>
          ))}
          <option value="unsectioned">Unsectioned</option>
        </select>

        <select
          value={gapFilter}
          onChange={(e) => setGapFilter(e.target.value as GapFilter)}
          className="h-10 cursor-pointer rounded-lg border border-divider bg-bg-surface px-3 text-sm text-text-body outline-none transition focus:border-brand"
          aria-label="Filter by content completeness"
        >
          {GAP_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="h-10 cursor-pointer rounded-lg border border-divider bg-bg-surface px-3 text-sm text-text-body outline-none transition focus:border-brand"
          aria-label="Sort members"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>Sort: {o.label}</option>
          ))}
        </select>

        <div className="flex overflow-hidden rounded-lg border border-divider" role="group" aria-label="Filter by status">
          {(["all", "published", "draft"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setStatusFilter(v)}
              className={`cursor-pointer px-3.5 py-2 text-sm font-medium capitalize transition ${
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

      {error && (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss error" className="cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Bulk action bar ──────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-divider bg-bg-surface px-4 py-2.5 shadow-sm">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-text-body">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleSelectAll}
            className="h-4 w-4 cursor-pointer accent-blue-800"
            aria-label="Select all visible members"
          />
          {selected.size > 0 ? `${selected.size} selected` : "Select all"}
        </label>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => runBulk(() => bulkSetPublished([...selected], true))}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
            >
              <Eye className="h-3.5 w-3.5" /> Publish
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => runBulk(() => bulkSetPublished([...selected], false))}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-50 disabled:opacity-50"
            >
              <EyeOff className="h-3.5 w-3.5" /> Unpublish
            </button>

            <div className="flex items-center gap-1">
              <FolderInput className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
              <select
                value={bulkMoveTarget}
                onChange={(e) => setBulkMoveTarget(e.target.value)}
                className="h-8 cursor-pointer rounded-lg border border-divider bg-bg-surface px-2 text-xs text-text-body outline-none focus:border-brand"
                aria-label="Move selected members to section"
              >
                <option value="">Move to section…</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>{s.name_en}</option>
                ))}
                <option value="__none__">No section</option>
              </select>
              {bulkMoveTarget && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() =>
                    runBulk(() =>
                      bulkMoveToSection([...selected], bulkMoveTarget === "__none__" ? null : bulkMoveTarget)
                    )
                  }
                  className="cursor-pointer rounded-lg bg-blue-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand disabled:opacity-50"
                >
                  Move
                </button>
              )}
            </div>

            {bulkConfirm === "delete" ? (
              <span className="inline-flex items-center gap-1.5 text-xs">
                <span className="font-semibold text-red-700">Delete {selected.size} member{selected.size === 1 ? "" : "s"}?</span>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => runBulk(() => bulkDeleteMembers([...selected]))}
                  className="cursor-pointer rounded-lg bg-red-600 px-2.5 py-1.5 font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                >
                  Confirm delete
                </button>
                <button
                  type="button"
                  onClick={() => setBulkConfirm(null)}
                  className="cursor-pointer rounded-lg border border-divider px-2.5 py-1.5 font-semibold text-text-body transition hover:bg-paper"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                disabled={isPending}
                onClick={() => setBulkConfirm("delete")}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── List ─────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-divider py-16 text-center">
          <Search className="mx-auto mb-3 h-10 w-10 text-text-muted/40" />
          <p className="text-sm font-semibold text-text-body">No members match your filters</p>
          <button
            type="button"
            onClick={() => { setQuery(""); setSectionFilter("all"); setStatusFilter("all"); setGapFilter("all"); }}
            className="mt-3 cursor-pointer rounded-lg border border-divider px-3.5 py-1.5 text-sm font-semibold text-text-body transition hover:bg-paper"
          >
            Clear filters
          </button>
        </div>
      ) : (
        groups.map(({ section, members: sMembers }) => {
          const key = section?.id ?? (grouped ? "unsectioned" : "flat");
          const isCollapsed = grouped && (collapsed[key] ?? false);
          const hue = section
            ? (sections.findIndex((s) => s.id === section.id) * 47) % 360
            : null;

          return (
            <div key={key} className="overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm">

              {/* Section header (grouped view only) */}
              {grouped && (
                <button
                  type="button"
                  onClick={() => toggleSection(key)}
                  className="flex w-full cursor-pointer items-center justify-between px-5 py-3.5 transition hover:bg-paper"
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
                          <span className="font-kh text-sm font-bold text-text-heading">{section.name_km}</span>
                          <span className="mx-2 text-text-muted">·</span>
                          <span className="text-sm font-semibold text-text-heading">{section.name_en}</span>
                          {section.is_active === false && (
                            <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                              Hidden
                            </span>
                          )}
                          {section.description_en && (
                            <p className="mt-0.5 truncate text-xs text-text-muted">{section.description_en}</p>
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
              )}

              {!isCollapsed && (
                sMembers.length === 0 ? (
                  <div className="border-t border-divider px-5 py-6 text-center text-sm text-text-muted">
                    No members in this section yet.
                  </div>
                ) : (
                  <div className={`divide-y divide-divider ${grouped ? "border-t border-divider" : ""}`}>
                    {sMembers.map((member, idx) => (
                      <MemberRow
                        key={member.id}
                        member={member}
                        idx={idx}
                        total={sMembers.length}
                        canReorder={grouped && !isFiltering}
                        isBusy={busyId === member.id}
                        isPending={isPending}
                        isSelected={selected.has(member.id)}
                        onSelect={() => toggleSelect(member.id)}
                        onDelete={() => runAction(member.id, () => deleteTeamMember(member.id))}
                        onDuplicate={() => runAction(member.id, () => duplicateTeamMember(member.id))}
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
  member, idx, total, canReorder, isBusy, isPending, isSelected,
  onSelect, onDelete, onDuplicate, onTogglePublish, onReorder,
}: {
  member: TeamMemberRow;
  idx: number;
  total: number;
  canReorder: boolean;
  isBusy: boolean;
  isPending: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onTogglePublish: (next: boolean) => void;
  onReorder: (dir: "up" | "down") => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 transition sm:flex-nowrap ${
        isBusy ? "pointer-events-none opacity-40" : ""
      } ${!member.is_published ? "opacity-60" : ""} ${isSelected ? "bg-blue-50/50" : "hover:bg-paper/50"}`}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onSelect}
        className="h-4 w-4 shrink-0 cursor-pointer accent-blue-800"
        aria-label={`Select ${member.name_en}`}
      />

      {/* Photo */}
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-divider bg-paper">
        {member.photo_url ? (
          <Image
            src={member.photo_url}
            alt={member.photo_alt ?? member.name_en}
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
          {member.is_featured && (
            <span title="Featured — shown in Key Contacts" aria-label="Featured member">
              <Star className="h-3.5 w-3.5 fill-current text-amber-500" />
            </span>
          )}
          {!member.is_published && (
            <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-yellow-700">
              Draft
            </span>
          )}
          {!member.photo_url && (
            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-500">
              No photo
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

      {/* Reorder within section — hidden while filtering/sorting */}
      {canReorder && (
        <div className="flex shrink-0 flex-col gap-0.5">
          <button
            type="button"
            onClick={() => onReorder("up")}
            disabled={isPending || idx === 0}
            className="cursor-pointer rounded p-1 text-text-muted transition hover:bg-paper hover:text-text-body disabled:cursor-not-allowed disabled:opacity-25"
            aria-label={`Move ${member.name_en} up`}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onReorder("down")}
            disabled={isPending || idx === total - 1}
            className="cursor-pointer rounded p-1 text-text-muted transition hover:bg-paper hover:text-text-body disabled:cursor-not-allowed disabled:opacity-25"
            aria-label={`Move ${member.name_en} down`}
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
        aria-label={member.is_published ? `Unpublish ${member.name_en}` : `Publish ${member.name_en}`}
        title={member.is_published ? "Published — click to unpublish" : "Draft — click to publish"}
        onClick={() => onTogglePublish(!member.is_published)}
        disabled={isPending}
        className={`relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors disabled:cursor-not-allowed ${
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
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-divider px-3 py-1.5 text-xs font-semibold text-text-body transition hover:bg-paper"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Link>
        <button
          type="button"
          onClick={onDuplicate}
          disabled={isPending}
          title="Duplicate as draft"
          className="cursor-pointer rounded-lg border border-divider p-1.5 text-text-muted transition hover:bg-paper hover:text-text-body disabled:opacity-50"
          aria-label={`Duplicate ${member.name_en}`}
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        {confirming ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => { setConfirming(false); onDelete(); }}
              disabled={isPending}
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="cursor-pointer rounded-lg border border-divider p-1.5 text-text-muted transition hover:bg-paper"
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
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
