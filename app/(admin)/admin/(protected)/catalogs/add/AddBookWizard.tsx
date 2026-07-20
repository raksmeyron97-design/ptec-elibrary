"use client";
// app/admin/catalogs/add/AddBookWizard.tsx
// Guided flow for new records: 1) bibliographic info → 2) physical copies.

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { addCatalogBook } from "../actions";
import CopiesPanel from "../CopiesPanel";
import TagInput from "@/components/ui/core/TagInput";
import CatalogCoverField from "@/components/admin/catalogs/CatalogCoverField";

interface BookData {
  id: string;
  slug: string;
  title: string;
  author: string;
  shelf_location: string | null;
  accession_number: string | null;
}

export default function AddBookWizard({ categories }: { categories: string[] }) {
  const t = useTranslations("adminCatalog.form");
  const [step, setStep] = useState<1 | 2>(1);
  const [book, setBook] = useState<BookData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  // Mirrors of the (uncontrolled) form fields that drive the cover preview.
  const [preview, setPreview] = useState({ title: "", author: "", category: "" });

  async function handleAddBook(formData: FormData) {
    if (loading) return;
    setError(null);
    setFieldErrors({});
    setLoading(true);

    try {
      const result = await addCatalogBook(formData);
      if (result.success) {
        setBook({
          ...result.book,
          title: formData.get("title") as string,
          author: formData.get("author") as string,
        });
        setStep(2);
      } else {
        setError(result.error || t("addFailed"));
        setFieldErrors(result.fieldErrors ?? {});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("unexpectedError"));
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

  if (step === 2 && book) {
    return (
      <div className="space-y-6">
        <div>
          {/* Step indicators */}
          <div className="mb-5 flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-bold text-white" aria-hidden>✓</span>
              <span className="text-sm font-semibold text-text-muted">{t("step.infoSaved")}</span>
            </div>
            <div className="h-px w-8 bg-divider" aria-hidden />
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white" aria-hidden>2</span>
              <span className="text-sm font-bold text-text-body">{t("step.physicalCopies")}</span>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-text-heading">{t("addCopiesTitle")}</h1>

          {/* Book summary pill */}
          <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-divider bg-bg-surface px-3 py-1.5 shadow-sm">
            <svg className="h-3.5 w-3.5 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
            <span className="text-xs font-semibold text-text-body">{book.title}</span>
            <span className="text-xs text-text-muted">· {book.author}</span>
          </div>
        </div>

        <CopiesPanel bookId={book.id} bookShelfLocation={book.shelf_location} initialCopies={[]} />

        <div className="flex items-center justify-between rounded-2xl border border-divider bg-bg-surface px-6 py-4 shadow-sm">
          <p className="text-xs text-text-muted">
            {t("savedNotice")}
          </p>
          <Link
            href="/admin/catalogs"
            className="rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-hover"
          >
            {t("doneBackToCatalog")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link href="/admin/catalogs" className="mb-3 inline-flex items-center gap-1.5 text-sm text-text-muted transition hover:text-brand">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path d="M19 12H5m0 0 7 7m-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t("backToCatalog")}
        </Link>
        <h1 className="text-2xl font-bold text-text-heading">{t("addBookTitle")}</h1>
        <p className="mt-1 text-sm text-text-muted">{t("step1Subtitle")}</p>
      </div>

      {/* Error banner */}
      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          {error}
        </div>
      )}

      {/* Form */}
      <form action={handleAddBook} className="space-y-5 rounded-2xl border border-divider bg-bg-surface p-6 shadow-sm">

        {/* ── Core info ── */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="f-title" className={labelCls}>{t("titleReq")}</label>
            <input id="f-title" name="title" required placeholder={t("titlePlaceholder")} {...errProps("title")}
              onChange={(e) => setPreview((p) => ({ ...p, title: e.target.value }))} />
            {fieldError("title")}
          </div>

          <div>
            <label htmlFor="f-author" className={labelCls}>{t("authorReq")}</label>
            <input id="f-author" name="author" required placeholder={t("authorPlaceholder")} {...errProps("author")}
              onChange={(e) => setPreview((p) => ({ ...p, author: e.target.value }))} />
            {fieldError("author")}
          </div>

          <div>
            <label htmlFor="f-language" className={labelCls}>{t("languageReq")}</label>
            <select id="f-language" name="language" defaultValue="km" className={inputCls}>
              <option value="km">{t("lang.km")}</option>
              <option value="en">{t("lang.en")}</option>
              <option value="fr">{t("lang.fr")}</option>
              <option value="zh">{t("lang.zh")}</option>
              <option value="other">{t("lang.other")}</option>
            </select>
          </div>

          <div>
            <label htmlFor="f-isbn" className={labelCls}>{t("isbn")}</label>
            <input id="f-isbn" name="isbn" placeholder="978-0-000-00000-0" {...errProps("isbn")} />
            {fieldError("isbn")}
          </div>

          <div>
            <label htmlFor="f-publisher" className={labelCls}>{t("publisher")}</label>
            <input id="f-publisher" name="publisher" placeholder={t("optional")} {...errProps("publisher")} />
            {fieldError("publisher")}
          </div>

          <div>
            <label htmlFor="f-year" className={labelCls}>{t("year")}</label>
            <input id="f-year" name="year" inputMode="numeric" placeholder={String(new Date().getFullYear())} {...errProps("year")} />
            {fieldError("year")}
          </div>

          <div>
            <label htmlFor="f-category" className={labelCls}>{t("category")}</label>
            <input id="f-category" name="category" list="cat-list" placeholder={t("categoryPlaceholder")} {...errProps("category")}
              onChange={(e) => setPreview((p) => ({ ...p, category: e.target.value }))} />
            <datalist id="cat-list">
              {categories.map((c) => <option key={c} value={c} />)}
            </datalist>
            {fieldError("category")}
          </div>

          <div>
            <label htmlFor="f-department" className={labelCls}>{t("department")}</label>
            <input id="f-department" name="department" placeholder={t("departmentPlaceholder")} {...errProps("department")} />
            {fieldError("department")}
          </div>
        </div>

        <hr className="border-divider" />

        {/* ── Library-specific ── */}
        <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted">{t("libraryDetails")}</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="f-shelf" className={labelCls}>{t("shelfLocation")}</label>
            <input id="f-shelf" name="shelf_location" placeholder="A-3-12" {...errProps("shelf_location")} />
            <p className="mt-1 text-[10px] text-text-muted">{t("shelfHint")}</p>
            {fieldError("shelf_location")}
          </div>

        </div>

        {/* Book cover — upload to PTEC Storage / external URL / auto-generated */}
        <CatalogCoverField
          initialCoverUrl={null}
          initialSource="generated"
          title={preview.title}
          author={preview.author}
          category={preview.category}
          disabled={loading}
        />
        {fieldError("cover")}

        <div>
          <label htmlFor="f-description" className={labelCls}>{t("description")}</label>
          <textarea id="f-description" name="description" rows={4} placeholder={t("descriptionPlaceholder")}
            className={inputCls + " resize-none" + (fieldErrors.description ? " !border-red-300" : "")} />
          {fieldError("description")}
        </div>

        <div>
          <label className={labelCls}>{t("keywords")}</label>
          <TagInput
            name="keywords"
            placeholder={t("keywordsPlaceholder")}
            disabled={loading}
          />
          <p className="mt-1 text-[10px] text-text-muted">
            {t("keywordsHint")}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            href="/admin/catalogs"
            className="rounded-xl border border-divider px-5 py-2.5 text-sm font-semibold text-text-body transition hover:bg-paper"
          >
            {t("cancel")}
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-brand px-8 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? t("saving") : t("saveAndAddCopies")}
          </button>
        </div>
      </form>
    </div>
  );
}
