"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { SlidersHorizontal, X } from "lucide-react";
import { withUpdatedParams, EBOOKS_BASE_PATH } from "@/lib/admin/ebooks-url";
import SearchableSelect from "@/components/ui/search/SearchableSelect";
import {
  EBOOK_STATUSES,
  EBOOK_STATUS_LABELS,
  EBOOK_SORT_OPTIONS,
  EBOOK_SORT_LABELS,
  EBOOK_FILE_STATUS_OPTIONS,
  EBOOK_FILE_STATUS_LABELS,
  EBOOK_COVER_STATUS_OPTIONS,
  EBOOK_COVER_STATUS_LABELS,
  EBOOK_QUALITY_OPTIONS,
  EBOOK_VERIFICATION_OPTIONS,
  EBOOK_VERIFICATION_LABELS,
  type EbookOption,
} from "@/lib/admin/ebooks-shared";
import { METADATA_TIER_LABELS, type MetadataQualityTier } from "@/lib/admin/ebook-quality";

/**
 * SearchableSelect styled down to a command-bar control: 40px tall, square
 * corners, and — when a filter is applied — a brand-tinted trigger plus a
 * dot, so an active filter is visible without reading the value.
 */
const compactSelect = "relative w-[168px] shrink-0 [&_button]:h-10 [&_button]:rounded-lg [&_button]:px-3 [&_button]:text-[13.5px]";
const compactSelectActive =
  "[&_button]:border-surface-brand-line [&_button]:bg-surface-brand-soft [&_button>span]:font-medium [&_button>span]:text-brand";

function ActiveDot() {
  return (
    <span
      className="pointer-events-none absolute -right-1 -top-1 z-10 h-2 w-2 rounded-full bg-brand ring-2 ring-bg-surface"
      aria-hidden="true"
    />
  );
}

export type EbookFiltersValue = {
  status: string;
  dept: string;
  category: string;
  year: string;
  language: string;
  fileStatus: string;
  coverStatus: string;
  quality: string;
  verification: string;
  sort: string;
};

type FiltersProps = {
  value: EbookFiltersValue;
  departments: EbookOption[];
  categories: EbookOption[];
  languages: EbookOption[];
  years: EbookOption[];
  hasActiveFilters: boolean;
};

const isSet = (v: string) => Boolean(v) && v !== "all";

/**
 * Filter controls only — a fragment, so EbookToolbar can lay them out on the
 * same line as the search box. The removable chips are a separate export
 * because they belong on the command bar's second line.
 */
export default function EbookFilters({
  value,
  departments,
  categories,
  languages,
  years,
  hasActiveFilters,
}: FiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("adminEbooks.filters");
  const tStatus = useTranslations("adminEbooks.status");
  const tSort = useTranslations("adminEbooks.sort");
  const [moreOpen, setMoreOpen] = useState(false);

  const setParam = (key: string, v: string) => {
    router.push(withUpdatedParams(searchParams, { [key]: v === "all" || v === "" ? null : v }));
  };

  return (
    <>
      <div className={`${compactSelect} ${isSet(value.status) ? compactSelectActive : ""}`}>
        {isSet(value.status) && <ActiveDot />}
        <SearchableSelect
          name="status-filter"
          ariaLabel={t("byStatus")}
          chevron="down"
          value={value.status || "all"}
          onChange={(v) => setParam("status", v)}
          options={[{ value: "all", label: t("allStatuses") }, ...EBOOK_STATUSES.map((s) => ({ value: s, label: tStatus(s) }))]}
        />
      </div>

      <div className={`${compactSelect} ${isSet(value.dept) ? compactSelectActive : ""}`}>
        {isSet(value.dept) && <ActiveDot />}
        <SearchableSelect
          name="department-filter"
          ariaLabel={t("byDepartment")}
          chevron="down"
          value={value.dept || "all"}
          onChange={(v) => setParam("dept", v)}
          options={[{ value: "all", label: t("allDepartments") }, ...departments]}
        />
      </div>

      <div className={compactSelect}>
        <SearchableSelect
          name="sort-filter"
          ariaLabel={t("sortEbooks")}
          chevron="down"
          value={value.sort || "newest"}
          onChange={(v) => setParam("sort", v)}
          options={EBOOK_SORT_OPTIONS.map((s) => ({ value: s, label: tSort(s) }))}
        />
      </div>

      <MoreFiltersButton
        open={moreOpen}
        onOpenChange={setMoreOpen}
        value={value}
        categories={categories}
        languages={languages}
        years={years}
      />

      {hasActiveFilters && (
        <button
          type="button"
          onClick={() => router.push(EBOOKS_BASE_PATH)}
          className="h-10 rounded-lg px-2 text-[13px] font-medium text-text-muted transition-colors duration-150 hover:text-brand"
        >
          {t("clearFilters")}
        </button>
      )}
    </>
  );
}

