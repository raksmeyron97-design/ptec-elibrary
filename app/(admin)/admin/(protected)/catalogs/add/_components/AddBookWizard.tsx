"use client";
// app/admin/catalogs/add/AddBookWizard.tsx
// Guided flow for new records: 1) bibliographic info → 2) physical copies.

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { addCatalogBook, checkCatalogSlugAvailable } from "../../actions";
import CopiesPanel from "../../_components/CopiesPanel";
import TagInput from "@/components/ui/core/TagInput";
import { Field, ERROR_CLASS } from "@/components/admin/kit/form";
import CatalogCoverField from "@/components/admin/catalogs/CatalogCoverField";
import {
  FormShell,
  FormTabs,
  StickyActionBar,
  SlugField,
  ContextPanel,
  ButtonBusy,
  BTN_PRIMARY,
  BTN_SECONDARY,
  type FormTab,
} from "@/components/admin/kit/form";
import { AlertCircle, BookOpen, Image as ImageIcon, type LucideIcon } from "lucide-react";
import SeoOverrideFields from "@/components/admin/seo/SeoOverrideFields";
import { SITE_URL } from "@/lib/seo/site";
import { catalogRecordSlug } from "@/lib/catalog";

interface BookData {
  id: string;
  slug: string;
  title: string;
  author: string;
  shelf_location: string | null;
  accession_number: string | null;
}

type Tab = "info" | "media";

/*
  The same two content tabs as the edit wizard, so a cataloguer who learns one
  screen has learned the other. Add has no Copies tab: copies are created on the
  next step, once the record exists to hang them on.
*/
const TABS: { key: Tab; labelKey: string; icon: LucideIcon }[] = [
  { key: "info", labelKey: "tabInfo", icon: BookOpen },
  { key: "media", labelKey: "tabMedia", icon: ImageIcon },
];

