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
import { ConfirmDialog } from "@/components/admin/kit";
import TagInput from "@/components/ui/core/TagInput";
import CatalogCoverField from "@/components/admin/catalogs/CatalogCoverField";
import { useTranslations } from "next-intl";
import type { CoverSource } from "@/lib/catalog-cover-shared";

type Tab = "info" | "copies";

export default function EditBookWizard({
  book,
  coverSource,
  categories,
  initialCopies,
  initialTab = "info",
}: {
  book: CatalogBook;
  coverSource: CoverSource;
  categories: string[];
  initialCopies: CatalogCopy[];
  initialTab?: Tab;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("adminCatalog.form");
  const te = useTranslations("adminCatalog.edit");
  const [tab, setTab] = useState<Tab>(initialTab);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pendingTab, setPendingTab] = useState<Tab | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const stats = useMemo(() => computeCopyStats(initialCopies), [initialCopies]);

  const updateWithId = updateCatalogBook.bind(null, book.id);

  function doSwitchTab(next: Tab) {
    setTab(next);
    const qs = new URLSearchParams(searchParams.toString());
    if (next === "copies") qs.set("tab", "copies");
    else qs.delete("tab");
    router.replace(`/admin/catalogs/edit/${book.id}${qs.size ? `?${qs}` : ""}`, { scroll: false });
  }

  function switchTab(next: Tab) {
    if (next === tab) return;
    if (tab === "info" && dirty) {
      setPendingTab(next);
      return;
    }
    doSwitchTab(next);
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
        setSaved(te("savedMessage"));
      } else {
        setError(result.error || te("updateFailed"));
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

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={pendingTab !== null}
        title={te("discardTitle")}
        description={te("discardBody")}
        confirmLabel={te("discardConfirm")}
        onCancel={() => setPendingTab(null)}
        onConfirm={() => {
          if (pendingTab) doSwitchTab(pendingTab);
          setPendingTab(null);
        }}
      />
      {/* Header */}
      <div>
        <Link href="/admin/catalogs" className="mb-3 inline-flex items-center gap-1.5 text-sm text-text-muted transition hover:text-brand">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path d="M19 12H5m0 0 7 7m-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t("backToCatalog")}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-text-heading">{te("title")}</h1>
            <p className="mt-1 max-w-xl truncate text-sm text-text-muted">{book.title}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold ${
              book.is_active
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-divider bg-paper text-text-muted"
            }`}>
              <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${book.is_active ? "bg-emerald-500" : "bg-slate-400"}`} />
              {book.is_active ? te("listedPublicly") : te("unlisted")}
            </span>
            {book.is_active && (
              <a
                href={`/catalogs/${book.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-divider px-3 py-1 text-[11px] font-semibold text-text-body transition hover:border-brand hover:text-brand"
              >
                {te("viewPublic")}
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label={te("tabsAria")} className="flex gap-1 border-b border-divider">
        {([
          { key: "info" as Tab, label: te("tabInfo") },
          { key: "copies" as Tab, label: te("tabCopies", { count: stats.total }) },
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
              <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-400 align-middle" title={te("unsavedChanges")} />
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
              <label htmlFor="f-title" className={labelCls}>{t("titleReq")}</label>
              <input id="f-title" name="title" required defaultValue={book.title} {...errProps("title")} />
              {fieldError("title")}
            </div>

            <div>
              <label htmlFor="f-author" className={labelCls}>{t("authorReq")}</label>
              <input id="f-author" name="author" required defaultValue={book.author} {...errProps("author")} />
              {fieldError("author")}
            </div>

            <div>
              <label htmlFor="f-language" className={labelCls}>{t("languageReq")}</label>
              <select id="f-language" name="language" defaultValue={book.language} className={inputCls}>
                <option value="km">{t("lang.km")}</option>
                <option value="en">{t("lang.en")}</option>
                <option value="fr">{t("lang.fr")}</option>
                <option value="zh">{t("lang.zh")}</option>
                <option value="other">{t("lang.other")}</option>
              </select>
            </div>

            <div>
              <label htmlFor="f-isbn" className={labelCls}>{t("isbn")}</label>
              <input id="f-isbn" name="isbn" defaultValue={book.isbn ?? ""} placeholder="978-2-940396-75-7" {...errProps("isbn")} />
              {fieldError("isbn")}
            </div>

            <div>
              <label htmlFor="f-publisher" className={labelCls}>{t("publisher")}</label>
              <input id="f-publisher" name="publisher" defaultValue={book.publisher ?? ""} {...errProps("publisher")} />
              {fieldError("publisher")}
            </div>

            <div>
              <label htmlFor="f-year" className={labelCls}>{t("year")}</label>
              <input id="f-year" name="year" inputMode="numeric" defaultValue={book.year ?? ""} placeholder={t("yearPlaceholder2")} {...errProps("year")} />
              {fieldError("year")}
            </div>

            <div>
              <label htmlFor="f-category" className={labelCls}>{t("category")}</label>
              <input id="f-category" name="category" list="cat-list" defaultValue={book.category ?? ""} {...errProps("category")} />
              <datalist id="cat-list">
                {categories.map((c) => <option key={c} value={c} />)}
              </datalist>
              {fieldError("category")}
            </div>

            <div>
              <label htmlFor="f-department" className={labelCls}>{t("department")}</label>
              <input id="f-department" name="department" defaultValue={book.department ?? ""} {...errProps("department")} />
              {fieldError("department")}
            </div>
          </div>

          <hr className="border-divider" />

          {/* Inventory summary — read only, managed on the copies tab */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-divider bg-paper/50 px-4 py-3">
            <div className="text-sm text-text-body">
              <span className="font-bold text-text-heading">{stats.total}</span> {te("copies", { count: stats.total })}
              {" · "}
              <span className="font-semibold text-emerald-600">{te("available", { count: stats.available })}</span>
              <p className="mt-0.5 text-[11px] text-text-muted">
                {te("totalsHint")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => switchTab("copies")}
              className="rounded-lg border border-brand/40 px-3.5 py-1.5 text-xs font-semibold text-brand transition hover:bg-brand/5"
            >
              {te("managePhysical")}
            </button>
          </div>

          <div>
            <label htmlFor="f-shelf" className={labelCls}>{t("shelfLocation")}</label>
            <input id="f-shelf" name="shelf_location" defaultValue={book.shelf_location ?? ""} placeholder="A-3-12" {...errProps("shelf_location")} />
            <p className="mt-1 text-[10px] text-text-muted">{t("shelfHint")}</p>
            {fieldError("shelf_location")}
          </div>

          {/* Book cover — upload to PTEC Storage / external URL / auto-generated */}
          <div>
            <CatalogCoverField
              initialCoverUrl={book.cover_url}
              initialSource={coverSource}
              title={book.title}
              author={book.author}
              category={book.category}
              disabled={loading}
              onChanged={() => { setDirty(true); setSaved(null); }}
            />
            {fieldError("cover")}
          </div>

          <div>
            <label htmlFor="f-description" className={labelCls}>{t("description")}</label>
            <textarea id="f-description" name="description" rows={4} defaultValue={book.description ?? ""}
              className={inputCls + " resize-none" + (fieldErrors.description ? " !border-red-300" : "")} />
            {fieldError("description")}
          </div>

          <div>
            <label className={labelCls}>{t("keywords")}</label>
            <TagInput
              name="keywords"
              defaultTags={book.keywords ?? []}
              placeholder={t("keywordsPlaceholder")}
              disabled={loading}
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Link href="/admin/catalogs" className="rounded-xl border border-divider px-5 py-2.5 text-sm font-semibold text-text-body transition hover:bg-paper">
              {t("cancel")}
            </Link>
            <button
              type="submit"
              disabled={loading || !dirty}
              className="rounded-xl bg-brand px-8 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? t("saving") : dirty ? te("saveChanges") : te("savedShort")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