/** Active filters as removable chips — the command bar's second line. */
export function EbookFilterChips({ value, departments, categories }: Pick<FiltersProps, "value" | "departments" | "categories">) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("adminEbooks.filters");
  const tStatus = useTranslations("adminEbooks.status");
  const tFile = useTranslations("adminEbooks.fileStatus");
  const tCover = useTranslations("adminEbooks.coverStatus");
  const tQuality = useTranslations("adminEbooks.quality");
  const tVerification = useTranslations("adminEbooks.verification");

  const optionLabel = (options: EbookOption[], v: string) => options.find((o) => o.value === v)?.label ?? v;

  const chips: { key: string; label: string }[] = [];
  if (isSet(value.status)) chips.push({ key: "status", label: t("statusChip", { label: EBOOK_STATUS_LABELS[value.status as keyof typeof EBOOK_STATUS_LABELS] ? tStatus(value.status) : value.status }) });
  if (isSet(value.dept)) chips.push({ key: "dept", label: t("deptChip", { label: optionLabel(departments, value.dept) }) });
  if (isSet(value.category)) chips.push({ key: "category", label: t("categoryChip", { label: optionLabel(categories, value.category) }) });
  if (isSet(value.year)) chips.push({ key: "year", label: t("yearChip", { label: value.year }) });
  if (isSet(value.language)) chips.push({ key: "language", label: t("languageChip", { label: value.language }) });
  if (isSet(value.fileStatus)) chips.push({ key: "fileStatus", label: EBOOK_FILE_STATUS_LABELS[value.fileStatus as keyof typeof EBOOK_FILE_STATUS_LABELS] ? tFile(value.fileStatus) : value.fileStatus });
  if (isSet(value.coverStatus)) chips.push({ key: "coverStatus", label: EBOOK_COVER_STATUS_LABELS[value.coverStatus as keyof typeof EBOOK_COVER_STATUS_LABELS] ? tCover(value.coverStatus) : value.coverStatus });
  if (isSet(value.quality)) chips.push({ key: "quality", label: t("metadataChip", { label: METADATA_TIER_LABELS[value.quality as MetadataQualityTier] ? tQuality(value.quality) : value.quality }) });
  if (isSet(value.verification)) chips.push({ key: "verification", label: t("verificationChip", { label: EBOOK_VERIFICATION_LABELS[value.verification as keyof typeof EBOOK_VERIFICATION_LABELS] ? tVerification(value.verification) : value.verification }) });

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label={t("activeFilters")}>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => router.push(withUpdatedParams(searchParams, { [chip.key]: null }))}
          className="inline-flex items-center gap-1 rounded-full border border-surface-brand-line bg-surface-brand-soft px-2.5 py-1 text-xs font-medium text-brand transition-colors duration-150 hover:border-brand/40 hover:bg-brand/10"
        >
          {chip.label}
          <X className="h-3 w-3" aria-hidden="true" />
          <span className="sr-only">{t("removeFilter")}</span>
        </button>
      ))}
    </div>
  );
}

