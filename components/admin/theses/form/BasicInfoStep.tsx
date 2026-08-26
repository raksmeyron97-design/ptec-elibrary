"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import SearchableSelect from "@/components/ui/search/SearchableSelect";
import { Field, FormSection, INPUT_CLASS, SlugField } from "@/components/admin/kit/form";
import { LICENSE_OPTIONS } from "@/lib/book-utils";
import { THESIS_TYPES, THESIS_LANGUAGES, slugify, type ThesisType, type ThesisLanguage } from "@/lib/admin/theses-shared";
import { checkThesisSlugAvailable } from "@/app/actions/theses";

/**
 * Step 1 — two groups rather than one flat column of six.
 *
 * "Basic info" was a single stack: Title, Slug, DOI, then a two-up
 * Type/Language, then License on its own row. The stack mixed two unrelated
 * jobs — naming the work and classifying it — and the lone License row read as
 * an afterthought rather than one of three peers. Now:
 *
 *   Identity        Title, Slug, DOI      full width; they are long values
 *   Classification  Type, Language, Licence   three-up on desktop; short enums
 *
 * The split also makes the required marks legible: everything required lives in
 * Identity plus Type/Language, and nothing in Identity is a dropdown.
 */
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
  submitAttempted,
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
  /** True once a publish has been refused — errors are unconditional from then on. */
  submitAttempted: boolean;
}) {
  const tr = useTranslations("adminThesisForm.basic");
  const tSlug = useTranslations("adminPostForm.slug");

  /*
    Two gates, not one. "Title is required" used to appear the moment the
    publish rules applied — so on an already-published thesis it was on screen
    before the author had looked at the input, let alone emptied it, which
    trains people to ignore the colour. It now appears when the author has been
    in the field and left it bad, or once a publish has actually been refused;
    a refused publish must always say why, touched or not.
  */
  const [titleTouched, setTitleTouched] = useState(false);
  const showFieldErrors = titleTouched || submitAttempted;

  return (
    <div className="space-y-6">
      <FormSection title={tr("identityHeading")} description={tr("identityIntro")} className="border-0 bg-transparent p-0 sm:p-0">
        <Field label={tr("title")} required error={showFieldErrors ? fieldErrors.title : undefined} hint={tr("titleHint")}>
          {(p) => (
            <input
              {...p}
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              onBlur={() => setTitleTouched(true)}
              onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
              disabled={disabled}
              placeholder={tr("titlePlaceholder")}
            />
          )}
        </Field>

        <SlugField
          value={slug}
          onChange={onSlugChange}
          source={title}
          routePrefix="/theses"
          siteUrl={siteUrl}
          slugify={slugify}
          // Closed over the thesis's own id so editing never reports its own
          // slug as taken.
          checkAvailability={(candidate) => checkThesisSlugAvailable(candidate, thesisId)}
          disabled={disabled}
          required
          error={submitAttempted ? fieldErrors.slug : undefined}
          // Kept from the field this replaced: the first thing anyone does with
          // a new thesis page is send someone the link.
          copyLabels={{ copy: tr("copyLink"), copied: tr("copied") }}
          labels={{
            label: tSlug("label"),
            autoHint: tSlug("auto"),
            reset: tSlug("reset"),
            checking: tSlug("checking"),
            available: tSlug("available"),
            taken: tSlug("taken"),
          }}
        />

        <Field label={tr("doi")} hint={tr("doiHint")}>
          {(p) => (
            <input
              {...p}
              value={doi}
              onChange={(e) => onDoiChange(e.target.value)}
              disabled={disabled}
              placeholder={tr("doiPlaceholder")}
            />
          )}
        </Field>
      </FormSection>

      <FormSection
        title={tr("classificationHeading")}
        description={tr("classificationIntro")}
        className="border-0 bg-transparent p-0 sm:p-0"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={tr("thesisType")} required htmlFor="thesis_type">
            <SearchableSelect
              name="thesis_type"
              ariaLabel={tr("thesisType")}
              value={thesisType}
              onChange={(v) => onThesisTypeChange(v as ThesisType)}
              disabled={disabled}
              options={THESIS_TYPES.map((t) => ({ value: t, label: tr(`types.${t}`) }))}
            />
          </Field>

          <Field label={tr("language")} required htmlFor="language">
            <SearchableSelect
              name="language"
              ariaLabel={tr("language")}
              value={language}
              onChange={(v) => onLanguageChange(v as ThesisLanguage)}
              disabled={disabled}
              options={THESIS_LANGUAGES.map((l) => ({ value: l, label: tr(`languages.${l}`) }))}
            />
          </Field>

          {/* Defaults to All Rights Reserved for a new thesis — see the note on
              the `license` state in ThesisForm. "Not specified" stays in the
              list because existing rows legitimately hold it. */}
          <Field label={tr("license")} hint={tr("licenseHint")} htmlFor="license">
            <SearchableSelect
              name="license"
              ariaLabel={tr("license")}
              value={license}
              onChange={onLicenseChange}
              disabled={disabled}
              options={LICENSE_OPTIONS}
              chevron="down"
            />
          </Field>
        </div>
      </FormSection>
    </div>
  );
}
