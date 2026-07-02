"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createTeamSection, updateTeamSection, deleteTeamSection, reorderTeamSection,
} from "../actions";
import type { TeamSection } from "../actions";
import {
  Trash2, Plus, Pencil, ChevronUp, ChevronDown,
  Users, FolderOpen, Check, X,
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

  // Keep local list in sync after router.refresh()
  const [prevSections, setPrevSections] = useState(sections);
  if (prevSections !== sections) {
    setPrevSections(sections);
    setList(sections);
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteTeamSection(id);
        setList((prev) => prev.filter((s) => s.id !== id));
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete section");
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

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const data = new FormData(form);
    const nameKm = (data.get("name_km") as string)?.trim();
    const nameEn = (data.get("name_en") as string)?.trim();
    if (!nameKm || !nameEn) { setError("Both Khmer and English names are required"); return; }

    startTransition(async () => {
      try {
        await createTeamSection(data);
        setShowForm(false);
        form.reset();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create section");
      }
    });
  }

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    const nameKm = (data.get("name_km") as string)?.trim();
    const nameEn = (data.get("name_en") as string)?.trim();
    if (!nameKm || !nameEn) { setError("Both Khmer and English names are required"); return; }

    startTransition(async () => {
      try {
        await updateTeamSection(id, data);
        setEditingId(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update section");
      }
    });
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-heading">Team Sections</h1>
          <p className="mt-0.5 text-sm text-text-muted">
            {list.length} section{list.length !== 1 ? "s" : ""} shown on the public Library Team page
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setShowForm((v) => !v); setEditingId(null); setError(null); }}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          New section
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
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
              className="h-9 rounded-lg bg-blue-950 px-4 text-sm font-semibold text-white transition hover:bg-brand disabled:opacity-60 cursor-pointer"
            >
              {isPending ? "Saving…" : "Create"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="h-9 rounded-lg border border-divider px-4 text-sm font-semibold text-text-body transition hover:bg-paper cursor-pointer"
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
              Create sections to group team members, e.g. “Management” or “Librarians”.
            </p>
          </div>
        ) : (
          list.map((s, idx) => (
            <SectionRow
              key={s.id}
              section={s}
              hue={(idx * 47) % 360}
              memberCount={memberCounts[s.id] ?? 0}
              idx={idx}
              total={list.length}
              isPending={isPending}
              isEditing={editingId === s.id}
              onStartEdit={() => { setEditingId(s.id); setShowForm(false); setError(null); }}
              onCancelEdit={() => setEditingId(null)}
              onUpdate={(e) => handleUpdate(e, s.id)}
              onDelete={() => handleDelete(s.id)}
              onReorder={(dir) => handleReorder(s.id, dir)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function SectionRow({
  section: s,
  hue,
  memberCount,
  idx,
  total,
  isPending,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onUpdate,
  onDelete,
  onReorder,
}: {
  section: TeamSection;
  hue: number;
  memberCount: number;
  idx: number;
  total: number;
  isPending: boolean;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onUpdate: (e: React.FormEvent<HTMLFormElement>) => void;
  onDelete: () => void;
  onReorder: (dir: "up" | "down") => void;
}) {
  const [confirming, setConfirming] = useState(false);

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
            className="h-9 rounded-lg bg-blue-950 px-4 text-sm font-semibold text-white transition hover:bg-brand disabled:opacity-60 cursor-pointer"
          >
            {isPending ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            onClick={onCancelEdit}
            className="h-9 rounded-lg border border-divider px-4 text-sm font-semibold text-text-body transition hover:bg-paper cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-divider bg-bg-surface px-4 py-3.5 shadow-sm sm:px-5">

      {/* Reorder */}
      <div className="flex shrink-0 flex-col gap-0.5">
        <button
          type="button"
          onClick={() => onReorder("up")}
          disabled={isPending || idx === 0}
          className="rounded p-1 text-text-muted transition hover:bg-paper hover:text-text-body disabled:opacity-25 cursor-pointer disabled:cursor-not-allowed"
          aria-label={`Move ${s.name_en} up`}
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onReorder("down")}
          disabled={isPending || idx === total - 1}
          className="rounded p-1 text-text-muted transition hover:bg-paper hover:text-text-body disabled:opacity-25 cursor-pointer disabled:cursor-not-allowed"
          aria-label={`Move ${s.name_en} down`}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Colour dot — matches the team page grouping colour */}
      <div className="h-3 w-3 shrink-0 rounded-full" style={{ background: `hsl(${hue} 65% 50%)` }} />

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-text-heading">
          <span className="font-kh">{s.name_km}</span>
          <span className="mx-2 text-text-muted">·</span>
          {s.name_en}
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
          onClick={onStartEdit}
          disabled={isPending}
          className="rounded-lg border border-divider p-1.5 text-text-muted transition hover:bg-paper hover:text-text-body cursor-pointer disabled:opacity-50"
          aria-label={`Edit ${s.name_en}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        {confirming ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => { setConfirming(false); onDelete(); }}
              disabled={isPending}
              className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 cursor-pointer disabled:opacity-50"
              title={memberCount > 0 ? `${memberCount} member${memberCount !== 1 ? "s" : ""} will be unlinked` : undefined}
            >
              <Check className="h-3.5 w-3.5" />
              {memberCount > 0 ? `Unlink ${memberCount} & delete` : "Confirm"}
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
            className="rounded-lg border border-red-200 p-1.5 text-red-500 transition hover:bg-red-50 cursor-pointer disabled:opacity-50"
            aria-label={`Delete ${s.name_en}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
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
          className="h-10 w-full rounded-lg border border-divider px-3 text-sm font-kh outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
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
          className="h-10 w-full rounded-lg border border-divider px-3 text-sm font-kh outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
        />
      </div>
      <div>
        <label htmlFor="s_desc_en" className="mb-1.5 block text-sm font-semibold text-text-body">
          Description English
        </label>
        <input
          id="s_desc_en" name="description_en" disabled={isPending}
          defaultValue={defaults?.description_en ?? ""}
          className="h-10 w-full rounded-lg border border-divider px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
        />
      </div>
    </div>
  );
}
