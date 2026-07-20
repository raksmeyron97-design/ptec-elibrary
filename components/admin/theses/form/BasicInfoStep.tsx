"use client";

import { useTranslations } from "next-intl";
import ThesisSlugField from "./ThesisSlugField";
import SearchableSelect from "@/components/ui/search/SearchableSelect";
import { LICENSE_OPTIONS } from "@/lib/book-utils";
import { THESIS_TYPES, THESIS_LANGUAGES, type ThesisType, type ThesisLanguage } from "@/lib/admin/theses-shared";

const INPUT_CLASS =
  "h-11 w-full rounded-lg border border-divider/60 bg-transparent px-4 text-sm outline-none transition-all placeholder:text-text-muted/50 focus:border-brand focus:ring-[3px] focus:ring-brand/15 hover:border-divider";
const LABEL_CLASS = "block text-sm font-semibold text-text-body mb-1.5";

export default function BasicInfoStep({
  title, onTitleChange,
  slug, onSlugChange,
  thesisId,
  doi, onDoiChange,
  thesisType, onThesisTypeChange,
  language, onLanguageChange,
  license, onLicenseChange,
  siteUrl,
  disabled,
  fieldErrors,
}: {
  title: string; onTitleChange: (v: string) => void;
  slug: string; onSlugChange: (v: string) => void;
  thesisId?: string;
  doi: string; onDoiChange: (v: string) => void;
  thesisType: ThesisType; onThesisTypeChange: (v: ThesisType) => void;
  language: ThesisLanguage; onLanguageChange: (v: ThesisLanguage) => void;
  license: string; onLicenseChange: (v: string) => void;
  siteUrl: string;
  disabled?: boolean;
  fieldErrors: { title?: string; slug?: string };
}) {
  const tr = useTranslations("adminThesisForm.basic");
  return (
    <div className="space-y-5">
      <div>
        <label className={LABEL_CLASS}>
          {tr("title")} <span className="text-red-500">*</span>
        </label>
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
          required
          disabled={disabled}
          placeholder={tr("titlePlaceholder")}
          aria-invalid={!!fieldErrors.title}
          aria-describedby={fieldErrors.title ? "thesis-title-error" : undefined}
          className={`${INPUT_CLASS} aria-[invalid=true]:border-red-400`}
        />
        {fieldErrors.title && <p id="thesis-title-error" className="mt-1 text-xs text-red-600">{fieldErrors.title}</p>}
      </div>

      <ThesisSlugField title={title} slug={slug} onSlugChange={onSlugChange} thesisId={thesisId} disabled={disabled} siteUrl={siteUrl} />

      <div>
        <label className={LABEL_CLASS}>{tr("doi")}</label>
        <input
          value={doi}
          onChange={(e) => onDoiChange(e.target.value)}
          disabled={disabled}
          placeholder={tr("doiPlaceholder")}
          className={INPUT_CLASS}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL_CLASS}>
            {tr("thesisType")} <span className="text-red-500">*</span>
          </label>
          <SearchableSelect
            name="thesis_type"
            ariaLabel={tr("thesisType")}
            value={thesisType}
            onChange={(v) => onThesisTypeChange(v as ThesisType)}
            disabled={disabled}
            options={THESIS_TYPES.map((t) => ({ value: t, label: tr(`types.${t}`) }))}
          />
        </div>
        <div>
          <label className={LABEL_CLASS}>
            {tr("language")} <span className="text-red-500">*</span>
          </label>
          <SearchableSelect
            name="language"
            ariaLabel={tr("language")}
            value={language}
            onChange={(v) => onLanguageChange(v as ThesisLanguage)}
            disabled={disabled}
            options={THESIS_LANGUAGES.map((l) => ({ value: l, label: tr(`languages.${l}`) }))}
          />
        </div>
      </div>

      <div>
        <label className={LABEL_CLASS}>{tr("license")}</label>
        <select value={license} onChange={(e) => onLicenseChange(e.target.value)} disabled={disabled} className={`${INPUT_CLASS} bg-bg-surface`}>
          {LICENSE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
