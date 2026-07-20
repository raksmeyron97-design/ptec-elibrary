"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { SlidersHorizontal, X } from "lucide-react";
import { withUpdatedParams } from "@/lib/admin/theses-url";
import SearchableSelect from "@/components/ui/search/SearchableSelect";
import {
  STATUSES,
  STATUS_LABELS,
  SORT_OPTIONS,
  FILE_STATUS_OPTIONS,
  METADATA_QUALITY_OPTIONS,
  type ThesisProgramOption,
  type ThesisTextOption,
} from "@/lib/admin/theses-shared";
import { METADATA_TIER_LABELS, type MetadataQualityTier } from "@/lib/admin/thesis-metadata-quality";

const compactSelectWrapper = "w-[172px] shrink-0 [&_button]:h-10";

const SORT_LABELS: Record<(typeof SORT_OPTIONS)[number], string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  "most-viewed": "Most viewed",
  "most-downloaded": "Most downloaded",
  "title-asc": "Title A–Z",
  "title-desc": "Title Z–A",
  updated: "Recently updated",
  "metadata-quality": "Metadata completeness",
};

const FILE_STATUS_LABELS: Record<(typeof FILE_STATUS_OPTIONS)[number], string> = {
  has_pdf: "Has PDF",
  missing_pdf: "Missing PDF",
  has_cover: "Has cover",
  missing_cover: "Missing cover",
};

export type ThesisFiltersValue = {
  status: string;
  program: string;
  cohort: string;
  academicYear: string;
  fileStatus: string;
  metadataQuality: string;
  sort: string;
};

