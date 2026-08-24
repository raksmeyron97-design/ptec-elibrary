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
import { updateCatalogBook } from "../../../actions";
import type { CatalogBook } from "@/lib/catalog";
import type { CatalogCopy } from "../../../copy-actions";
import { computeCopyStats } from "@/lib/catalog";
import CopiesPanel from "../../../_components/CopiesPanel";
import { ConfirmDialog } from "@/components/admin/kit";
import TagInput from "@/components/ui/core/TagInput";
import { Field, ERROR_CLASS } from "@/components/admin/kit/form";
import CatalogCoverField from "@/components/admin/catalogs/CatalogCoverField";
import SeoOverrideFields from "@/components/admin/seo/SeoOverrideFields";
import { SITE_URL } from "@/lib/seo/site";
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
            <Field label={t("titleReq")} required htmlFor="f-title" error={fieldErrors.title} className="sm:col-span-2">
              {(p) => <input {...p} name="title" defaultValue={book.title} />}
            </Field>

            <Field label={t("authorReq")} required htmlFor="f-author" error={fieldErrors.author}>
              {(p) => <input {...p} name="author" defaultValue={book.author} />}
            </Field>

            <Field label={t("languageReq")} required htmlFor="f-language">
              {(p) => (
                <select {...p} name="language" defaultValue={book.language}>
                  <option value="km">{t("lang.km")}</option>
                  <option value="en">{t("lang.en")}</option>
                  <option value="fr">{t("lang.fr")}</option>
                  <option value="zh">{t("lang.zh")}</option>
                  <option value="other">{t("lang.other")}</option>
                </select>
              )}
            </Field>

            <Field label={t("isbn")} htmlFor="f-isbn" error={fieldErrors.isbn}>
              {(p) => (
                <input {...p} name="isbn" defaultValue={book.isbn ?? ""} placeholder="978-2-940396-75-7" />
              )}
            </Field>

            <Field label={t("publisher")} htmlFor="f-publisher" error={fieldErrors.publisher}>
              {(p) => <input {...p} name="publisher" defaultValue={book.publisher ?? ""} />}
            </Field>

            <Field label={t("year")} htmlFor="f-year" error={fieldErrors.year}>
              {(p) => (
                <input
                  {...p}
                  name="year"
                  inputMode="numeric"
                  defaultValue={book.year ?? ""}
                  placeholder={t("yearPlaceholder2")}
                />
              )}
            </Field>

            <Field label={t("category")} htmlFor="f-category" error={fieldErrors.category}>
              {(p) => (
                <>
                  <input {...p} name="category" list="cat-list" defaultValue={book.category ?? ""} />
                  <datalist id="cat-list">
                    {categories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>

            <Field label={t("department")} htmlFor="f-department" error={fieldErrors.department}>
              {(p) => <input {...p} name="department" defaultValue={book.department ?? ""} />}
            </Field>
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

          <Field
            label={t("shelfLocation")}
            htmlFor="f-shelf"
            error={fieldErrors.shelf_location}
            hint={t("shelfHint")}
          >
            {(p) => (
              <input {...p} name="shelf_location" defaultValue={book.shelf_location ?? ""} placeholder="A-3-12" />
            )}
          </Field>

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
            {fieldErrors.cover && (
              <p role="alert" className={ERROR_CLASS}>
                {fieldErrors.cover}
              </p>
            )}
          </div>

          <Field label={t("description")} htmlFor="f-description" error={fieldErrors.description}>
            {(p) => (
              <textarea
                {...p}
                className={`${p.className} h-auto resize-none py-3 leading-relaxed`}
                name="description"
                rows={4}
                defaultValue={book.description ?? ""}
              />
            )}
          </Field>

          <Field label={t("keywords")} htmlFor="f-keywords">
            <TagInput
              name="keywords"
              defaultTags={book.keywords ?? []}
              placeholder={t("keywordsPlaceholder")}
              disabled={loading}
            />
          </Field>

          <SeoOverrideFields
            routePrefix="/catalogs"
            slug={book.slug}
            siteUrl={SITE_URL}
            defaultSeoTitle={book.seo_title}
            defaultSeoDescription={book.seo_description}
            defaultOgImage={book.og_image}
            fallbackTitle={book.author ? `${book.title} by ${book.author}` : book.title}
            fallbackDescription={book.description ?? ""}
            fallbackImage={book.cover_url}
            disabled={loading}
            labels={{
              heading: t("seoHeading"),
              hint: t("seoHint"),
              seoTitle: t("seoTitle"),
              seoDescription: t("seoDescription"),
              ogImage: t("seoOgImage"),
              searchPreview: t("seoSearchPreview"),
            }}
          />

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
