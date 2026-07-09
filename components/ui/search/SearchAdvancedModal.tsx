"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/core/Button";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";

interface Props {
  currentQ: string;
  currentAuthor: string;
  currentAdvisor: string;
  currentIsbn: string;
  currentPublisher: string;
  currentSubject: string;
  currentLanguage: string;
  currentDepartment: string;
  currentProgram: string;
  currentCohort: string;
  currentYear: string;
  currentFormat: string;
  currentAvailability: string;
  currentViews: string;
  currentDownloads: string;
  currentRating: string;
  categories: string[];
  languages: string[];
  departments: string[];
}

type Draft = {
  q: string;
  author: string;
  advisor: string;
  isbn: string;
  publisher: string;
  subject: string;
  language: string;
  department: string;
  program: string;
  cohort: string;
  year: string;
  format: string;
  availability: string;
  views: string;
  downloads: string;
  rating: string;
};

const fieldFocusClass =
  "focus:outline-none focus:ring-2 focus:ring-focus-ring/30 focus:border-brand";

const inputClass = `h-10 w-full rounded-xl border border-divider bg-bg-surface px-3 text-[13.5px] text-text-body outline-none transition-colors ${fieldFocusClass}`;
const selectClass = `h-10 w-full rounded-xl border border-divider bg-bg-surface px-3 text-[13.5px] text-text-body outline-none transition-colors appearance-none cursor-pointer ${fieldFocusClass}`;
const EMPTY_DRAFT: Draft = {
  q: "",
  author: "",
  advisor: "",
  isbn: "",
  publisher: "",
  subject: "",
  language: "",
  department: "",
  program: "",
  cohort: "",
  year: "",
  format: "",
  availability: "",
  views: "",
  downloads: "",
  rating: "",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

export default function SearchAdvancedModal({
  currentQ,
  currentAuthor,
  currentAdvisor,
  currentIsbn,
  currentPublisher,
  currentSubject,
  currentLanguage,
  currentDepartment,
  currentProgram,
  currentCohort,
  currentYear,
  currentFormat,
  currentAvailability,
  currentViews,
  currentDownloads,
  currentRating,
  categories,
  languages,
  departments,
}: Props) {
  const router = useRouter();
  const t = useTranslations("search");
  const [open, setOpen] = useState(false);
  const headingId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const trapRef = useFocusTrap<HTMLDivElement>(open);

  const currentDraft: Draft = useMemo(
    () => ({
      q: currentQ,
      author: currentAuthor,
      advisor: currentAdvisor,
      isbn: currentIsbn,
      publisher: currentPublisher,
      subject: currentSubject,
      language: currentLanguage,
      department: currentDepartment,
      program: currentProgram,
      cohort: currentCohort,
      year: currentYear,
      format: currentFormat,
      availability: currentAvailability,
      views: currentViews,
      downloads: currentDownloads,
      rating: currentRating,
    }),
    [
      currentQ,
      currentAuthor,
      currentAdvisor,
      currentIsbn,
      currentPublisher,
      currentSubject,
      currentLanguage,
      currentDepartment,
      currentProgram,
      currentCohort,
      currentYear,
      currentFormat,
      currentAvailability,
      currentViews,
      currentDownloads,
      currentRating,
    ],
  );

  const [draft, setDraft] = useState<Draft>(() => currentDraft);
  const updateDraft = (key: keyof Draft, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  // Reset the draft form to the URL's current state each time the modal opens.
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
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
  }, [
    open,
  ]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const params: Record<string, string> = {};
    if (draft.q) params.q = draft.q;
    if (draft.author) params.author = draft.author;
    if (draft.advisor) params.advisor = draft.advisor;
    if (draft.isbn) params.isbn = draft.isbn;
    if (draft.publisher) params.publisher = draft.publisher;
    if (draft.subject) params.subject = draft.subject;
    if (draft.language) params.lang = draft.language;
    if (draft.department) params.dept = draft.department;
    if (draft.program) params.program = draft.program;
    if (draft.cohort) params.cohort = draft.cohort;
    if (draft.year) params.year = draft.year;
    if (draft.format) params.format = draft.format;
    if (draft.availability) params.availability = draft.availability;
    if (draft.views) params.views = draft.views;
    if (draft.downloads) params.downloads = draft.downloads;
    if (draft.rating) params.rating = draft.rating;

    const qs = new URLSearchParams(params).toString();
    setOpen(false);
    router.push(`/search${qs ? `?${qs}` : ""}`);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setDraft(currentDraft);
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-divider bg-bg-surface px-3.5 text-[12.5px] font-semibold text-text-body shadow-sm transition-colors duration-150 hover:border-brand/40 hover:bg-brand/5 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        {t("advancedSearch")}
      </button>

      {open && (
        <div
          ref={trapRef}
          className="modal-backdrop-in fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
        >
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="modal-pop-in max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-bg-surface p-6 shadow-2xl sm:rounded-2xl"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 id={headingId} className="text-lg font-bold text-text-heading">
                {t("advancedSearch")}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("advClose")}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-text-muted transition-colors duration-150 hover:bg-paper hover:text-text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <Field label={t("advFieldKeyword")}>
                <input
                  ref={firstFieldRef}
                  value={draft.q}
                  onChange={(e) => updateDraft("q", e.target.value)}
                  placeholder={t("advPlaceholderKeyword")}
                  className={inputClass}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label={t("advFieldAuthor")}>
                  <input
                    value={draft.author}
                    onChange={(e) => updateDraft("author", e.target.value)}
                    placeholder={t("advAnyAuthor")}
                    className={inputClass}
                  />
                </Field>

                <Field label={t("advFieldAdvisor")}>
                  <input
                    value={draft.advisor}
                    onChange={(e) => updateDraft("advisor", e.target.value)}
                    placeholder={t("advAnyAdvisor")}
                    className={inputClass}
                  />
                </Field>

                <Field label={t("advFieldPublisher")}>
                  <input
                    value={draft.publisher}
                    onChange={(e) => updateDraft("publisher", e.target.value)}
                    placeholder={t("advAnyPublisher")}
                    className={inputClass}
                  />
                </Field>

                <Field label={t("advFieldIsbn")}>
                  <input
                    value={draft.isbn}
                    onChange={(e) => updateDraft("isbn", e.target.value)}
                    placeholder={t("advAnyIsbn")}
                    className={inputClass}
                  />
                </Field>

                <Field label={t("advFieldSubject")}>
                  <select value={draft.subject} onChange={(e) => updateDraft("subject", e.target.value)} className={selectClass}>
                    <option value="">{t("advAnySubject")}</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </Field>

                <Field label={t("advFieldLanguage")}>
                  <select value={draft.language} onChange={(e) => updateDraft("language", e.target.value)} className={selectClass}>
                    <option value="">{t("advAnyLanguage")}</option>
                    {languages.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </Field>

                <Field label={t("advFieldDepartment")}>
                  <select value={draft.department} onChange={(e) => updateDraft("department", e.target.value)} className={selectClass}>
                    <option value="">{t("advAnyDepartment")}</option>
                    {departments.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </Field>

                <Field label={t("advFieldProgram")}>
                  <select value={draft.program} onChange={(e) => updateDraft("program", e.target.value)} className={selectClass}>
                    <option value="">{t("advAnyProgram")}</option>
                    <option value="b_ed_12_4">{t("programBEd")}</option>
                    <option value="bachelor_plus_1">{t("programBPlus1")}</option>
                  </select>
                </Field>

                <Field label={t("advFieldCohort")}>
                  <input
                    value={draft.cohort}
                    onChange={(e) => updateDraft("cohort", e.target.value)}
                    placeholder={t("advAnyCohort")}
                    className={inputClass}
                  />
                </Field>

                <Field label={t("advFieldYear")}>
                  <input
                    value={draft.year}
                    onChange={(e) => updateDraft("year", e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
                    placeholder={t("advAnyYear")}
                    inputMode="numeric"
                    className={inputClass}
                  />
                </Field>

                <Field label={t("advFieldFormat")}>
                  <select value={draft.format} onChange={(e) => updateDraft("format", e.target.value)} className={selectClass}>
                    <option value="">{t("advAnyFormat")}</option>
                    <option value="PDF">PDF</option>
                    <option value="Print">{t("formatPrint")}</option>
                    <option value="HTML">HTML</option>
                  </select>
                </Field>

                <Field label={t("advFieldAvailability")}>
                  <select value={draft.availability} onChange={(e) => updateDraft("availability", e.target.value)} className={selectClass}>
                    <option value="">{t("advAnyAvailability")}</option>
                    <option value="digital">{t("availabilityDigital")}</option>
                    <option value="downloadable">{t("availabilityDownloadable")}</option>
                    <option value="available">{t("availabilityAvailable")}</option>
                  </select>
                </Field>

                <Field label={t("advFieldViews")}>
                  <input
                    value={draft.views}
                    onChange={(e) => updateDraft("views", e.target.value.replace(/[^\d]/g, ""))}
                    placeholder={t("advMinViews")}
                    inputMode="numeric"
                    className={inputClass}
                  />
                </Field>

                <Field label={t("advFieldDownloads")}>
                  <input
                    value={draft.downloads}
                    onChange={(e) => updateDraft("downloads", e.target.value.replace(/[^\d]/g, ""))}
                    placeholder={t("advMinDownloads")}
                    inputMode="numeric"
                    className={inputClass}
                  />
                </Field>

                <Field label={t("advFieldRating")}>
                  <select value={draft.rating} onChange={(e) => updateDraft("rating", e.target.value)} className={selectClass}>
                    <option value="">{t("advAnyRating")}</option>
                    <option value="5">5+</option>
                    <option value="4">4+</option>
                    <option value="3">3+</option>
                  </select>
                </Field>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setDraft(EMPTY_DRAFT);
                }}
                className="cursor-pointer rounded-sm text-[13px] font-semibold text-text-muted transition-colors duration-150 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
              >
                {t("advClearAll")}
              </button>
              <Button type="submit" className="ml-auto">
                {t("searchButton")}
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