/** Category, year, language, file/cover status, metadata quality — tucked into a small dialog. */
function MoreFiltersButton({
  open,
  onOpenChange,
  value,
  categories,
  languages,
  years,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: EbookFiltersValue;
  categories: EbookOption[];
  languages: EbookOption[];
  years: EbookOption[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("adminEbooks.filters");
  const tFile = useTranslations("adminEbooks.fileStatus");
  const tCover = useTranslations("adminEbooks.coverStatus");
  const tQuality = useTranslations("adminEbooks.quality");
  const tVerification = useTranslations("adminEbooks.verification");
  const headingId = "ebook-filters-heading";
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstFieldRef = useRef<HTMLButtonElement>(null);

  const [category, setCategory] = useState(value.category);
  const [year, setYear] = useState(value.year);
  const [language, setLanguage] = useState(value.language);
  const [fileStatus, setFileStatus] = useState(value.fileStatus);
  const [coverStatus, setCoverStatus] = useState(value.coverStatus);
  const [quality, setQuality] = useState(value.quality);
  const [verification, setVerification] = useState(value.verification);

  useEffect(() => {
    if (!open) return;
    setCategory(value.category);
    setYear(value.year);
    setLanguage(value.language);
    setFileStatus(value.fileStatus);
    setCoverStatus(value.coverStatus);
    setQuality(value.quality);
    setVerification(value.verification);
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const focusTimer = window.setTimeout(() => firstFieldRef.current?.focus(), 0);
    const trigger = triggerRef.current;

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(focusTimer);
      trigger?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const activeExtra = [
    value.category,
    value.year,
    value.language,
    value.fileStatus,
    value.coverStatus,
    value.quality,
    value.verification,
  ].some((v) => v && v !== "all");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onOpenChange(false);
    router.push(withUpdatedParams(searchParams, {
      category: category || null,
      year: year || null,
      language: language || null,
      fileStatus: fileStatus || null,
      coverStatus: coverStatus || null,
      quality: quality || null,
      verification: verification || null,
    }));
  }

  const fieldLabel = "mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted";

  return (
    <>
      <div className="relative shrink-0">
        {activeExtra && <ActiveDot />}
        <button
          ref={triggerRef}
          type="button"
          onClick={() => onOpenChange(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={`inline-flex h-10 items-center gap-1.5 rounded-lg border px-3 text-[13.5px] transition-colors duration-150 ${
            activeExtra
              ? "border-surface-brand-line bg-surface-brand-soft font-medium text-brand"
              : "border-divider bg-bg-surface text-text-body hover:bg-paper"
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          {t("moreFilters")}
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => onOpenChange(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
        >
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-bg-surface p-6 shadow-2xl sm:rounded-2xl"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 id={headingId} className="text-lg font-bold text-text-heading">{t("moreFilters")}</h2>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label={t("close")}
                className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:bg-paper hover:text-text-heading"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className={fieldLabel}>{t("category")}</span>
                <SearchableSelect
                  ref={firstFieldRef}
                  name="category-filter"
                  ariaLabel={t("category")}
                  value={category || "all"}
                  onChange={setCategory}
                  options={[{ value: "all", label: t("allCategories") }, ...categories]}
                />
              </label>

              <label className="block">
                <span className={fieldLabel}>{t("year")}</span>
                <SearchableSelect
                  name="year-filter"
                  ariaLabel={t("year")}
                  value={year || "all"}
                  onChange={setYear}
                  options={[{ value: "all", label: t("allYears") }, ...years]}
                />
              </label>

              <label className="block">
                <span className={fieldLabel}>{t("language")}</span>
                <SearchableSelect
                  name="language-filter"
                  ariaLabel={t("language")}
                  value={language || "all"}
                  onChange={setLanguage}
                  options={[{ value: "all", label: t("allLanguages") }, ...languages]}
                />
              </label>

              <label className="block">
                <span className={fieldLabel}>{t("fileStatusLabel")}</span>
                <SearchableSelect
                  name="file-status-filter"
                  ariaLabel={t("fileStatusLabel")}
                  value={fileStatus || "all"}
                  onChange={setFileStatus}
                  options={[{ value: "all", label: t("anyFileStatus") }, ...EBOOK_FILE_STATUS_OPTIONS.map((f) => ({ value: f, label: tFile(f) }))]}
                />
              </label>

              <label className="block">
                <span className={fieldLabel}>{t("coverStatusLabel")}</span>
                <SearchableSelect
                  name="cover-status-filter"
                  ariaLabel={t("coverStatusLabel")}
                  value={coverStatus || "all"}
                  onChange={setCoverStatus}
                  options={[{ value: "all", label: t("anyCoverStatus") }, ...EBOOK_COVER_STATUS_OPTIONS.map((c) => ({ value: c, label: tCover(c) }))]}
                />
              </label>

              <label className="block">
                <span className={fieldLabel}>{t("verificationLabel")}</span>
                <SearchableSelect
                  name="verification-filter"
                  ariaLabel={t("verificationLabel")}
                  value={verification || "all"}
                  onChange={setVerification}
                  options={[{ value: "all", label: t("anyVerification") }, ...EBOOK_VERIFICATION_OPTIONS.map((v) => ({ value: v, label: tVerification(v) }))]}
                />
              </label>

              <label className="block">
                <span className={fieldLabel}>{t("metadataQuality")}</span>
                <SearchableSelect
                  name="quality-filter"
                  ariaLabel={t("metadataQuality")}
                  value={quality || "all"}
                  onChange={setQuality}
                  options={[{ value: "all", label: t("anyQuality") }, ...EBOOK_QUALITY_OPTIONS.map((q) => ({ value: q, label: tQuality(q) }))]}
                />
              </label>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={() => { setCategory(""); setYear(""); setLanguage(""); setFileStatus(""); setCoverStatus(""); setQuality(""); setVerification(""); }}
                className="text-[13px] font-semibold text-text-muted hover:text-brand"
              >
                {t("clearThese")}
              </button>
              <button
                type="submit"
                className="ml-auto inline-flex items-center justify-center rounded-xl bg-brand px-6 py-2.5 text-sm font-bold text-white transition hover:bg-brand-hover"
              >
                {t("apply")}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
