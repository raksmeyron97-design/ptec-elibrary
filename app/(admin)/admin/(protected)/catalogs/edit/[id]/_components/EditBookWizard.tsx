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
import {
  Field,
  ERROR_CLASS,
  FormShell,
  FormTabs,
  StickyActionBar,
  ContextPanel,
  ButtonBusy,
  UnsavedPill,
  BTN_PRIMARY,
  BTN_SECONDARY,
  type FormTab,
} from "@/components/admin/kit/form";
import { AlertCircle, BookOpen, Check, ExternalLink, Image as ImageIcon, Layers, Search, type LucideIcon } from "lucide-react";
import CatalogCoverField from "@/components/admin/catalogs/CatalogCoverField";
import SeoOverrideFields from "@/components/admin/seo/SeoOverrideFields";
import { SITE_URL } from "@/lib/seo/site";
import { useTranslations } from "next-intl";
import type { CoverSource } from "@/lib/catalog-cover-shared";

type Tab = "info" | "media" | "copies";

/*
  Three tabs where there were two. The Info tab had grown into the whole record —
  bibliographic fields, the cover picker, the description, keywords and four SEO
  overrides in one scrolling column — so the fields an editor actually came for
  (title, author, call number) shared a screen with a cover uploader and a
  search-engine preview. Cover and SEO are the same job, done once, and they now
  have their own tab.
*/
const TABS: { key: Tab; labelKey: string; icon: LucideIcon }[] = [
  { key: "info", labelKey: "tabInfo", icon: BookOpen },
  { key: "media", labelKey: "tabMedia", icon: ImageIcon },
  { key: "copies", labelKey: "tabCopies", icon: Layers },
];

function ContextRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-text-body">{value}</dd>
    </div>
  );
}

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
  /*
    Context per tab. Info raises "which record am I on"; Media raises "how will
    this read to someone who has not seen the book". Copies is its own inventory
    surface and needs no commentary from the side.
  */
  const context =
    tab === "copies" ? null : tab === "info" ? (
      <ContextPanel title={te("contextRecordTitle")} icon={BookOpen} hint={te("contextRecordHint")}>
        <dl className="space-y-2 text-[13px]">
          <ContextRow label={te("contextAuthor")} value={book.author || "—"} />
          <ContextRow label={te("contextCategory")} value={book.category || "—"} />
          <ContextRow label={te("contextShelf")} value={book.shelf_location || "—"} />
          <ContextRow label={te("contextCopies")} value={`${stats.available} / ${stats.total}`} />
        </dl>
        <button
          type="button"
          onClick={() => switchTab("copies")}
          className="focus-field mt-3 w-full rounded-lg border border-divider bg-bg-surface px-3 py-2 text-xs font-semibold text-admin-accent-text transition hover:bg-paper"
        >
          {te("managePhysical")}
        </button>
      </ContextPanel>
    ) : (
      <ContextPanel title={te("contextPreviewTitle")} icon={Search} hint={te("contextPreviewHint")}>
        <div className="rounded-lg border border-divider bg-bg-surface p-3">
          <p className="truncate text-[11px] text-success-text">{SITE_URL}/catalogs/{book.slug}</p>
          {/* 15px/1.5 — Khmer titles are the norm in this catalogue, and a 13px
              preview of one previews nothing a reader will see. */}
          <p className="mt-0.5 line-clamp-2 text-[15px] font-medium leading-[1.5] text-info-text">
            {book.author ? `${book.title} by ${book.author}` : book.title}
          </p>
          <p className="mt-1 line-clamp-3 text-[12.5px] leading-[1.6] text-text-body">
            {book.description?.trim() || te("contextNoDescription")}
          </p>
        </div>
      </ContextPanel>
    );

  return (
    <FormShell
      backHref="/admin/catalogs"
      backLabel={t("backToCatalog")}
      title={book.title}
      description={te("title")}
      contentKey={tab}
      formRef={formRef}
      action={handleUpdateBook}
      onFormChange={() => { setDirty(true); setSaved(null); }}
      headerActions={
        <>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold ${
              book.is_active
                ? "border-success-line bg-success-soft text-success-text"
                : "border-divider bg-paper text-text-muted"
            }`}
          >
            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${book.is_active ? "bg-success" : "bg-text-muted/50"}`} />
            {book.is_active ? te("listedPublicly") : te("unlisted")}
          </span>
          {book.is_active && (
            <a href={`/catalogs/${book.slug}`} target="_blank" rel="noopener noreferrer" className={BTN_SECONDARY}>
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              {te("viewPublic")}
            </a>
          )}
        </>
      }
      tabs={
        <FormTabs
          idPrefix="catalog"
          ariaLabel={te("tabsAria")}
          active={tab}
          onChange={switchTab}
          tabs={TABS.map<FormTab<Tab>>((entry) => ({
            key: entry.key,
            label: entry.key === "copies" ? te("tabCopies", { count: stats.total }) : te(entry.labelKey),
            icon: entry.icon,
            /* The dot is the unsaved marker the old hand-rolled tab row carried,
               said in the shared vocabulary: work in progress is a warning, not
               an error. */
            state: entry.key === "info" && dirty ? "warning" : undefined,
            stateLabel: entry.key === "info" && dirty ? te("unsavedChanges") : undefined,
          }))}
        />
      }
      context={context}
      actions={
        /*
          No save bar on Copies. That tab writes through its own per-row actions
          and is unaffected by Save, so a bar there would offer to save a tab it
          has no part in.
        */
        tab === "copies" ? undefined : (
          <StickyActionBar
            status={
              error ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-danger-text">
                  <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  {error}
                </span>
              ) : saved ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-success-text">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  {saved}
                </span>
              ) : dirty ? (
                <UnsavedPill label={te("unsavedChanges")} />
              ) : (
                <span className="text-text-muted">{te("savedShort")}</span>
              )
            }
          >
            <Link href="/admin/catalogs" className={BTN_SECONDARY}>
              {t("cancel")}
            </Link>
            <button type="submit" disabled={loading || !dirty} className={BTN_PRIMARY}>
              {loading ? <ButtonBusy label={t("saving")} /> : te("saveChanges")}
            </button>
          </StickyActionBar>
        )
      }
    >
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

      <div
        id="catalog-panel-info"
        role="tabpanel"
        aria-labelledby="catalog-tab-info"
        tabIndex={-1}
        hidden={tab !== "info"}
        className="space-y-5 focus:outline-none"
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
      </div>

      <div
        id="catalog-panel-media"
        role="tabpanel"
        aria-labelledby="catalog-tab-media"
        tabIndex={-1}
        hidden={tab !== "media"}
        className="space-y-5 focus:outline-none"
      >
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
      </div>

      <div
        id="catalog-panel-copies"
        role="tabpanel"
        aria-labelledby="catalog-tab-copies"
        tabIndex={-1}
        hidden={tab !== "copies"}
        className="focus:outline-none"
      >
        {/* Mounted only while open. CopiesPanel fetches and holds its own copy
            rows, so keeping it alive behind the other two tabs made every
            catalog edit pay for inventory state nobody had asked to see. */}
        {tab === "copies" && (
          <CopiesPanel bookId={book.id} bookShelfLocation={book.shelf_location} initialCopies={initialCopies} />
        )}
      </div>
    </FormShell>
  );
}
