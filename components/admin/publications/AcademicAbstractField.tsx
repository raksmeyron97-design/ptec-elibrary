"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import {
  Bold,
  Eye,
  Italic,
  Languages,
  Quote,
  Subscript,
  Superscript,
} from "lucide-react";
import AcademicText from "@/components/ui/publications/AcademicText";
import type { PublicationReference } from "@/lib/publications";
import { citationToken } from "@/lib/publications/citations";

export type AcademicAbstractLocale = "en" | "km";

export interface AcademicAbstractFieldHandle {
  /** Insert a stable-ID citation into the requested, or last-active, abstract. */
  insertCitation: (referenceId: string, locale?: AcademicAbstractLocale) => boolean;
  /** Move keyboard focus to the requested, or last-active, abstract. */
  focus: (locale?: AcademicAbstractLocale) => void;
  getActiveLocale: () => AcademicAbstractLocale;
}

export interface AcademicAbstractFieldProps {
  value: string;
  valueKm: string;
  onChange: (value: string) => void;
  onChangeKm: (value: string) => void;
  references: PublicationReference[];
  disabled?: boolean;
  required?: boolean;
  error?: string;
  errorKm?: string;
  idPrefix?: string;
  name?: string;
  nameKm?: string;
  onActiveLocaleChange?: (locale: AcademicAbstractLocale) => void;
}

type Selection = { start: number; end: number };
type Format = {
  label: string;
  open: string;
  close: string;
  icon: typeof Bold;
};

const FORMATS: Format[] = [
  { label: "Bold", open: "**", close: "**", icon: Bold },
  { label: "Italic", open: "*", close: "*", icon: Italic },
  { label: "Subscript", open: "<sub>", close: "</sub>", icon: Subscript },
  { label: "Superscript", open: "<sup>", close: "</sup>", icon: Superscript },
];

const LOCALE_LABEL: Record<AcademicAbstractLocale, string> = {
  en: "English",
  km: "Khmer",
};

function compactReference(text: string, fallback: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return fallback;
  return clean.length > 72 ? `${clean.slice(0, 69)}\u2026` : clean;
}

function addTokenSpacing(
  value: string,
  selection: Selection,
  token: string,
): { value: string; selection: Selection } {
  const before = value.slice(0, selection.start);
  const after = value.slice(selection.end);
  const leading = before.length > 0 && !/[\s([{]$/.test(before) ? " " : "";
  const trailing = after.length > 0 && !/^[\s.,;:!?\])}]/.test(after) ? " " : "";
  const inserted = `${leading}${token}${trailing}`;
  const caret = before.length + inserted.length;

  return {
    value: `${before}${inserted}${after}`,
    selection: { start: caret, end: caret },
  };
}

/**
 * Controlled bilingual academic-text editor for publication abstracts.
 *
 * This intentionally remains a constrained textarea rather than pretending to
 * be a rich-text editor. The stored source is transparent, diffable, and uses
 * only the syntax understood by the public AcademicText renderer.
 */
const AcademicAbstractField = forwardRef<
  AcademicAbstractFieldHandle,
  AcademicAbstractFieldProps
