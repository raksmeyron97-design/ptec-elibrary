"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/core/Button";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";

interface Props {
  currentQ: string;
  currentAuthor: string;
  currentIsbn: string;
  currentPublisher: string;
  currentCategory: string;
  currentLanguage: string;
  currentDepartment: string;
  categories: string[];
  languages: string[];
  departments: string[];
}

const fieldFocusClass =
  "focus:outline-none focus:ring-2 focus:ring-focus-ring/30 focus:border-brand";

const inputClass = `h-10 w-full rounded-xl border border-divider bg-bg-surface px-3 text-[13.5px] text-text-body outline-none transition-colors ${fieldFocusClass}`;
const selectClass = `h-10 w-full rounded-xl border border-divider bg-bg-surface px-3 text-[13.5px] text-text-body outline-none transition-colors appearance-none cursor-pointer ${fieldFocusClass}`;

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
  currentIsbn,
  currentPublisher,
  currentCategory,
  currentLanguage,
  currentDepartment,
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

  const [q, setQ] = useState(currentQ);
  const [author, setAuthor] = useState(currentAuthor);
  const [isbn, setIsbn] = useState(currentIsbn);
  const [publisher, setPublisher] = useState(currentPublisher);
  const [category, setCategory] = useState(currentCategory);
  const [language, setLanguage] = useState(currentLanguage);
  const [department, setDepartment] = useState(currentDepartment);

  // Reset the draft form to the URL's current state each time the modal opens.
  useEffect(() => {
    if (!open) return;
    setQ(currentQ);
    setAuthor(currentAuthor);
    setIsbn(currentIsbn);
    setPublisher(currentPublisher);
    setCategory(currentCategory);
    setLanguage(currentLanguage);
    setDepartment(currentDepartment);
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
  }, [open, currentQ, currentAuthor, currentIsbn, currentPublisher, currentCategory, currentLanguage, currentDepartment]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const params: Record<string, string> = {};
    if (q) params.q = q;
    if (author) params.author = author;
    if (isbn) params.isbn = isbn;
    if (publisher) params.publisher = publisher;
    if (category) params.category = category;
    if (language) params.lang = language;
    if (department) params.dept = department;

    const qs = new URLSearchParams(params).toString();
    setOpen(false);
    router.push(`/search${qs ? `?${qs}` : ""}`);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
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
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("advPlaceholderKeyword")}
                  className={inputClass}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label={t("advFieldAuthor")}>
                  <input
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder={t("advAnyAuthor")}
                    className={inputClass}
                  />
                </Field>

                <Field label={t("advFieldPublisher")}>
                  <input
                    value={publisher}
                    onChange={(e) => setPublisher(e.target.value)}
                    placeholder={t("advAnyPublisher")}
                    className={inputClass}
                  />
                </Field>

                <Field label={t("advFieldIsbn")}>
                  <input
                    value={isbn}
                    onChange={(e) => setIsbn(e.target.value)}
                    placeholder={t("advAnyIsbn")}
                    className={inputClass}
                  />
                </Field>

                <Field label={t("advFieldCategory")}>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectClass}>
                    <option value="">{t("advAnyCategory")}</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </Field>

                <Field label={t("advFieldLanguage")}>
                  <select value={language} onChange={(e) => setLanguage(e.target.value)} className={selectClass}>
                    <option value="">{t("advAnyLanguage")}</option>
                    {languages.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </Field>

                <Field label={t("advFieldDepartment")}>
                  <select value={department} onChange={(e) => setDepartment(e.target.value)} className={selectClass}>
                    <option value="">{t("advAnyDepartment")}</option>
                    {departments.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  setAuthor("");
                  setIsbn("");
                  setPublisher("");
                  setCategory("");
                  setLanguage("");
                  setDepartment("");
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
