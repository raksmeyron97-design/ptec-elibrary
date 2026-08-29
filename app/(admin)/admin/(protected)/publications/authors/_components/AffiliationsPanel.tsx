"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

import {
  upsertPublicationAffiliation,
  deletePublicationAffiliation,
} from "@/app/actions/publications";
import type { PublicationAffiliation } from "@/lib/publications";
import { ConfirmDialog, useToast } from "@/components/admin/kit";
import { Field } from "@/components/admin/kit/form";

/**
 * Institutions, as reusable records.
 *
 * Lifted out of AuthorsClient unchanged in behaviour when that file was rebuilt
 * around author profiles — an affiliation is a different noun with a different
 * lifecycle (four fields, no profile page, no duplicate problem worth
 * automating), and keeping it in the same component was the only reason that
 * component had a `kind: "author" | "affiliation"` discriminator threaded
 * through its delete state.
 *
 * Two changes came with the move, both to match the rest of the panel: the
 * inline "Delete? Yes/No" is now the kit's ConfirmDialog, and saves report
 * through the toast system instead of a banner that had to be dismissed.
 */

const EMPTY = { id: undefined as string | undefined, name: "", name_km: "", city: "", country: "" };

export default function AffiliationsPanel({
  affiliations,
}: {
  affiliations: PublicationAffiliation[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const [deleting, setDeleting] = useState<PublicationAffiliation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!form || busy) return;
    if (!form.name.trim()) {
      setError("An institution needs a name.");
      return;
    }
    setError("");
    setBusy(true);
    const { error: err } = await upsertPublicationAffiliation(form);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    toast.success(form.id ? "Institution updated." : "Institution added.");
    setForm(null);
    router.refresh();
  };

  const confirmDelete = async () => {
    if (!deleting || busy) return;
    setBusy(true);
    const result = await deletePublicationAffiliation(deleting.id);
    setBusy(false);
    if (!result.success) {
      setError(result.error ?? "Delete failed.");
      setDeleting(null);
      return;
    }
    toast.success(`Deleted "${deleting.name}".`);
    setDeleting(null);
    router.refresh();
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-divider bg-bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-divider px-5 py-4">
        <div>
          <h2 className="inline-flex items-center gap-2 text-base font-semibold text-text-heading">
            <Building2 className="h-4 w-4 text-brand" aria-hidden="true" /> Institutions
            <span className="text-xs font-normal text-text-muted">({affiliations.length})</span>
          </h2>
          <p className="mt-0.5 text-xs text-text-muted">
            Attached to an author&apos;s credit on a specific article, and shown as the numbered
            affiliations under a byline.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setForm({ ...EMPTY })}
          className="focus-field inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-semibold text-brand-contrast transition-colors hover:bg-brand-hover"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> New institution
        </button>
      </div>

      {form && (
        <div className="border-b border-divider bg-paper/40 p-5">
          {error && (
            <p role="alert" className="mb-3 text-sm font-medium text-danger">
              {error}
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Name" required htmlFor="aff-name">
              {(p) => (
                <input
                  {...p}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Phnom Penh Teacher Education College"
                />
              )}
            </Field>
            <Field label="Name (Khmer)" htmlFor="aff-name_km">
              {(p) => (
                <input
                  {...p}
                  lang="km"
                  value={form.name_km ?? ""}
                  onChange={(e) => setForm({ ...form, name_km: e.target.value })}
                />
              )}
            </Field>
            <Field label="City" htmlFor="aff-city">
              {(p) => (
                <input
                  {...p}
                  value={form.city ?? ""}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              )}
            </Field>
            <Field label="Country" htmlFor="aff-country">
              {(p) => (
                <input
                  {...p}
                  value={form.country ?? ""}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                />
              )}
            </Field>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setForm(null);
                setError("");
              }}
              className="focus-field inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-divider px-4 text-sm font-medium text-text-body transition-colors hover:bg-paper"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="focus-field inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-contrast transition-colors hover:bg-brand-hover disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {form.id ? "Save changes" : "Add institution"}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Institutions available to author credits</caption>
          <thead className="border-b border-divider bg-paper text-text-muted">
            <tr>
              <th scope="col" className="px-5 py-3 font-medium">Name</th>
              <th scope="col" className="px-5 py-3 font-medium">City</th>
              <th scope="col" className="px-5 py-3 font-medium">Country</th>
              <th scope="col" className="px-5 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-divider">
            {affiliations.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-text-muted">
                  No institutions yet.
                </td>
              </tr>
            ) : (
              affiliations.map((aff) => (
                <tr key={aff.id} className="transition-colors hover:bg-paper/50">
                  <td className="px-5 py-3">
                    <span className="font-medium text-text-heading">{aff.name}</span>
                    {aff.name_km && (
                      <span lang="km" className="ml-2 text-xs text-text-muted">
                        {aff.name_km}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-text-muted">{aff.city ?? "—"}</td>
                  <td className="px-5 py-3 text-xs text-text-muted">{aff.country ?? "—"}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1 text-text-muted">
                      <button
                        type="button"
                        onClick={() =>
                          setForm({
                            id: aff.id,
                            name: aff.name,
                            name_km: aff.name_km ?? "",
                            city: aff.city ?? "",
                            country: aff.country ?? "",
                          })
                        }
                        aria-label={`Edit ${aff.name}`}
                        className="focus-field cursor-pointer rounded-lg p-2 transition-colors hover:text-brand"
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(aff)}
                        aria-label={`Delete ${aff.name}`}
                        className="focus-field cursor-pointer rounded-lg p-2 transition-colors hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!deleting}
        tone="danger"
        title={`Delete ${deleting?.name ?? "this institution"}?`}
        description="Any author credit that pointed at it loses its affiliation marker on that article. This cannot be undone."
        confirmLabel="Delete institution"
        busyLabel="Deleting…"
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </section>
  );
}
