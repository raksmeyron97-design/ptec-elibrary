"use client";

import { useTranslations } from "next-intl";
import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";

const INPUT_CLASS =
  "h-11 w-full rounded-lg border border-divider/60 bg-transparent px-4 text-sm outline-none transition-all placeholder:text-text-muted/50 focus:border-brand focus:ring-[3px] focus:ring-brand/15 hover:border-divider";
const LABEL_CLASS = "block text-sm font-semibold text-text-body mb-1.5";

export default function PeopleStep({
  authors, onAuthorsChange,
  advisorName, onAdvisorNameChange,
  coAdvisorName, onCoAdvisorNameChange,
  publishedAt, onPublishedAtChange,
  defenseDate, onDefenseDateChange,
  submittedDate, onSubmittedDateChange,
  disabled,
  authorsError,
}: {
  authors: string[]; onAuthorsChange: (v: string[]) => void;
  advisorName: string; onAdvisorNameChange: (v: string) => void;
  coAdvisorName: string; onCoAdvisorNameChange: (v: string) => void;
  publishedAt: string; onPublishedAtChange: (v: string) => void;
  defenseDate: string; onDefenseDateChange: (v: string) => void;
  submittedDate: string; onSubmittedDateChange: (v: string) => void;
  disabled?: boolean;
  authorsError?: string;
}) {
  const t = useTranslations("adminThesisForm.people");
  function updateAuthor(i: number, value: string) {
    const next = [...authors];
    next[i] = value;
    onAuthorsChange(next);
  }
  function removeAuthor(i: number) {
    onAuthorsChange(authors.filter((_, idx) => idx !== i));
  }
  function moveAuthor(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= authors.length) return;
    const next = [...authors];
    [next[i], next[j]] = [next[j], next[i]];
    onAuthorsChange(next);
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className={LABEL_CLASS.replace("mb-1.5", "")}>
            {t("authors")} <span className="text-red-500">*</span>
          </label>
          <span className="text-xs text-brand font-medium bg-brand/10 px-2 py-0.5 rounded-full">
            {t("authorCount", { count: authors.length })}
          </span>
        </div>

        <div className="space-y-2">
          {authors.map((name, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex flex-col">
                <button type="button" disabled={disabled || i === 0} onClick={() => moveAuthor(i, -1)} aria-label={t("moveUp", { name: name || t("author") })} className="text-text-muted/50 hover:text-brand disabled:opacity-20">
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" disabled={disabled || i === authors.length - 1} onClick={() => moveAuthor(i, 1)} aria-label={t("moveDown", { name: name || t("author") })} className="text-text-muted/50 hover:text-brand disabled:opacity-20">
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
              <input
                value={name}
                onChange={(e) => updateAuthor(i, e.target.value)}
                disabled={disabled}
                placeholder={t("authorPlaceholder")}
                className={INPUT_CLASS}
              />
              <button
                type="button"
                onClick={() => removeAuthor(i)}
                disabled={disabled}
                aria-label={t("remove", { name: name || t("author") })}
                className="shrink-0 text-text-muted/50 hover:text-red-500 disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        {authorsError && <p className="mt-1.5 text-xs text-red-600">{authorsError}</p>}

        <button
          type="button"
          onClick={() => onAuthorsChange([...authors, ""])}
          disabled={disabled}
          className="mt-2 inline-flex items-center gap-1 rounded-lg border border-divider px-3 py-1.5 text-xs font-semibold text-text-muted hover:border-brand hover:text-brand disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> {t("addAuthor")}
        </button>
      </div>

      <hr className="border-divider" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL_CLASS}>{t("advisor")}</label>
          <input value={advisorName} onChange={(e) => onAdvisorNameChange(e.target.value)} disabled={disabled} placeholder={t("advisorPlaceholder")} className={INPUT_CLASS} />
        </div>
        <div>
          <label className={LABEL_CLASS}>{t("coAdvisor")}</label>
          <input value={coAdvisorName} onChange={(e) => onCoAdvisorNameChange(e.target.value)} disabled={disabled} placeholder={t("optional")} className={INPUT_CLASS} />
        </div>
      </div>

      <hr className="border-divider" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={LABEL_CLASS}>{t("publicationDate")}</label>
          <input type="date" value={publishedAt} onChange={(e) => onPublishedAtChange(e.target.value)} disabled={disabled} className={INPUT_CLASS} />
        </div>
        <div>
          <label className={LABEL_CLASS}>{t("defenseDate")}</label>
          <input type="date" value={defenseDate} onChange={(e) => onDefenseDateChange(e.target.value)} disabled={disabled} className={INPUT_CLASS} />
        </div>
        <div>
          <label className={LABEL_CLASS}>{t("submittedDate")}</label>
          <input type="date" value={submittedDate} onChange={(e) => onSubmittedDateChange(e.target.value)} disabled={disabled} className={INPUT_CLASS} />
        </div>
      </div>
    </div>
  );
}
