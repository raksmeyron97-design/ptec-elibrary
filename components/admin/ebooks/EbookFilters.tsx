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
  type EbookOption,
} from "@/lib/admin/ebooks-shared";
import { METADATA_TIER_LABELS, type MetadataQualityTier } from "@/lib/admin/ebook-quality";

const compactSelectWrapper = "w-[172px] shrink-0 [&_button]:h-10";

export type EbookFiltersValue = {
  status: string;
  dept: string;
  category: string;
  year: string;
  language: string;
  fileStatus: string;
  coverStatus: string;
  quality: string;
  sort: string;
};

export default function EbookFilters({
  value,
  departments,
  categories,
  languages,
  years,
  hasActiveFilters,
}: {
  value: EbookFiltersValue;
  departments: EbookOption[];
  categories: EbookOption[];
  languages: EbookOption[];
  years: EbookOption[];
  hasActiveFilters: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("adminEbooks.filters");
  const tStatus = useTranslations("adminEbooks.status");
  const tSort = useTranslations("adminEbooks.sort");
  const tFile = useTranslations("adminEbooks.fileStatus");
  const tCover = useTranslations("adminEbooks.coverStatus");
  const tQuality = useTranslations("adminEbooks.quality");
  const [moreOpen, setMoreOpen] = useState(false);

  const setParam = (key: string, v: string) => {
    router.push(withUpdatedParams(searchParams, { [key]: v === "all" || v === "" ? null : v }));
  };

  const optionLabel = (options: EbookOption[], v: string) => options.find((o) => o.value === v)?.label ?? v;

  const chips: { key: string; label: string }[] = [];
  if (value.status && value.status !== "all") chips.push({ key: "status", label: t("statusChip", { label: EBOOK_STATUS_LABELS[value.status as keyof typeof EBOOK_STATUS_LABELS] ? tStatus(value.status) : value.status }) });
  if (value.dept && value.dept !== "all") chips.push({ key: "dept", label: t("deptChip", { label: optionLabel(departments, value.dept) }) });
  if (value.category && value.category !== "all") chips.push({ key: "category", label: t("categoryChip", { label: optionLabel(categories, value.category) }) });
  if (value.year && value.year !== "all") chips.push({ key: "year", label: t("yearChip", { label: value.year }) });
  if (value.language && value.language !== "all") chips.push({ key: "language", label: t("languageChip", { label: value.language }) });
  if (value.fileStatus && value.fileStatus !== "all") chips.push({ key: "fileStatus", label: EBOOK_FILE_STATUS_LABELS[value.fileStatus as keyof typeof EBOOK_FILE_STATUS_LABELS] ? tFile(value.fileStatus) : value.fileStatus });
  if (value.coverStatus && value.coverStatus !== "all") chips.push({ key: "coverStatus", label: EBOOK_COVER_STATUS_LABELS[value.coverStatus as keyof typeof EBOOK_COVER_STATUS_LABELS] ? tCover(value.coverStatus) : value.coverStatus });
  if (value.quality && value.quality !== "all") chips.push({ key: "quality", label: t("metadataChip", { label: METADATA_TIER_LABELS[value.quality as MetadataQualityTier] ? tQuality(value.quality) : value.quality }) });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className={compactSelectWrapper}>
          <SearchableSelect
            name="status-filter"
            ariaLabel={t("byStatus")}
            value={value.status || "all"}
            onChange={(v) => setParam("status", v)}
            options={[{ value: "all", label: t("allStatuses") }, ...EBOOK_STATUSES.map((s) => ({ value: s, label: tStatus(s) }))]}
          />
        </div>

        <div className={compactSelectWrapper}>
          <SearchableSelect
            name="department-filter"
            ariaLabel={t("byDepartment")}
            value={value.dept || "all"}
            onChange={(v) => setParam("dept", v)}
            options={[{ value: "all", label: t("allDepartments") }, ...departments]}
          />
        </div>

        <div className={compactSelectWrapper}>
          <SearchableSelect
            name="sort-filter"
            ariaLabel={t("sortEbooks")}
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
            className="rounded-lg px-2 py-1 text-[13px] font-semibold text-text-muted transition hover:text-brand"
          >
            {t("clearFilters")}
          </button>
        )}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label={t("activeFilters")}>
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => setParam(chip.key, "")}
              className="inline-flex items-center gap-1 rounded-full border border-brand/30 bg-brand/5 px-2.5 py-1 text-[12px] font-semibold text-brand transition hover:bg-brand/10"
            >
              {chip.label}
              <X className="h-3 w-3" aria-hidden="true" />
              <span className="sr-only">{t("removeFilter")}</span>
            </button>
          ))}
        </div>
      )}
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
  const headingId = "ebook-filters-heading";
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstFieldRef = useRef<HTMLButtonElement>(null);

  const [category, setCategory] = useState(value.category);
  const [year, setYear] = useState(value.year);
  const [language, setLanguage] = useState(value.language);
  const [fileStatus, setFileStatus] = useState(value.fileStatus);
  const [coverStatus, setCoverStatus] = useState(value.coverStatus);
  const [quality, setQuality] = useState(value.quality);

  useEffect(() => {
    if (!open) return;
    setCategory(value.category);
    setYear(value.year);
    setLanguage(value.language);
    setFileStatus(value.fileStatus);
    setCoverStatus(value.coverStatus);
    setQuality(value.quality);
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

  const activeExtra = [value.category, value.year, value.language, value.fileStatus, value.coverStatus, value.quality].some(
    (v) => v && v !== "all",
  );

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
    }));
  }

  const fieldLabel = "mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => onOpenChange(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3.5 text-[13.5px] font-semibold transition ${
          activeExtra
            ? "border-brand bg-brand/5 text-brand"
            : "border-divider bg-bg-surface text-text-body hover:bg-paper"
        }`}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        {t("moreFilters")}
      </button>

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
                onClick={() => { setCategory(""); setYear(""); setLanguage(""); setFileStatus(""); setCoverStatus(""); setQuality(""); }}
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