>(function AcademicAbstractField(
  {
    value,
    valueKm,
    onChange,
    onChangeKm,
    references,
    disabled = false,
    required = false,
    error,
    errorKm,
    idPrefix,
    name = "abstract",
    nameKm = "abstract_km",
    onActiveLocaleChange,
  },
  forwardedRef,
) {
  const reactId = useId();
  const baseId = idPrefix ?? `academic-abstract-${reactId.replace(/:/g, "")}`;
  const textareaRefs = useRef<Record<AcademicAbstractLocale, HTMLTextAreaElement | null>>({
    en: null,
    km: null,
  });
  const selections = useRef<Record<AcademicAbstractLocale, Selection>>({
    en: { start: value.length, end: value.length },
    km: { start: valueKm.length, end: valueKm.length },
  });
  const pendingSelection = useRef<{
    locale: AcademicAbstractLocale;
    selection: Selection;
  } | null>(null);
  const lastActiveLocale = useRef<AcademicAbstractLocale>("en");
  const [activeLocale, setActiveLocale] = useState<AcademicAbstractLocale>("en");
  const [selectedReferenceId, setSelectedReferenceId] = useState(references[0]?.id ?? "");
  const [announcement, setAnnouncement] = useState("");

  const values: Record<AcademicAbstractLocale, string> = { en: value, km: valueKm };
  const changeHandlers: Record<AcademicAbstractLocale, (next: string) => void> = {
    en: onChange,
    km: onChangeKm,
  };

  useEffect(() => {
    if (references.some((reference) => reference.id === selectedReferenceId)) return;
    setSelectedReferenceId(references[0]?.id ?? "");
  }, [references, selectedReferenceId]);

  useLayoutEffect(() => {
    const pending = pendingSelection.current;
    if (!pending) return;
    const textarea = textareaRefs.current[pending.locale];
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(pending.selection.start, pending.selection.end);
    selections.current[pending.locale] = pending.selection;
    pendingSelection.current = null;
  }, [value, valueKm]);

  const activateLocale = useCallback(
    (locale: AcademicAbstractLocale) => {
      lastActiveLocale.current = locale;
      setActiveLocale(locale);
      onActiveLocaleChange?.(locale);
    },
    [onActiveLocaleChange],
  );

  const rememberSelection = useCallback((locale: AcademicAbstractLocale) => {
    const textarea = textareaRefs.current[locale];
    if (!textarea) return;
    selections.current[locale] = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    };
  }, []);

  const queueChange = useCallback(
    (locale: AcademicAbstractLocale, next: string, selection: Selection) => {
      pendingSelection.current = { locale, selection };
      selections.current[locale] = selection;
      changeHandlers[locale](next);
    },
    // Callbacks are intentionally dependencies: this is a controlled field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onChange, onChangeKm],
  );

  const applyFormat = useCallback(
    (locale: AcademicAbstractLocale, open: string, close: string) => {
      if (disabled) return;
      const source = values[locale];
      const current = selections.current[locale];
      const selected = source.slice(current.start, current.end);
      const next = `${source.slice(0, current.start)}${open}${selected}${close}${source.slice(current.end)}`;
      const selection = selected
        ? {
            start: current.start + open.length,
            end: current.end + open.length,
          }
        : {
            start: current.start + open.length,
            end: current.start + open.length,
          };

      activateLocale(locale);
      queueChange(locale, next, selection);
    },
    // `values` is reconstructed from controlled props on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [disabled, value, valueKm, activateLocale, queueChange],
  );

  const insertCitation = useCallback(
    (referenceId: string, requestedLocale?: AcademicAbstractLocale): boolean => {
      if (disabled || !references.some((reference) => reference.id === referenceId)) return false;
      const locale = requestedLocale ?? lastActiveLocale.current;
      const result = addTokenSpacing(
        values[locale],
        selections.current[locale],
        citationToken(referenceId),
      );
      const number = references.findIndex((reference) => reference.id === referenceId) + 1;

      activateLocale(locale);
      queueChange(locale, result.value, result.selection);
      setSelectedReferenceId(referenceId);
      setAnnouncement(`Inserted reference ${number} in the ${LOCALE_LABEL[locale]} abstract.`);
      return true;
    },
    // `values` is reconstructed from controlled props on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [disabled, references, value, valueKm, activateLocale, queueChange],
  );

  useImperativeHandle(
    forwardedRef,
    () => ({
      insertCitation,
      focus(locale) {
        const target = locale ?? lastActiveLocale.current;
        activateLocale(target);
        textareaRefs.current[target]?.focus();
      },
      getActiveLocale: () => lastActiveLocale.current,
    }),
    [activateLocale, insertCitation],
  );

  function keepTextareaSelection(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
  }

  function renderLanguageField(locale: AcademicAbstractLocale) {
    const isKhmer = locale === "km";
    const fieldValue = values[locale];
    const fieldError = isKhmer ? errorKm : error;
    const fieldName = isKhmer ? nameKm : name;
    const fieldId = `${baseId}-${locale}`;
    const errorId = `${fieldId}-error`;
    const helpId = `${fieldId}-help`;
    const languageName = LOCALE_LABEL[locale];
    const words = fieldValue.trim() ? fieldValue.trim().split(/\s+/u).length : 0;

    return (
      <section
        key={locale}
        aria-labelledby={`${fieldId}-heading`}
        className={`rounded-xl border bg-bg-surface p-4 transition-colors sm:p-5 ${
          activeLocale === locale ? "border-brand/40 ring-2 ring-brand/10" : "border-divider"
        }`}
      >
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 id={`${fieldId}-heading`} className="text-sm font-semibold text-text-heading">
              {isKhmer ? "Abstract (KH)" : "Abstract (EN)"}
              {!isKhmer && required ? <span className="ml-1 text-danger">*</span> : null}
            </h3>
            <p className="mt-0.5 text-[11px] text-text-muted">
              {isKhmer ? "សេចក្តីសង្ខេបជាភាសាខ្មែរ (optional)" : "English academic abstract"}
            </p>
          </div>
          <span className="rounded-full bg-paper px-2.5 py-1 text-[11px] font-medium tabular-nums text-text-muted">
            {words} word{words === 1 ? "" : "s"}
          </span>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(18rem,.85fr)]">
          <div className="min-w-0">
            <div
              role="toolbar"
              aria-label={`Format ${languageName} abstract`}
              className="flex flex-wrap items-center gap-1 rounded-t-lg border border-b-0 border-divider bg-paper/50 p-1"
            >
              {FORMATS.map((format) => (
                <button
                  key={format.label}
                  type="button"
                  disabled={disabled}
                  onMouseDown={keepTextareaSelection}
                  onClick={() => applyFormat(locale, format.open, format.close)}
                  aria-label={`${format.label} in ${languageName} abstract`}
                  title={format.label}
                  className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-surface hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <format.icon className="h-4 w-4" aria-hidden="true" />
                </button>
              ))}
              <span aria-hidden="true" className="mx-1 h-6 w-px bg-divider" />
              <span className="px-1 text-[11px] text-text-muted">
                Select text, then format
              </span>
            </div>

            <textarea
              ref={(node) => {
                textareaRefs.current[locale] = node;
              }}
              id={fieldId}
              name={fieldName}
              lang={locale}
              value={fieldValue}
              onChange={(event) => {
                selections.current[locale] = {
                  start: event.currentTarget.selectionStart,
                  end: event.currentTarget.selectionEnd,
                };
                changeHandlers[locale](event.currentTarget.value);
              }}
              onFocus={() => activateLocale(locale)}
              onSelect={() => rememberSelection(locale)}
              onKeyUp={() => rememberSelection(locale)}
              onClick={() => rememberSelection(locale)}
              onBlur={() => rememberSelection(locale)}
              disabled={disabled}
              required={!isKhmer && required}
              rows={isKhmer ? 7 : 9}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={`${helpId}${fieldError ? ` ${errorId}` : ""}`}
              placeholder={
                isKhmer
                  ? "សេចក្តីសង្ខេបជាភាសាខ្មែរ\u2026"
                  : "Describe the objective, method, findings, and conclusion\u2026"
              }
              className={`min-h-44 w-full resize-y rounded-b-lg border bg-transparent px-4 py-3 text-sm leading-7 text-text-body outline-none transition placeholder:text-text-muted/50 focus:border-brand focus:ring-[3px] focus:ring-brand/15 disabled:cursor-not-allowed disabled:opacity-60 ${
                fieldError ? "border-danger" : "border-divider"
              } ${isKhmer ? "font-khmer-serif" : ""}`}
            />
            <p id={helpId} className="mt-1.5 text-[11px] leading-5 text-text-muted">
              Supports bold, italic, subscript, superscript, paragraphs, and linked citations.
            </p>
            {fieldError ? (
              <p id={errorId} role="alert" className="mt-1 text-xs font-medium text-danger">
                {fieldError}
              </p>
            ) : null}
          </div>

          <div className="min-w-0 rounded-lg border border-divider bg-paper/35 p-4">
            <div className="mb-3 flex items-center gap-2 border-b border-divider pb-2">
              <Eye className="h-4 w-4 text-brand" aria-hidden="true" />
              <h4 className="text-xs font-semibold uppercase tracking-wide text-text-heading">
                Live preview
              </h4>
            </div>
            {fieldValue.trim() ? (
              <div className={`text-sm leading-7 text-text-body ${isKhmer ? "font-khmer-serif" : ""}`}>
                <AcademicText
                  text={fieldValue}
                  references={references}
                  sourceId={`${baseId}-preview-${locale}`}
                  linkCitations={false}
                  paragraphClassName="mt-3 first:mt-0"
                  citationLabel={(number) => `Reference ${number}`}
                  missingCitationLabel={(referenceId) => `Missing reference ${referenceId}`}
                />
              </div>
            ) : (
              <p className="text-sm italic text-text-muted">Nothing to preview yet.</p>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-divider bg-paper/35 p-3 sm:p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-52 flex-1">
            <label
              htmlFor={`${baseId}-reference-picker`}
              className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-text-heading"
            >
              <Quote className="h-4 w-4 text-brand" aria-hidden="true" />
              Insert an inline citation
            </label>
            <select
              id={`${baseId}-reference-picker`}
              value={selectedReferenceId}
              onChange={(event) => setSelectedReferenceId(event.target.value)}
              disabled={disabled || references.length === 0}
              className="h-11 w-full rounded-lg border border-divider bg-bg-surface px-3 text-sm text-text-body outline-none transition focus:border-brand focus:ring-[3px] focus:ring-brand/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {references.length === 0 ? (
                <option value="">Add a reference first</option>
              ) : (
                references.map((reference, index) => (
                  <option key={reference.id} value={reference.id}>
                    {index + 1}. {compactReference(reference.text, "Untitled reference")}
                  </option>
                ))
              )}
            </select>
          </div>

          <button
            type="button"
            disabled={disabled || !selectedReferenceId}
            onClick={() => insertCitation(selectedReferenceId)}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-contrast transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Quote className="h-4 w-4" aria-hidden="true" />
            Insert in {LOCALE_LABEL[activeLocale]}
          </button>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-text-muted">
          <Languages className="h-3.5 w-3.5" aria-hidden="true" />
          Citations go to the last abstract you used and stay linked when references move.
        </p>
      </div>

      {renderLanguageField("en")}
      {renderLanguageField("km")}

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </div>
  );
});

export default AcademicAbstractField;
