"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createTeamSection, updateTeamSection, deleteTeamSection,
  reorderTeamSection, toggleSectionActive,
} from "../actions";
import type { TeamSection, ActionResult } from "../actions";
import {
  Trash2, Plus, Pencil, ChevronUp, ChevronDown, Users, FolderOpen,
  X, Search, Eye, EyeOff, AlertTriangle,
} from "lucide-react";

export default function SectionsClient({
  sections,
  memberCounts,
}: {
  sections: TeamSection[];
  memberCounts: Record<string, number>;
}) {
  const router = useRouter();
  const [list, setList]              = useState(sections);
  const [isPending, startTransition] = useTransition();
  const [error, setError]            = useState<string | null>(null);
  const [showForm, setShowForm]      = useState(false);
  const [editingId, setEditingId]    = useState<string | null>(null);
  const [deletingId, setDeletingId]  = useState<string | null>(null);
  const [query, setQuery]            = useState("");

  // Keep local list in sync after router.refresh()
  const [prevSections, setPrevSections] = useState(sections);
  if (prevSections !== sections) {
    setPrevSections(sections);
    setList(sections);
  }

  const totalMembers = Object.values(memberCounts).reduce((a, b) => a + b, 0);
  const hiddenCount = list.filter((s) => s.is_active === false).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((s) =>
      [s.name_en, s.name_km, s.description_en, s.description_km]
        .some((v) => v?.toLowerCase().includes(q))
    );
  }, [list, query]);

  const isSearching = query.trim() !== "";

  function run(action: () => Promise<ActionResult>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        setError(result.error);
      } else {
        onSuccess?.();
        router.refresh();
      }
    });
  }

  function handleReorder(id: string, direction: "up" | "down") {
    // Optimistic swap
    setList((prev) => {
      const arr = [...prev];
      const idx = arr.findIndex((s) => s.id === id);
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (idx === -1 || swapIdx < 0 || swapIdx >= arr.length) return arr;
      [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]];
      return arr;
    });
    startTransition(async () => {
      await reorderTeamSection(id, direction);
      router.refresh();
    });
  }

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    run(() => createTeamSection(data), () => {
      setShowForm(false);
      form.reset();
    });
  }

  function handleUpdate(e: React.FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    run(() => updateTeamSection(id, data), () => setEditingId(null));
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-heading">Team Sections</h1>
          <p className="mt-0.5 text-sm text-text-muted">
            {list.length} section{list.length !== 1 ? "s" : ""} · {totalMembers} member
            {totalMembers !== 1 ? "s" : ""} assigned
            {hiddenCount > 0 ? ` · ${hiddenCount} hidden from the public page` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setShowForm((v) => !v); setEditingId(null); setDeletingId(null); setError(null); }}
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand"
        >
          <Plus className="h-4 w-4" />
          New section
        </button>
      </div>

      {error && (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss error" className="cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Search */}
      {list.length > 3 && (
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sections…"
            aria-label="Search sections"
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
      )}

      {/* Create form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="space-y-4 rounded-xl border border-divider bg-bg-surface p-5 shadow-sm"
        >
          <h3 className="text-sm font-bold text-text-heading">New Section</h3>
          <SectionFields isPending={isPending} />
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={isPending}
              className="h-9 cursor-pointer rounded-lg bg-blue-950 px-4 text-sm font-semibold text-white transition hover:bg-brand disabled:opacity-60"
            >
              {isPending ? "Saving…" : "Create"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="h-9 cursor-pointer rounded-lg border border-divider px-4 text-sm font-semibold text-text-body transition hover:bg-paper"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Section list */}
      <div className="space-y-2">
        {list.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-divider py-16 text-center">
            <FolderOpen className="mx-auto mb-3 h-10 w-10 text-text-muted/40" />
            <p className="text-sm font-semibold text-text-body">No sections yet</p>
            <p className="mt-1 text-sm text-text-muted">
              Create sections to group team members, e.g. “General Management” or “E-Library &amp; Digital”.
            </p>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand"
            >
              <Plus className="h-4 w-4" />
              Create the first section
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-divider py-12 text-center">
            <Search className="mx-auto mb-3 h-8 w-8 text-text-muted/40" />
            <p className="text-sm font-semibold text-text-body">No sections match “{query.trim()}”</p>
            <button
              type="button"
              onClick={() => setQuery("")}
              className="mt-3 cursor-pointer rounded-lg border border-divider px-3.5 py-1.5 text-sm font-semibold text-text-body transition hover:bg-paper"
            >
              Clear search
            </button>
          </div>
        ) : (
          filtered.map((s) => {
            const idx = list.findIndex((x) => x.id === s.id);
            return (
              <SectionRow
                key={s.id}
                section={s}
                hue={(idx * 47) % 360}
                memberCount={memberCounts[s.id] ?? 0}
                otherSections={list.filter((x) => x.id !== s.id)}
                idx={idx}
                total={list.length}
                canReorder={!isSearching}
                isPending={isPending}
                isEditing={editingId === s.id}
                isDeleting={deletingId === s.id}
                onStartEdit={() => { setEditingId(s.id); setShowForm(false); setDeletingId(null); setError(null); }}
                onCancelEdit={() => setEditingId(null)}
                onUpdate={(e) => handleUpdate(e, s.id)}
                onStartDelete={() => { setDeletingId(s.id); setEditingId(null); setError(null); }}
                onCancelDelete={() => setDeletingId(null)}
                onDelete={(options) =>
                  run(() => deleteTeamSection(s.id, options), () => setDeletingId(null))
                }
                onToggleActive={() => run(() => toggleSectionActive(s.id, s.is_active === false))}
                onReorder={(dir) => handleReorder(s.id, dir)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

function SectionRow({
  section: s,
  hue,
  memberCount,
  otherSections,
  idx,
  total,
  canReorder,
  isPending,
  isEditing,
  isDeleting,
  onStartEdit,
  onCancelEdit,
  onUpdate,
  onStartDelete,
  onCancelDelete,
  onDelete,
  onToggleActive,
  onReorder,
}: {
  section: TeamSection;
  hue: number;
  memberCount: number;
  otherSections: TeamSection[];
  idx: number;
  total: number;
  canReorder: boolean;
  isPending: boolean;
  isEditing: boolean;
  isDeleting: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onUpdate: (e: React.FormEvent<HTMLFormElement>) => void;
  onStartDelete: () => void;
  onCancelDelete: () => void;
  onDelete: (options?: { moveMembersTo?: string | null; confirmUnlink?: boolean }) => void;
  onToggleActive: () => void;
  onReorder: (dir: "up" | "down") => void;
}) {
  const [moveTarget, setMoveTarget] = useState("");
  const isHidden = s.is_active === false;

  if (isEditing) {
    return (
      <form
        onSubmit={onUpdate}
        className="space-y-4 rounded-xl border border-brand/40 bg-bg-surface p-5 shadow-sm"
      >
        <h3 className="text-sm font-bold text-text-heading">Edit Section</h3>
        <SectionFields isPending={isPending} defaults={s} />
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="h-9 cursor-pointer rounded-lg bg-blue-950 px-4 text-sm font-semibold text-white transition hover:bg-brand disabled:opacity-60"
          >
            {isPending ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            onClick={onCancelEdit}
            className="h-9 cursor-pointer rounded-lg border border-divider px-4 text-sm font-semibold text-text-body transition hover:bg-paper"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className={`rounded-xl border bg-bg-surface shadow-sm ${isDeleting ? "border-red-300" : "border-divider"}`}>
      <div className={`flex items-center gap-3 px-4 py-3.5 sm:px-5 ${isHidden ? "opacity-60" : ""}`}>

        {/* Reorder */}
        <div className="flex shrink-0 flex-col gap-0.5">
          <button
            type="button"
            onClick={() => onReorder("up")}
            disabled={isPending || !canReorder || idx === 0}
            className="cursor-pointer rounded p-1 text-text-muted transition hover:bg-paper hover:text-text-body disabled:cursor-not-allowed disabled:opacity-25"
            aria-label={`Move ${s.name_en} up`}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onReorder("down")}
            disabled={isPending || !canReorder || idx === total - 1}
            className="cursor-pointer rounded p-1 text-text-muted transition hover:bg-paper hover:text-text-body disabled:cursor-not-allowed disabled:opacity-25"
            aria-label={`Move ${s.name_en} down`}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Colour dot — matches the admin team page grouping colour */}
        <div className="h-3 w-3 shrink-0 rounded-full" style={{ background: `hsl(${hue} 65% 50%)` }} />

        {/* Info */}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-text-heading">
            <span className="font-kh">{s.name_km}</span>
            <span className="mx-2 text-text-muted">·</span>
            {s.name_en}
            {isHidden && (
              <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                Hidden
              </span>
            )}
          </p>
          {s.description_en && (
            <p className="mt-0.5 truncate text-xs text-text-muted">{s.description_en}</p>
          )}
        </div>

        {/* Member count */}
        <span
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-divider bg-paper px-2.5 py-0.5 text-xs font-semibold text-text-muted"
          title={`${memberCount} member${memberCount !== 1 ? "s" : ""} in this section`}
        >
          <Users className="h-3 w-3" />
          {memberCount}
        </span>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onToggleActive}
            disabled={isPending}
            title={isHidden ? "Hidden from the public page — click to show" : "Visible on the public page — click to hide"}
            className="cursor-pointer rounded-lg border border-divider p-1.5 text-text-muted transition hover:bg-paper hover:text-text-body disabled:opacity-50"
            aria-label={isHidden ? `Show ${s.name_en} on the public page` : `Hide ${s.name_en} from the public page`}
          >
            {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={onStartEdit}
            disabled={isPending}
            className="cursor-pointer rounded-lg border border-divider p-1.5 text-text-muted transition hover:bg-paper hover:text-text-body disabled:opacity-50"
            aria-label={`Edit ${s.name_en}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={isDeleting ? onCancelDelete : onStartDelete}
            disabled={isPending}
            className="cursor-pointer rounded-lg border border-red-200 p-1.5 text-red-500 transition hover:bg-red-50 disabled:opacity-50"
            aria-label={isDeleting ? "Cancel delete" : `Delete ${s.name_en}`}
          >
            {isDeleting ? <X className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Delete confirmation panel */}
      {isDeleting && (
        <div className="space-y-3 border-t border-red-200 bg-red-50/50 px-4 py-4 sm:px-5">
          {memberCount === 0 ? (
            <>
              <p className="text-sm text-text-body">
                Delete <strong>{s.name_en}</strong>? This section has no members.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => onDelete()}
                  className="cursor-pointer rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                >
                  {isPending ? "Deleting…" : "Delete section"}
                </button>
                <button
                  type="button"
                  onClick={onCancelDelete}
                  className="cursor-pointer rounded-lg border border-divider bg-bg-surface px-3.5 py-1.5 text-xs font-semibold text-text-body transition hover:bg-paper"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="flex items-start gap-2 text-sm text-text-body">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />
                <span>
                  <strong>{s.name_en}</strong> still has{" "}
                  <strong>{memberCount} member{memberCount !== 1 ? "s" : ""}</strong>. Choose what
                  happens to them before deleting:
                </span>
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={moveTarget}
                  onChange={(e) => setMoveTarget(e.target.value)}
                  disabled={isPending}
                  className="h-9 cursor-pointer rounded-lg border border-divider bg-bg-surface px-3 text-sm text-text-body outline-none focus:border-brand"
                  aria-label="Move members to another section"
                >
                  <option value="">Move members to…</option>
                  {otherSections.map((o) => (
                    <option key={o.id} value={o.id}>{o.name_en}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={isPending || !moveTarget}
                  onClick={() => onDelete({ moveMembersTo: moveTarget })}
                  className="cursor-pointer rounded-lg bg-blue-950 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-brand disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Move {memberCount} &amp; delete
                </button>
                <span className="text-xs text-text-muted">or</span>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => onDelete({ moveMembersTo: null, confirmUnlink: true })}
                  className="cursor-pointer rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                >
                  Unlink {memberCount} &amp; delete
                </button>
                <button
                  type="button"
                  onClick={onCancelDelete}
                  className="cursor-pointer rounded-lg border border-divider bg-bg-surface px-3.5 py-1.5 text-xs font-semibold text-text-body transition hover:bg-paper"
                >
                  Cancel
                </button>
              </div>
              <p className="text-xs text-text-muted">
                Unlinked members are not deleted — they move to “Unsectioned” and stay on the
                public page under “Other Members”.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SectionFields({
  isPending,
  defaults,
}: {
  isPending: boolean;
  defaults?: TeamSection;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor="s_name_km" className="mb-1.5 block text-sm font-semibold text-text-body">
          ឈ្មោះ ខ្មែរ <span className="text-red-500">*</span>
        </label>
        <input
          id="s_name_km" name="name_km" required disabled={isPending}
          defaultValue={defaults?.name_km ?? ""}
          placeholder="e.g. គ្រប់គ្រងទូទៅ"
          className="font-kh h-10 w-full rounded-lg border border-divider px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
        />
      </div>
      <div>
        <label htmlFor="s_name_en" className="mb-1.5 block text-sm font-semibold text-text-body">
          Name English <span className="text-red-500">*</span>
        </label>
        <input
          id="s_name_en" name="name_en" required disabled={isPending}
          defaultValue={defaults?.name_en ?? ""}
          placeholder="e.g. General Management"
          className="h-10 w-full rounded-lg border border-divider px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
        />
      </div>
      <div>
        <label htmlFor="s_desc_km" className="mb-1.5 block text-sm font-semibold text-text-body">
          ការពិពណ៌នា ខ្មែរ
        </label>
        <input
          id="s_desc_km" name="description_km" disabled={isPending}
          defaultValue={defaults?.description_km ?? ""}
          className="font-kh h-10 w-full rounded-lg border border-divider px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
        />
      </div>
      <div>
        <label htmlFor="s_desc_en" className="mb-1.5 block text-sm font-semibold text-text-body">
          Description English
        </label>
        <input
          id="s_desc_en" name="description_en" disabled={isPending}
          defaultValue={defaults?.description_en ?? ""}
          placeholder="Shown under the section heading on the public page"
          className="h-10 w-full rounded-lg border border-divider px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
        />
      </div>
    </div>
  );
}