export default function AddBookWizard({ categories }: { categories: string[] }) {
  const t = useTranslations("adminCatalog.form");
  const [tab, setTab] = useState<Tab>("info");
  const [step, setStep] = useState<1 | 2>(1);
  const [book, setBook] = useState<BookData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  // Mirrors of the (uncontrolled) form fields that drive the cover preview.
  const [preview, setPreview] = useState({ title: "", author: "", category: "" });
  // The slug is the one field that is controlled: it follows the title until
  // the cataloguer edits it, which needs state on this side of the form.
  const [slug, setSlug] = useState("");

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

  // Label, control, required marker and the error slot all come from the shared
  // <Field>. This file used to carry its own `labelCls`/`inputCls`/`errProps`
  // trio — byte-identical to the one in EditBookWizard — which is exactly the
  // duplication the admin form kit exists to remove.

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
    <FormShell
      backHref="/admin/catalogs"
      backLabel={t("backToCatalog")}
      title={t("addBookTitle")}
      description={t("step1Subtitle")}
      contentKey={tab}
      action={handleAddBook}
      tabs={
        <FormTabs
          idPrefix="catalogadd"
          ariaLabel={t("addTabsAria")}
          active={tab}
          onChange={setTab}
          tabs={TABS.map<FormTab<Tab>>((entry) => ({
            key: entry.key,
            label: t(entry.labelKey),
            icon: entry.icon,
          }))}
        />
      }
      context={
        /*
          A new record has no cover yet, so a search-result preview would be a
          preview of nothing — the slug field carries its own URL preview. What
          a cataloguer needs here is the shape of the job: which required fields
          are still empty.
        */
        <ContextPanel title={t("addContextTitle")} icon={BookOpen} hint={t("addContextHint")}>
          <p className="text-xs leading-[1.6] text-text-muted">{t("addContextBody")}</p>
        </ContextPanel>
      }
      actions={
        <StickyActionBar
          status={
            error ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-danger-text">
                <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                {error}
              </span>
            ) : (
              <span className="text-text-muted">{t("addStatusHint")}</span>
            )
          }
        >
          <Link href="/admin/catalogs" className={BTN_SECONDARY}>
            {t("cancel")}
          </Link>
          <button type="submit" disabled={loading} className={BTN_PRIMARY}>
            {loading ? <ButtonBusy label={t("saving")} /> : t("saveAndAddCopies")}
          </button>
        </StickyActionBar>
      }
    >
      <div
        id="catalogadd-panel-info"
        role="tabpanel"
        aria-labelledby="catalogadd-tab-info"
        tabIndex={-1}
        hidden={tab !== "info"}
        className="space-y-5 focus:outline-none"
      >
        {/* ── Core info ── */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("titleReq")} required htmlFor="f-title" error={fieldErrors.title} className="sm:col-span-2">
            {(p) => (
              <input
                {...p}
                name="title"
                placeholder={t("titlePlaceholder")}
                onChange={(e) => setPreview((prev) => ({ ...prev, title: e.target.value }))}
              />
            )}
          </Field>

          <SlugField
            value={slug}
            onChange={setSlug}
            source={preview.title}
            routePrefix="/catalogs"
            className="sm:col-span-2"
            siteUrl={SITE_URL}
            checkAvailability={checkCatalogSlugAvailable}
            slugify={catalogRecordSlug}
            disabled={loading}
            error={fieldErrors.slug}
            labels={{
              label: t("slug"),
              autoHint: t("slugAuto"),
              reset: t("slugReset"),
              checking: t("slugChecking"),
              available: t("slugAvailable"),
              taken: t("slugTaken"),
            }}
          />

          <Field label={t("authorReq")} required htmlFor="f-author" error={fieldErrors.author}>
            {(p) => (
              <input
                {...p}
                name="author"
                placeholder={t("authorPlaceholder")}
                onChange={(e) => setPreview((prev) => ({ ...prev, author: e.target.value }))}
              />
            )}
          </Field>

          <Field label={t("languageReq")} required htmlFor="f-language">
            {(p) => (
              <select {...p} name="language" defaultValue="km">
                <option value="km">{t("lang.km")}</option>
                <option value="en">{t("lang.en")}</option>
                <option value="fr">{t("lang.fr")}</option>
                <option value="zh">{t("lang.zh")}</option>
                <option value="other">{t("lang.other")}</option>
              </select>
            )}
          </Field>

          <Field label={t("isbn")} htmlFor="f-isbn" error={fieldErrors.isbn}>
            {(p) => <input {...p} name="isbn" placeholder="978-0-000-00000-0" />}
          </Field>

          <Field label={t("publisher")} htmlFor="f-publisher" error={fieldErrors.publisher}>
            {(p) => <input {...p} name="publisher" placeholder={t("optional")} />}
          </Field>

          <Field label={t("year")} htmlFor="f-year" error={fieldErrors.year}>
            {(p) => (
              <input {...p} name="year" inputMode="numeric" placeholder={String(new Date().getFullYear())} />
            )}
          </Field>

          <Field label={t("category")} htmlFor="f-category" error={fieldErrors.category}>
            {(p) => (
              <>
                <input
                  {...p}
                  name="category"
                  list="cat-list"
                  placeholder={t("categoryPlaceholder")}
                  onChange={(e) => setPreview((prev) => ({ ...prev, category: e.target.value }))}
                />
                <datalist id="cat-list">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </>
            )}
          </Field>

          <Field label={t("department")} htmlFor="f-department" error={fieldErrors.department}>
            {(p) => <input {...p} name="department" placeholder={t("departmentPlaceholder")} />}
          </Field>
        </div>

        <hr className="border-divider" />

        {/* ── Library-specific ── */}
        <h2 className="text-sm font-semibold text-text-heading">{t("libraryDetails")}</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("shelfLocation")}
            htmlFor="f-shelf"
            error={fieldErrors.shelf_location}
            hint={t("shelfHint")}
          >
            {(p) => <input {...p} name="shelf_location" placeholder="A-3-12" />}
          </Field>
        </div>
      </div>

      <div
        id="catalogadd-panel-media"
        role="tabpanel"
        aria-labelledby="catalogadd-tab-media"
        tabIndex={-1}
        hidden={tab !== "media"}
        className="space-y-5 focus:outline-none"
      >
        {/* Book cover — upload to PTEC Storage / external URL / auto-generated */}
        <CatalogCoverField
          initialCoverUrl={null}
          initialSource="generated"
          title={preview.title}
          author={preview.author}
          category={preview.category}
          disabled={loading}
        />
        {fieldErrors.cover && (
          <p role="alert" className={ERROR_CLASS}>
            {fieldErrors.cover}
          </p>
        )}

        <Field label={t("description")} htmlFor="f-description" error={fieldErrors.description}>
          {(p) => (
            <textarea
              {...p}
              className={`${p.className} h-auto resize-none py-3 leading-relaxed`}
              name="description"
              rows={4}
              placeholder={t("descriptionPlaceholder")}
            />
          )}
        </Field>

        <Field label={t("keywords")} htmlFor="f-keywords" hint={t("keywordsHint")}>
          <TagInput name="keywords" placeholder={t("keywordsPlaceholder")} disabled={loading} />
        </Field>

        <SeoOverrideFields
          routePrefix="/catalogs"
          siteUrl={SITE_URL}
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

        {/* Actions */}
      </div>

    </FormShell>
  );
}
