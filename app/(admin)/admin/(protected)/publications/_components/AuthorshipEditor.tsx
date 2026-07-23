"use client";

import { useEffect, useRef, useState } from "react";
import {
  searchPublicationAuthors,
  upsertPublicationAuthor,
  getPublicationAffiliations,
  upsertPublicationAffiliation,
} from "@/app/actions/publications";
import type { PublicationAuthor, PublicationAffiliation } from "@/lib/publications";
import { INPUT_CLASS, LABEL_CLASS } from "../../theses/_components/form-styles";
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Mail,
  Plus,
  Search,
  UserPlus,
  X,
} from "lucide-react";

export type AuthorshipRow = {
  author: PublicationAuthor;
  is_corresponding: boolean;
  affiliation_ids: string[];
};

export default function AuthorshipEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: AuthorshipRow[];
  onChange: (rows: AuthorshipRow[]) => void;
  disabled?: boolean;
}) {
  const [affiliations, setAffiliations] = useState<PublicationAffiliation[]>([]);
  const [searchQ, setSearchQ] = useState("");
  const [results, setResults] = useState<PublicationAuthor[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [showNewAuthor, setShowNewAuthor] = useState(false);
  const [showNewAffiliation, setShowNewAffiliation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // New-author mini form
  const [newAuthor, setNewAuthor] = useState({ full_name: "", full_name_km: "", orcid: "", email: "" });
  // New-affiliation mini form
  const [newAffiliation, setNewAffiliation] = useState({ name: "", name_km: "", city: "", country: "" });

  useEffect(() => {
    getPublicationAffiliations().then(({ data }) => setAffiliations(data ?? []));
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const runSearch = (q: string) => {
    setSearchQ(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const { data } = await searchPublicationAuthors(q);
      setResults(data ?? []);
      setSearching(false);
      setShowResults(true);
    }, 250);
  };

  const addAuthor = (author: PublicationAuthor) => {
    if (value.some((r) => r.author.id === author.id)) return;
    onChange([...value, { author, is_corresponding: false, affiliation_ids: [] }]);
    setSearchQ("");
    setResults([]);
    setShowResults(false);
  };

  const removeRow = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const moveRow = (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= value.length) return;
    const copy = [...value];
    [copy[index], copy[next]] = [copy[next], copy[index]];
    onChange(copy);
  };

  const patchRow = (index: number, patch: Partial<AuthorshipRow>) => {
    onChange(value.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const toggleAffiliation = (index: number, affId: string) => {
    const row = value[index];
    const ids = row.affiliation_ids.includes(affId)
      ? row.affiliation_ids.filter((id) => id !== affId)
      : [...row.affiliation_ids, affId];
    patchRow(index, { affiliation_ids: ids });
  };

  const handleCreateAuthor = async () => {
    setError("");
    if (!newAuthor.full_name.trim()) {
      setError("Author name is required.");
      return;
    }
    setSaving(true);
    const { data, error: err } = await upsertPublicationAuthor(newAuthor);
    setSaving(false);
    if (err || !data) {
      setError(err ?? "Failed to create author.");
      return;
    }
    addAuthor(data);
    setNewAuthor({ full_name: "", full_name_km: "", orcid: "", email: "" });
    setShowNewAuthor(false);
  };

  const handleCreateAffiliation = async () => {
    setError("");
    if (!newAffiliation.name.trim()) {
      setError("Affiliation name is required.");
      return;
    }
    setSaving(true);
    const { data, error: err } = await upsertPublicationAffiliation(newAffiliation);
    setSaving(false);
    if (err || !data) {
      setError(err ?? "Failed to create affiliation.");
      return;
    }
    setAffiliations((prev) =>
      prev.some((a) => a.id === data.id) ? prev : [...prev, data].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setNewAffiliation({ name: "", name_km: "", city: "", country: "" });
    setShowNewAffiliation(false);
  };

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}

      {/* ── Author search / add ── */}
      <div ref={searchBoxRef} className="relative">
        <label className={LABEL_CLASS}>Add author</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={searchQ}
              disabled={disabled}
              onChange={(e) => runSearch(e.target.value)}
              onFocus={() => searchQ && setShowResults(true)}
              placeholder="Search existing authors…"
              className={`${INPUT_CLASS} pl-9`}
            />
            {showResults && (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-divider bg-bg-surface shadow-lg">
                {searching ? (
                  <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-text-muted">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                  </div>
                ) : results.length === 0 ? (
                  <div className="px-3 py-2.5 text-sm text-text-muted">No matching authors.</div>
                ) : (
                  results.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => addAuthor(a)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-paper transition-colors cursor-pointer"
                    >
                      <span className="font-medium text-text-heading">
                        {a.full_name}
                        {a.full_name_km && <span className="ml-2 text-xs text-text-muted">{a.full_name_km}</span>}
                      </span>
                      {a.orcid && <span className="text-[10px] font-mono text-text-muted">{a.orcid}</span>}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setShowNewAuthor((v) => !v)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-divider px-3 text-sm font-medium text-text-body hover:bg-paper transition-colors cursor-pointer"
          >
            <UserPlus className="h-4 w-4" /> New
          </button>
        </div>

        {/* Inline new-author form */}
        {showNewAuthor && (
          <div className="mt-2 grid grid-cols-1 gap-3 rounded-xl border border-divider bg-paper/40 p-4 md:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Full name (EN)</label>
              <input
                value={newAuthor.full_name}
                onChange={(e) => setNewAuthor({ ...newAuthor, full_name: e.target.value })}
                className={INPUT_CLASS}
                placeholder="e.g. Sok San"
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Full name (KH, optional)</label>
              <input
                value={newAuthor.full_name_km}
                onChange={(e) => setNewAuthor({ ...newAuthor, full_name_km: e.target.value })}
                className={INPUT_CLASS}
                placeholder="e.g. សុខ សាន"
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>ORCID (optional)</label>
              <input
                value={newAuthor.orcid}
                onChange={(e) => setNewAuthor({ ...newAuthor, orcid: e.target.value })}
                className={INPUT_CLASS}
                placeholder="0000-0000-0000-0000"
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Email (optional)</label>
              <input
                type="email"
                value={newAuthor.email}
                onChange={(e) => setNewAuthor({ ...newAuthor, email: e.target.value })}
                className={INPUT_CLASS}
                placeholder="author@example.com"
              />
            </div>
            <div className="md:col-span-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewAuthor(false)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-text-muted hover:bg-paper transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateAuthor}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand/90 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                Add author
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Author rows ── */}
      {value.length === 0 ? (
        <p className="rounded-lg border border-dashed border-divider px-4 py-6 text-center text-sm text-text-muted">
          No authors yet — search above or create a new one.
        </p>
      ) : (
        <ul className="space-y-2">
          {value.map((row, i) => (
            <li key={row.author.id} className="rounded-xl border border-divider bg-bg-surface p-3">
              <div className="flex items-start gap-3">
                <div className="flex flex-col gap-0.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => moveRow(i, -1)}
                    disabled={i === 0 || disabled}
                    className="rounded p-0.5 text-text-muted hover:text-brand disabled:opacity-30 transition cursor-pointer"
                    aria-label="Move author up"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveRow(i, 1)}
                    disabled={i === value.length - 1 || disabled}
                    className="rounded p-0.5 text-text-muted hover:text-brand disabled:opacity-30 transition cursor-pointer"
                    aria-label="Move author down"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-brand/10 px-1.5 text-[10px] font-bold text-brand">{i + 1}</span>
                    <span className="truncate text-sm font-semibold text-text-heading">{row.author.full_name}</span>
                    {row.author.full_name_km && (
                      <span className="truncate text-xs text-text-muted">{row.author.full_name_km}</span>
                    )}
                    {row.author.email && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-text-muted">
                        <Mail className="h-3 w-3" /> {row.author.email}
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                    <label className="inline-flex items-center gap-1.5 text-xs text-text-body cursor-pointer">
                      <input
                        type="checkbox"
                        checked={row.is_corresponding}
                        disabled={disabled}
                        onChange={(e) => patchRow(i, { is_corresponding: e.target.checked })}
                        className="h-3.5 w-3.5 accent-[var(--color-brand,#172554)]"
                      />
                      Corresponding author
                    </label>

                    {affiliations.map((aff) => (
                      <label key={aff.id} className="inline-flex items-center gap-1.5 text-xs text-text-muted cursor-pointer">
                        <input
                          type="checkbox"
                          checked={row.affiliation_ids.includes(aff.id)}
                          disabled={disabled}
                          onChange={() => toggleAffiliation(i, aff.id)}
                          className="h-3.5 w-3.5 accent-[var(--color-brand,#172554)]"
                        />
                        {aff.name}
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  disabled={disabled}
                  className="rounded p-1 text-text-muted hover:text-red-500 transition cursor-pointer"
                  aria-label={`Remove ${row.author.full_name}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* ── Affiliation quick-add ── */}
      <div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setShowNewAffiliation((v) => !v)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline transition cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" /> Add affiliation
        </button>

        {showNewAffiliation && (
          <div className="mt-2 grid grid-cols-1 gap-3 rounded-xl border border-divider bg-paper/40 p-4 md:grid-cols-2">
            <div>
              <label className={LABEL_CLASS}>Name (EN)</label>
              <input
                value={newAffiliation.name}
                onChange={(e) => setNewAffiliation({ ...newAffiliation, name: e.target.value })}
                className={INPUT_CLASS}
                placeholder="e.g. the author's university or institute"
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Name (KH, optional)</label>
              <input
                value={newAffiliation.name_km}
                onChange={(e) => setNewAffiliation({ ...newAffiliation, name_km: e.target.value })}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>City (optional)</label>
              <input
                value={newAffiliation.city}
                onChange={(e) => setNewAffiliation({ ...newAffiliation, city: e.target.value })}
                className={INPUT_CLASS}
                placeholder="Phnom Penh"
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Country (optional)</label>
              <input
                value={newAffiliation.country}
                onChange={(e) => setNewAffiliation({ ...newAffiliation, country: e.target.value })}
                className={INPUT_CLASS}
                placeholder="Cambodia"
              />
            </div>
            <div className="md:col-span-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewAffiliation(false)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-text-muted hover:bg-paper transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateAffiliation}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand/90 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                Add affiliation
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
