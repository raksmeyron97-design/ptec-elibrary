"use client";
// app/admin/catalogs/edit/[id]/EditBookWizard.tsx
// Tabbed editor for one catalog record:
//   Tab 1 — Book Information (bibliographic fields only)
//   Tab 2 — Physical Copies (CopiesPanel — inventory lives on copy rows)
//
// Inventory fields (total copies, per-copy accession numbers) are deliberately
// NOT on the book form: totals are derived from copy rows and cannot be typed.

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { updateCatalogBook } from "../../actions";
import type { CatalogBook } from "@/lib/catalog";
import type { CatalogCopy } from "../../copy-actions";
import { computeCopyStats } from "@/lib/catalog";
import CopiesPanel from "../../CopiesPanel";
import TagInput from "@/components/ui/core/TagInput";

type Tab = "info" | "copies";

export default function EditBookWizard({
  book,
  categories,
  initialCopies,
  initialTab = "info",
}: {
  book: CatalogBook;
  categories: string[];
  initialCopies: CatalogCopy[];
  initialTab?: Tab;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const stats = useMemo(() => computeCopyStats(initialCopies), [initialCopies]);

  const updateWithId = updateCatalogBook.bind(null, book.id);

  function switchTab(next: Tab) {
    if (next === tab) return;
    if (tab === "info" && dirty && !window.confirm("You have unsaved changes on the book form. Discard them?")) {
      return;
    }
    setTab(next);
    const qs = new URLSearchParams(searchParams.toString());
    if (next === "copies") qs.set("tab", "copies");
    else qs.delete("tab");
    router.replace(`/admin/catalogs/edit/${book.id}${qs.size ? `?${qs}` : ""}`, { scroll: false });
  }

  async function handleUpdateBook(formData: FormData) {
    if (loading) return;
    setError(null);
    setFieldErrors({});
    setSaved(null);
    setLoading(true);

    try {
      const result = await updateWithId(formData);
      if (result.success) {
        setDirty(false);
        setSaved("Book information saved. The public page has been refreshed.");
      } else {
        setError(result.error || "Failed to update book.");
        setFieldErrors(result.fieldErrors ?? {});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  const labelCls = "block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5";
  const inputCls = `
    w-full rounded-xl border border-divider bg-paper/50
    px-3.5 py-2.5 text-sm text-text-heading placeholder:text-text-muted
    outline-none transition
    focus:border-brand/50 focus:bg-bg-surface focus:ring-2 focus:ring-focus-ring/15
  `;

  const fieldError = (name: string) =>
    fieldErrors[name] ? (
      <p id={`${name}-error`} role="alert" className="mt-1 text-[11px] font-semibold text-red-500">
        {fieldErrors[name]}
      </p>
    ) : null;

  const errProps = (name: string) =>
    fieldErrors[name]
      ? { "aria-invalid": true as const, "aria-describedby": `${name}-error`, className: inputCls + " !border-red-300" }
      : { className: inputCls };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link href="/admin/catalogs" className="mb-3 inline-flex items-center gap-1.5 text-sm text-text-muted transition hover:text-brand">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path d="M19 12H5m0 0 7 7m-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to catalogue admin
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-text-heading">Edit Book</h1>
            <p className="mt-1 max-w-xl truncate text-sm text-text-muted">{book.title}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold ${
              book.is_active
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-divider bg-paper text-text-muted"
            }`}>
              <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${book.is_active ? "bg-emerald-500" : "bg-slate-400"}`} />
              {book.is_active ? "Listed publicly" : "Unlisted"}
            </span>
            {book.is_active && (
              <a
                href={`/catalogs/${book.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-divider px-3 py-1 text-[11px] font-semibold text-text-body transition hover:border-brand hover:text-brand"
              >
                View public page ↗
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Book editor sections" className="flex gap-1 border-b border-divider">
        {([
          { key: "info" as Tab, label: "Book Information" },
          { key: "copies" as Tab, label: `Physical Copies (${stats.total})` },
        ]).map(({ key, label }) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            onClick={() => switchTab(key)}
            className={`-mb-px rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
              tab === key
                ? "border-brand text-brand"
                : "border-transparent text-text-muted hover:text-text-body"
            }`}
          >
            {label}
            {key === "info" && dirty && (
              <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-400 align-middle" title="Unsaved changes" />
            )}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div aria-live="polite" className="space-y-2 empty:hidden">
        {error && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
            {error}
          </div>
        )}
        {saved && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
            {saved}
          </div>
        )}
      </div>

      {tab === "copies" ? (
        <CopiesPanel bookId={book.id} bookShelfLocation={book.shelf_location} initialCopies={initialCopies} />
      ) : (
        <form
          ref={formRef}
          action={handleUpdateBook}
          onChange={() => { setDirty(true); setSaved(null); }}
          className="space-y-5 rounded-2xl border border-divider bg-bg-surface p-6 shadow-sm"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="f-title" className={labelCls}>Title *</label>
              <input id="f-title" name="title" required defaultValue={book.title} {...errProps("title")} />
              {fieldError("title")}
            </div>

            <div>
              <label htmlFor="f-author" className={labelCls}>Author *</label>
              <input id="f-author" name="author" required defaultValue={book.author} {...errProps("author")} />
              {fieldError("author")}
            </div>

            <div>
              <label htmlFor="f-language" className={labelCls}>Language *</label>
              <select id="f-language" name="language" defaultValue={book.language} className={inputCls}>
                <option value="km">Khmer (ខ្មែរ)</option>
                <option value="en">English</option>
                <option value="fr">French</option>
                <option value="zh">Chinese</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label htmlFor="f-isbn" className={labelCls}>ISBN</label>
              <input id="f-isbn" name="isbn" defaultValue={book.isbn ?? ""} placeholder="978-2-940396-75-7" {...errProps("isbn")} />
              {fieldError("isbn")}
            </div>

            <div>
              <label htmlFor="f-publisher" className={labelCls}>Publisher</label>
              <input id="f-publisher" name="publisher" defaultValue={book.publisher ?? ""} {...errProps("publisher")} />
              {fieldError("publisher")}
            </div>

            <div>
              <label htmlFor="f-year" className={labelCls}>Publication year</label>
              <input id="f-year" name="year" inputMode="numeric" defaultValue={book.year ?? ""} placeholder="e.g. 2019" {...errProps("year")} />
              {fieldError("year")}
            </div>

            <div>
              <label htmlFor="f-category" className={labelCls}>Category</label>
              <input id="f-category" name="category" list="cat-list" defaultValue={book.category ?? ""} {...errProps("category")} />
              <datalist id="cat-list">
                {categories.map((c) => <option key={c} value={c} />)}
              </datalist>
              {fieldError("category")}
            </div>

            <div>
              <label htmlFor="f-department" className={labelCls}>Department</label>
              <input id="f-department" name="department" defaultValue={book.department ?? ""} {...errProps("department")} />
              {fieldError("department")}
            </div>
          </div>

          <hr className="border-divider" />

          {/* Inventory summary — read only, managed on the copies tab */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-divider bg-paper/50 px-4 py-3">
            <div className="text-sm text-text-body">
              <span className="font-bold text-text-heading">{stats.total}</span> {stats.total === 1 ? "copy" : "copies"}
              {" · "}
              <span className="font-semibold text-emerald-600">{stats.available} available</span>
              <p className="mt-0.5 text-[11px] text-text-muted">
                Totals are calculated from copy records and cannot be edited here.
              </p>
            </div>
            <button
              type="button"
              onClick={() => switchTab("copies")}
              className="rounded-lg border border-brand/40 px-3.5 py-1.5 text-xs font-semibold text-brand transition hover:bg-brand/5"
            >
              Manage physical copies →
            </button>
          </div>

          <div>
            <label htmlFor="f-shelf" className={labelCls}>Default shelf location</label>
            <input id="f-shelf" name="shelf_location" defaultValue={book.shelf_location ?? ""} placeholder="A-3-12" {...errProps("shelf_location")} />
            <p className="mt-1 text-[10px] text-text-muted">Pre-fills new copies — each copy can override it.</p>
            {fieldError("shelf_location")}
          </div>

          {/* Cover URL */}
          <div>
            <label htmlFor="f-cover" className={labelCls}>Cover Image URL</label>
            {book.cover_url && (
              <div className="mb-2 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={book.cover_url} alt="" className="h-16 w-12 rounded-lg border border-divider object-cover" />
                <span className="max-w-[240px] truncate text-xs text-text-muted">{book.cover_url}</span>
              </div>
            )}
            <input
              id="f-cover"
              name="cover_url"
              type="url"
              defaultValue=""
              className={inputCls}
              placeholder="New URL (leave blank to keep existing) or type __remove__ to clear"
              onChange={(e) => {
                const val = e.target.value;
                const match = val.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
                if (match) {
                  e.target.value = `https://lh3.googleusercontent.com/d/${match[1]}`;
                }
              }}
            />
          </div>

          <div>
            <label htmlFor="f-description" className={labelCls}>Description</label>
            <textarea id="f-description" name="description" rows={4} defaultValue={book.description ?? ""}
              className={inputCls + " resize-none" + (fieldErrors.description ? " !border-red-300" : "")} />
            {fieldError("description")}
          </div>

          <div>
            <label className={labelCls}>Keywords / Tags (ពាក្យគន្លឺះ)</label>
            <TagInput
              name="keywords"
              defaultTags={book.keywords ?? []}
              placeholder="e.g. ច្បាប់, law, reference…"
              disabled={loading}
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Link href="/admin/catalogs" className="rounded-xl border border-divider px-5 py-2.5 text-sm font-semibold text-text-body transition hover:bg-paper">
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading || !dirty}
              className="rounded-xl bg-brand px-8 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Saving…" : dirty ? "Save changes" : "Saved"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