export default function ThesisFilters({
  value,
  programs,
  cohorts,
  academicYears,
  hasActiveFilters,
}: {
  value: ThesisFiltersValue;
  programs: ThesisProgramOption[];
  cohorts: ThesisTextOption[];
  academicYears: ThesisTextOption[];
  hasActiveFilters: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("adminTheses.filters");
  const tStatus = useTranslations("adminTheses.status");
  const tSort = useTranslations("adminTheses.sort");
  const tFile = useTranslations("adminTheses.fileStatus");
  const tQuality = useTranslations("adminEbooks.quality");
  const [moreOpen, setMoreOpen] = useState(false);

  const setParam = (key: string, v: string) => {
    router.push(withUpdatedParams(searchParams, { [key]: v === "all" || v === "" ? null : v }));
  };

  const chips: { key: string; label: string }[] = [];
  if (value.status && value.status !== "all") chips.push({ key: "status", label: t("statusChip", { label: STATUS_LABELS[value.status as keyof typeof STATUS_LABELS] ? tStatus(value.status) : value.status }) });
  if (value.program && value.program !== "all") chips.push({ key: "program", label: t("programChip", { label: programs.find((p) => p.code === value.program)?.label ?? value.program }) });
  if (value.cohort && value.cohort !== "all") chips.push({ key: "cohort", label: t("cohortChip", { label: cohorts.find((c) => c.value === value.cohort)?.label ?? value.cohort }) });
  if (value.academicYear && value.academicYear !== "all") chips.push({ key: "academicYear", label: t("yearChip", { label: value.academicYear }) });
  if (value.fileStatus && value.fileStatus !== "all") chips.push({ key: "fileStatus", label: FILE_STATUS_LABELS[value.fileStatus as keyof typeof FILE_STATUS_LABELS] ? tFile(value.fileStatus) : value.fileStatus });
  if (value.metadataQuality && value.metadataQuality !== "all") chips.push({ key: "metadataQuality", label: t("metadataChip", { label: METADATA_TIER_LABELS[value.metadataQuality as MetadataQualityTier] ? tQuality(value.metadataQuality) : value.metadataQuality }) });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className={compactSelectWrapper}>
          <SearchableSelect
            name="status-filter"
            ariaLabel={t("byStatus")}
            value={value.status || "all"}
            onChange={(v) => setParam("status", v)}
            options={[{ value: "all", label: t("allStatuses") }, ...STATUSES.map((s) => ({ value: s, label: tStatus(s) }))]}
          />
        </div>

        <div className={compactSelectWrapper}>
          <SearchableSelect
            name="program-filter"
            ariaLabel={t("byProgram")}
            value={value.program || "all"}
            onChange={(v) => setParam("program", v)}
            options={[{ value: "all", label: t("allPrograms") }, ...programs.map((p) => ({ value: p.code, label: p.label }))]}
          />
        </div>

        <div className={compactSelectWrapper}>
          <SearchableSelect
            name="sort-filter"
            ariaLabel={t("sortTheses")}
            value={value.sort || "newest"}
            onChange={(v) => setParam("sort", v)}
            options={SORT_OPTIONS.map((s) => ({ value: s, label: tSort(s) }))}
          />
        </div>

        <MoreFiltersButton
          open={moreOpen}
          onOpenChange={setMoreOpen}
          value={value}
          cohorts={cohorts}
          academicYears={academicYears}
        />

        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => router.push("/admin/theses")}
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

/** Cohort + Academic Year + File Status + Metadata Quality — less common, tucked into a small dialog. */
function MoreFiltersButton({
  open,
  onOpenChange,
  value,
  cohorts,
  academicYears,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: ThesisFiltersValue;
  cohorts: ThesisTextOption[];
  academicYears: ThesisTextOption[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("adminTheses.filters");
  const tFile = useTranslations("adminTheses.fileStatus");
  const tQuality = useTranslations("adminEbooks.quality");
  const headingId = "thesis-filters-heading";
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstFieldRef = useRef<HTMLButtonElement>(null);

  const [cohort, setCohort] = useState(value.cohort);
  const [academicYear, setAcademicYear] = useState(value.academicYear);
  const [fileStatus, setFileStatus] = useState(value.fileStatus);
  const [metadataQuality, setMetadataQuality] = useState(value.metadataQuality);

  useEffect(() => {
    if (!open) return;
    setCohort(value.cohort);
    setAcademicYear(value.academicYear);
    setFileStatus(value.fileStatus);
    setMetadataQuality(value.metadataQuality);
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

  const activeExtra = [value.cohort, value.academicYear, value.fileStatus, value.metadataQuality].some((v) => v && v !== "all");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onOpenChange(false);
    router.push(withUpdatedParams(searchParams, {
      cohort: cohort || null,
      academicYear: academicYear || null,
      fileStatus: fileStatus || null,
      metadataQuality: metadataQuality || null,
    }));
  }

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
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">{t("cohort")}</span>
                <SearchableSelect
                  ref={firstFieldRef}
                  name="cohort-filter"
                  ariaLabel={t("cohort")}
                  value={cohort || "all"}
                  onChange={setCohort}
                  options={[{ value: "all", label: t("allCohorts") }, ...cohorts.map((c) => ({ value: c.value, label: c.label }))]}
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">{t("academicYear")}</span>
                <SearchableSelect
                  name="academic-year-filter"
                  ariaLabel={t("academicYear")}
                  value={academicYear || "all"}
                  onChange={setAcademicYear}
                  options={[{ value: "all", label: t("allYears") }, ...academicYears.map((y) => ({ value: y.value, label: y.label }))]}
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">{t("fileStatusLabel")}</span>
                <SearchableSelect
                  name="file-status-filter"
                  ariaLabel={t("fileStatusLabel")}
                  value={fileStatus || "all"}
                  onChange={setFileStatus}
                  options={[{ value: "all", label: t("anyFileStatus") }, ...FILE_STATUS_OPTIONS.map((f) => ({ value: f, label: tFile(f) }))]}
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">{t("metadataQuality")}</span>
                <SearchableSelect
                  name="metadata-quality-filter"
                  ariaLabel={t("metadataQuality")}
                  value={metadataQuality || "all"}
                  onChange={setMetadataQuality}
                  options={[{ value: "all", label: t("anyQuality") }, ...METADATA_QUALITY_OPTIONS.map((q) => ({ value: q, label: tQuality(q) }))]}
                />
              </label>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={() => { setCohort(""); setAcademicYear(""); setFileStatus(""); setMetadataQuality(""); }}
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
