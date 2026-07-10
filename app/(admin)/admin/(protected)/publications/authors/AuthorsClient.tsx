"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  upsertPublicationAuthor,
  deletePublicationAuthor,
  upsertPublicationAffiliation,
  deletePublicationAffiliation,
} from "@/app/actions/publications";
import type { PublicationAuthor, PublicationAffiliation } from "@/lib/publications";
import { INPUT_CLASS, LABEL_CLASS } from "../../theses/_components/form-styles";
import { AlertCircle, Building2, Loader2, Pencil, Plus, Trash2, Users } from "lucide-react";

const EMPTY_AUTHOR = {
  id: undefined as string | undefined,
  full_name: "",
  full_name_km: "",
  orcid: "",
  email: "",
  bio: "",
  bio_km: "",
  photo_url: "",
};
const EMPTY_AFFILIATION = { id: undefined as string | undefined, name: "", name_km: "", city: "", country: "" };

export default function AuthorsClient({
  initialAuthors,
  initialAffiliations,
}: {
  initialAuthors: PublicationAuthor[];
  initialAffiliations: PublicationAffiliation[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ kind: "author" | "affiliation"; id: string } | null>(null);

  const [authorForm, setAuthorForm] = useState<typeof EMPTY_AUTHOR | null>(null);
  const [affiliationForm, setAffiliationForm] = useState<typeof EMPTY_AFFILIATION | null>(null);

  const saveAuthor = async () => {
    if (!authorForm) return;
    setError("");
    setSaving(true);
    const { error: err } = await upsertPublicationAuthor(authorForm);
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    setAuthorForm(null);
    router.refresh();
  };

  const saveAffiliation = async () => {
    if (!affiliationForm) return;
    setError("");
    setSaving(true);
    const { error: err } = await upsertPublicationAffiliation(affiliationForm);
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    setAffiliationForm(null);
    router.refresh();
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setError("");
    setSaving(true);
    const result =
      confirmDelete.kind === "author"
        ? await deletePublicationAuthor(confirmDelete.id)
        : await deletePublicationAffiliation(confirmDelete.id);
    setSaving(false);
    setConfirmDelete(null);
    if (!result.success) {
      setError(result.error ?? "Delete failed");
      return;
    }
    router.refresh();
  };

  return (
    <div className="space-y-8">
      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <p>{error}</p>
        </div>
      )}

      {/* ── Authors ── */}
      <section className="rounded-2xl border border-divider bg-bg-surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-divider px-5 py-4">
          <h2 className="inline-flex items-center gap-2 text-base font-semibold text-text-heading">
            <Users className="h-4 w-4 text-brand" /> Authors
            <span className="text-xs font-normal text-text-muted">({initialAuthors.length})</span>
          </h2>
          <button
            type="button"
            onClick={() => setAuthorForm({ ...EMPTY_AUTHOR })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand/90 transition-colors cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" /> New author
          </button>
        </div>

        {authorForm && (
          <div className="grid grid-cols-1 gap-3 border-b border-divider bg-paper/40 p-5 md:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Full name (EN)</label>
              <input
                value={authorForm.full_name}
                onChange={(e) => setAuthorForm({ ...authorForm, full_name: e.target.value })}
                className={INPUT_CLASS}
                placeholder="e.g. Sok San"
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Full name (KH, optional)</label>
              <input
                value={authorForm.full_name_km ?? ""}
                onChange={(e) => setAuthorForm({ ...authorForm, full_name_km: e.target.value })}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>ORCID (optional)</label>
              <input
                value={authorForm.orcid ?? ""}
                onChange={(e) => setAuthorForm({ ...authorForm, orcid: e.target.value })}
                className={INPUT_CLASS}
                placeholder="0000-0000-0000-0000"
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Email (optional)</label>
              <input
                type="email"
                value={authorForm.email ?? ""}
                onChange={(e) => setAuthorForm({ ...authorForm, email: e.target.value })}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Photo URL (optional)</label>
              <input
                value={authorForm.photo_url ?? ""}
                onChange={(e) => setAuthorForm({ ...authorForm, photo_url: e.target.value })}
                className={INPUT_CLASS}
                placeholder="https://…"
              />
            </div>
            <div className="md:col-span-2">
              <label className={LABEL_CLASS}>Biography (EN, optional)</label>
              <textarea
                rows={3}
                value={authorForm.bio ?? ""}
                onChange={(e) => setAuthorForm({ ...authorForm, bio: e.target.value })}
                className={`${INPUT_CLASS} h-auto py-3 leading-relaxed`}
                placeholder="Short academic biography shown in the article's About the Authors section."
              />
            </div>
            <div className="md:col-span-2">
              <label className={LABEL_CLASS}>Biography (KH, optional)</label>
              <textarea
                rows={3}
                value={authorForm.bio_km ?? ""}
                onChange={(e) => setAuthorForm({ ...authorForm, bio_km: e.target.value })}
                className={`${INPUT_CLASS} h-auto py-3 leading-relaxed`}
                placeholder="ប្រវត្តិរូបសង្ខេបជាភាសាខ្មែរ"
              />
            </div>
            <div className="md:col-span-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAuthorForm(null)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-text-muted hover:bg-paper transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveAuthor}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand/90 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                {authorForm.id ? "Save changes" : "Add author"}
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper border-b border-divider text-text-muted">
              <tr>
                <th scope="col" className="px-5 py-3 font-medium">Name</th>
                <th scope="col" className="px-5 py-3 font-medium">ORCID</th>
                <th scope="col" className="px-5 py-3 font-medium">Email</th>
                <th scope="col" className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {initialAuthors.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-text-muted">No authors yet.</td>
                </tr>
              ) : (
                initialAuthors.map((a) => (
                  <tr key={a.id} className="hover:bg-paper/50 transition-colors">
                    <td className="px-5 py-3">
                      <span className="font-medium text-text-heading">{a.full_name}</span>
                      {a.full_name_km && <span className="ml-2 text-xs text-text-muted">{a.full_name_km}</span>}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-text-muted">{a.orcid ?? "—"}</td>
                    <td className="px-5 py-3 text-xs text-text-muted">{a.email ?? "—"}</td>
                    <td className="px-5 py-3 text-right">
                      {confirmDelete?.kind === "author" && confirmDelete.id === a.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-xs text-text-muted">Delete?</span>
                          <button type="button" onClick={handleDelete} disabled={saving}
                            className="rounded bg-red-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer">
                            {saving ? "…" : "Yes"}
                          </button>
                          <button type="button" onClick={() => setConfirmDelete(null)}
                            className="rounded bg-paper px-2.5 py-1 text-xs font-semibold text-text-body cursor-pointer">
                            No
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-3 text-text-muted">
                          <button
                            type="button"
                            onClick={() =>
                              setAuthorForm({
                                id: a.id,
                                full_name: a.full_name,
                                full_name_km: a.full_name_km ?? "",
                                orcid: a.orcid ?? "",
                                email: a.email ?? "",
                                bio: a.bio ?? "",
                                bio_km: a.bio_km ?? "",
                                photo_url: a.photo_url ?? "",
                              })
                            }
                            className="hover:text-brand transition cursor-pointer"
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete({ kind: "author", id: a.id })}
                            className="hover:text-red-500 transition cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Affiliations ── */}
      <section className="rounded-2xl border border-divider bg-bg-surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-divider px-5 py-4">
          <h2 className="inline-flex items-center gap-2 text-base font-semibold text-text-heading">
            <Building2 className="h-4 w-4 text-brand" /> Affiliations
            <span className="text-xs font-normal text-text-muted">({initialAffiliations.length})</span>
          </h2>
          <button
            type="button"
            onClick={() => setAffiliationForm({ ...EMPTY_AFFILIATION })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand/90 transition-colors cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" /> New affiliation
          </button>
        </div>

        {affiliationForm && (
          <div className="grid grid-cols-1 gap-3 border-b border-divider bg-paper/40 p-5 md:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Name (EN)</label>
              <input
                value={affiliationForm.name}
                onChange={(e) => setAffiliationForm({ ...affiliationForm, name: e.target.value })}
                className={INPUT_CLASS}
                placeholder="e.g. Phnom Penh Teacher Education College"
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Name (KH, optional)</label>
              <input
                value={affiliationForm.name_km ?? ""}
                onChange={(e) => setAffiliationForm({ ...affiliationForm, name_km: e.target.value })}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>City (optional)</label>
              <input
                value={affiliationForm.city ?? ""}
                onChange={(e) => setAffiliationForm({ ...affiliationForm, city: e.target.value })}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Country (optional)</label>
              <input
                value={affiliationForm.country ?? ""}
                onChange={(e) => setAffiliationForm({ ...affiliationForm, country: e.target.value })}
                className={INPUT_CLASS}
              />
            </div>
            <div className="md:col-span-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAffiliationForm(null)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-text-muted hover:bg-paper transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveAffiliation}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand/90 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                {affiliationForm.id ? "Save changes" : "Add affiliation"}
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper border-b border-divider text-text-muted">
              <tr>
                <th scope="col" className="px-5 py-3 font-medium">Name</th>
                <th scope="col" className="px-5 py-3 font-medium">City</th>
                <th scope="col" className="px-5 py-3 font-medium">Country</th>
                <th scope="col" className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {initialAffiliations.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-text-muted">No affiliations yet.</td>
                </tr>
              ) : (
                initialAffiliations.map((aff) => (
                  <tr key={aff.id} className="hover:bg-paper/50 transition-colors">
                    <td className="px-5 py-3">
                      <span className="font-medium text-text-heading">{aff.name}</span>
                      {aff.name_km && <span className="ml-2 text-xs text-text-muted">{aff.name_km}</span>}
                    </td>
                    <td className="px-5 py-3 text-xs text-text-muted">{aff.city ?? "—"}</td>
                    <td className="px-5 py-3 text-xs text-text-muted">{aff.country ?? "—"}</td>
                    <td className="px-5 py-3 text-right">
                      {confirmDelete?.kind === "affiliation" && confirmDelete.id === aff.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-xs text-text-muted">Delete?</span>
                          <button type="button" onClick={handleDelete} disabled={saving}
                            className="rounded bg-red-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer">
                            {saving ? "…" : "Yes"}
                          </button>
                          <button type="button" onClick={() => setConfirmDelete(null)}
                            className="rounded bg-paper px-2.5 py-1 text-xs font-semibold text-text-body cursor-pointer">
                            No
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-3 text-text-muted">
                          <button
                            type="button"
                            onClick={() =>
                              setAffiliationForm({
                                id: aff.id,
                                name: aff.name,
                                name_km: aff.name_km ?? "",
                                city: aff.city ?? "",
                                country: aff.country ?? "",
                              })
                            }
                            className="hover:text-brand transition cursor-pointer"
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete({ kind: "affiliation", id: aff.id })}
                            className="hover:text-red-500 transition cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
