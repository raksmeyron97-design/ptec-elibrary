"use client";

import { useState, useTransition } from "react";
import { createTeamSection, deleteTeamSection, getTeamSections } from "../actions";
import type { TeamSection } from "../actions";
import { Trash2, Plus, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

export default function TeamSectionsPage() {
  const [sections, setSections] = useState<TeamSection[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError]   = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    getTeamSections().then(setSections);
  }, []);

  function handleDelete(id: string, name: string) {
    if (!confirm(`Delete section "${name}"? Members in this section will be unlinked.`)) return;
    startTransition(async () => {
      await deleteTeamSection(id);
      setSections((prev) => prev.filter((s) => s.id !== id));
    });
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    const nameKm = (data.get("name_km") as string)?.trim();
    const nameEn = (data.get("name_en") as string)?.trim();
    if (!nameKm || !nameEn) { setError("Both Khmer and English names are required"); return; }

    startTransition(async () => {
      try {
        await createTeamSection(data);
        const fresh = await getTeamSections();
        setSections(fresh);
        setShowForm(false);
        (e.target as HTMLFormElement).reset();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create section");
      }
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">

      {/* Back link */}
      <Link
        href="/admin/team"
        className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-body transition cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to team
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-heading">Team Sections</h1>
          <p className="text-sm text-text-muted mt-0.5">Organisational groups shown on the public Library Team page</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          New section
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-divider bg-bg-surface p-5 shadow-sm space-y-4"
        >
          <h3 className="text-sm font-bold text-text-heading">New Section</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="s_name_km" className="mb-1.5 block text-sm font-semibold text-text-body">
                ឈ្មោះ ខ្មែរ <span className="text-red-500">*</span>
              </label>
              <input id="s_name_km" name="name_km" required disabled={isPending}
                placeholder="e.g. គ្រប់គ្រងទូទៅ"
                className="h-10 w-full rounded-lg border border-divider px-3 text-sm font-kh outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
              />
            </div>
            <div>
              <label htmlFor="s_name_en" className="mb-1.5 block text-sm font-semibold text-text-body">
                Name English <span className="text-red-500">*</span>
              </label>
              <input id="s_name_en" name="name_en" required disabled={isPending}
                placeholder="e.g. General Management"
                className="h-10 w-full rounded-lg border border-divider px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
              />
            </div>
            <div>
              <label htmlFor="s_desc_km" className="mb-1.5 block text-sm font-semibold text-text-body">
                ការពិពណ៌នា ខ្មែរ
              </label>
              <input id="s_desc_km" name="description_km" disabled={isPending}
                className="h-10 w-full rounded-lg border border-divider px-3 text-sm font-kh outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
              />
            </div>
            <div>
              <label htmlFor="s_desc_en" className="mb-1.5 block text-sm font-semibold text-text-body">
                Description English
              </label>
              <input id="s_desc_en" name="description_en" disabled={isPending}
                className="h-10 w-full rounded-lg border border-divider px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
              />
            </div>
            <div>
              <label htmlFor="s_order" className="mb-1.5 block text-sm font-semibold text-text-body">
                Display Order
              </label>
              <input id="s_order" name="display_order" type="number" defaultValue={99} disabled={isPending}
                className="h-10 w-full rounded-lg border border-divider px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
              />
            </div>
          </div>
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
          <div className="flex gap-3">
            <button type="submit" disabled={isPending}
              className="h-9 rounded-lg bg-blue-950 px-4 text-sm font-semibold text-white hover:bg-brand transition disabled:opacity-60 cursor-pointer"
            >
              {isPending ? "Saving…" : "Create"}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="h-9 rounded-lg border border-divider px-4 text-sm font-semibold text-text-body hover:bg-paper transition cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Section list */}
      <div className="space-y-2">
        {sections.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-divider py-12 text-center text-sm text-text-muted">
            No sections yet. Add one above.
          </div>
        ) : (
          sections.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-4 rounded-xl border border-divider bg-bg-surface px-5 py-3.5 shadow-sm">
              <div className="min-w-0">
                <p className="font-semibold text-text-heading">
                  <span className="font-kh">{s.name_km}</span>
                  <span className="mx-2 text-text-muted">·</span>
                  {s.name_en}
                </p>
                {s.description_en && (
                  <p className="mt-0.5 text-xs text-text-muted truncate">{s.description_en}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-xs text-text-muted">Order: {s.display_order}</span>
                <button
                  type="button"
                  onClick={() => handleDelete(s.id, s.name_en)}
                  disabled={isPending}
                  className="rounded-lg border border-red-200 p-1.5 text-red-500 hover:bg-red-50 transition cursor-pointer disabled:opacity-50"
                  aria-label={`Delete ${s.name_en}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
