"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2, Users, X } from "lucide-react";

import { useCan } from "@/components/admin/access/AdminCapabilities";
import { ConfirmDialog, EmptyState, useToast } from "@/components/admin/kit";
import {
  createCommitteeSection,
  deleteCommitteeSection,
  reorderCommitteeSection,
  toggleCommitteeSectionActive,
  updateCommitteeSection,
  type ActionResult,
  type CommitteeSectionRow,
} from "../../actions";

/**
 * Committee sections. Two layout variants, and the choice is editorial rather
 * than cosmetic: `leadership` gives the few office-holders a prominent, centred
 * composition; `grid` is the standard roster. The public page never hard-codes
 * "Head" or "Deputy Head" — it asks the section which composition it wants.
 */
export default function CommitteeSectionsClient({
  sections,
  seatCounts,
}: {
  sections: CommitteeSectionRow[];
  seatCounts: Record<string, number>;
}) {
  const router = useRouter();
  const toast = useToast();
  const canManage = useCan("team.committee.sections");

  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<CommitteeSectionRow | null>(null);

  function run(action: () => Promise<ActionResult>, success: string, onDone?: () => void) {
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(success);
      onDone?.();
      router.refresh();
    });
  }

  const totalSeats = Object.values(seatCounts).reduce((a, b) => a + b, 0);
  const hiddenCount = sections.filter((s) => !s.is_active).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-heading">Committee Sections</h1>
          <p className="mt-0.5 text-sm text-text-muted">
            {sections.length} section{sections.length === 1 ? "" : "s"} · {totalSeats} seat
            {totalSeats === 1 ? "" : "s"} assigned
            {hiddenCount > 0 ? ` · ${hiddenCount} hidden from the public page` : ""}
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => {
              setShowForm((open) => !open);
              setEditingId(null);
            }}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-blue-950 px-4 text-sm font-semibold text-white transition hover:bg-brand"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New section
          </button>
        )}
      </div>

      {showForm && canManage && (
        <SectionForm
          busy={isPending}
          onCancel={() => setShowForm(false)}
          onSubmit={(data, form) =>
            run(() => createCommitteeSection(data), "Section created.", () => {
              setShowForm(false);
              form.reset();
            })
          }
        />
      )}

      {sections.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="No committee sections yet"
          description="Sections are the headings readers see — for example the leadership group and the library officers."
        />
      ) : (
        <ul className="space-y-3">
          {sections.map((section, index) => (
            <li
              key={section.id}
              className="rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm"
            >
              {editingId === section.id && canManage ? (
                <SectionForm
                  initial={section}
                  busy={isPending}
                  onCancel={() => setEditingId(null)}
                  onSubmit={(data) =>
                    run(() => updateCommitteeSection(section.id, data), "Section updated.", () =>
                      setEditingId(null),
                    )
                  }
                />
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-text-heading">
                      <span className="font-kh" lang="km">
                        {section.name_km}
                      </span>
                      <span className="mx-2 font-normal text-text-muted" aria-hidden="true">
                        ·
                      </span>
                      {section.name_en}
                    </h2>
                    {(section.description_en || section.description_km) && (
                      <p className="mt-1 max-w-prose text-sm text-text-muted">
                        {section.description_en || section.description_km}
                      </p>
                    )}
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full border border-divider bg-paper px-2.5 py-0.5 font-semibold text-text-muted">
                        {section.layout_variant === "leadership"
                          ? "Leadership layout"
                          : "Grid layout"}
                      </span>
                      <span className="rounded-full border border-divider bg-paper px-2.5 py-0.5 font-semibold text-text-muted">
                        {seatCounts[section.id] ?? 0} seat
                        {(seatCounts[section.id] ?? 0) === 1 ? "" : "s"}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 font-semibold ${
                          section.is_active
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-paper text-text-muted"
                        }`}
                      >
                        {section.is_active ? "Visible" : "Hidden"}
                      </span>
                    </p>
                  </div>

                  {canManage && (
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <div className="flex flex-col gap-0.5">
                        <button
                          type="button"
                          onClick={() =>
                            run(
                              () => reorderCommitteeSection(section.id, "up"),
                              "Order saved.",
                            )
                          }
                          disabled={isPending || index === 0}
                          className="cursor-pointer rounded p-1 text-text-muted transition hover:bg-paper hover:text-text-body disabled:cursor-not-allowed disabled:opacity-25"
                          aria-label={`Move ${section.name_en} up`}
                        >
                          <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            run(
                              () => reorderCommitteeSection(section.id, "down"),
                              "Order saved.",
                            )
                          }
                          disabled={isPending || index === sections.length - 1}
                          className="cursor-pointer rounded p-1 text-text-muted transition hover:bg-paper hover:text-text-body disabled:cursor-not-allowed disabled:opacity-25"
                          aria-label={`Move ${section.name_en} down`}
                        >
                          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>

                      <button
                        type="button"
                        role="switch"
                        aria-checked={section.is_active}
                        aria-label={
                          section.is_active
                            ? `Hide ${section.name_en} from the public page`
                            : `Show ${section.name_en} on the public page`
                        }
                        onClick={() =>
                          run(
                            () => toggleCommitteeSectionActive(section.id, !section.is_active),
                            section.is_active ? "Section hidden." : "Section shown.",
                          )
                        }
                        disabled={isPending}
                        className={`relative h-5 w-9 cursor-pointer rounded-full transition-colors disabled:cursor-not-allowed ${
                          section.is_active ? "bg-emerald-500" : "bg-divider"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                            section.is_active ? "left-[18px]" : "left-0.5"
                          }`}
                        />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(section.id);
                          setShowForm(false);
                        }}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-divider px-3 py-1.5 text-xs font-semibold text-text-body transition hover:bg-paper"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(section)}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={deleting !== null}
        tone="danger"
        title={`Delete the “${deleting?.name_en ?? ""}” section?`}
        description={
          (seatCounts[deleting?.id ?? ""] ?? 0) > 0
            ? `${seatCounts[deleting?.id ?? ""]} committee member${
                (seatCounts[deleting?.id ?? ""] ?? 0) === 1 ? "" : "s"
              } will keep their seat and move to “No section”. Nobody is removed from the committee and no team member is deleted.`
            : "This section has no members. Nothing else changes."
        }
        confirmLabel="Delete section"
        busyLabel="Deleting…"
        busy={isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const section = deleting;
          setDeleting(null);
          if (!section) return;
          run(() => deleteCommitteeSection(section.id), "Section deleted.");
        }}
      />
    </div>
  );
}

function SectionForm({
  initial,
  busy,
  onCancel,
  onSubmit,
}: {
  initial?: CommitteeSectionRow;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (data: FormData, form: HTMLFormElement) => void;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        onSubmit(new FormData(form), form);
      }}
      className="space-y-4 rounded-2xl border border-divider bg-paper p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-text-heading">
          {initial ? "Edit section" : "New committee section"}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer rounded-lg p-1.5 text-text-muted transition hover:bg-bg-surface hover:text-text-body"
          aria-label="Cancel"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="block text-sm font-semibold text-text-heading">
            Name (Khmer) <span aria-hidden="true">*</span>
            <span className="sr-only">required</span>
          </span>
          <input
            name="name_km"
            lang="km"
            required
            defaultValue={initial?.name_km ?? ""}
            className="focus-field font-kh h-11 w-full rounded-lg border border-divider bg-bg-surface px-3 text-base"
          />
        </label>
        <label className="space-y-1.5">
          <span className="block text-sm font-semibold text-text-heading">
            Name (English) <span aria-hidden="true">*</span>
            <span className="sr-only">required</span>
          </span>
          <input
            name="name_en"
            required
            defaultValue={initial?.name_en ?? ""}
            className="focus-field h-11 w-full rounded-lg border border-divider bg-bg-surface px-3 text-base"
          />
        </label>
        <label className="space-y-1.5">
          <span className="block text-sm font-semibold text-text-heading">
            Description (Khmer)
          </span>
          <textarea
            name="description_km"
            lang="km"
            rows={2}
            defaultValue={initial?.description_km ?? ""}
            className="focus-field font-kh w-full rounded-lg border border-divider bg-bg-surface px-3 py-2 text-base"
          />
        </label>
        <label className="space-y-1.5">
          <span className="block text-sm font-semibold text-text-heading">
            Description (English)
          </span>
          <textarea
            name="description_en"
            rows={2}
            defaultValue={initial?.description_en ?? ""}
            className="focus-field w-full rounded-lg border border-divider bg-bg-surface px-3 py-2 text-base"
          />
        </label>
        <label className="space-y-1.5 sm:col-span-2">
          <span className="block text-sm font-semibold text-text-heading">Public layout</span>
          <select
            name="layout_variant"
            defaultValue={initial?.layout_variant ?? "grid"}
            className="focus-field h-11 w-full cursor-pointer rounded-lg border border-divider bg-bg-surface px-3 text-base sm:max-w-xs"
          >
            <option value="grid">Grid — standard roster</option>
            <option value="leadership">Leadership — prominent, centred</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-divider px-4 text-sm font-semibold text-text-body transition hover:bg-bg-surface disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-blue-950 px-5 text-sm font-semibold text-white transition hover:bg-brand disabled:opacity-50"
        >
          {busy ? "Saving…" : initial ? "Save section" : "Create section"}
        </button>
      </div>
    </form>
  );
}
