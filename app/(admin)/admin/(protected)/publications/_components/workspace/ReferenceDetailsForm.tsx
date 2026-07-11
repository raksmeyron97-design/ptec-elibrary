"use client";

// Structured editing for one reference. `text` stays the canonical formatted
// string (what the public page renders); the structured fields live in
// `meta` and can regenerate `text` on demand — never silently.

import { useId } from "react";
import { Wand2 } from "lucide-react";
import type { PublicationReference } from "@/lib/publications";
import {
  formatReadableReference,
  hasStructuredReferenceContent,
  type ReferenceAuthor,
  type ReferenceType,
  type StructuredReferenceMetadata,
} from "@/lib/publications/reference-metadata";
import { INPUT_CLASS } from "@/app/(admin)/admin/(protected)/theses/_components/form-styles";

const TYPE_OPTIONS: { value: ReferenceType; label: string }[] = [
  { value: "journal-article", label: "Journal article" },
  { value: "book", label: "Book" },
  { value: "book-chapter", label: "Book chapter" },
  { value: "thesis-dissertation", label: "Thesis / dissertation" },
  { value: "conference-paper", label: "Conference paper" },
  { value: "website", label: "Website" },
  { value: "other", label: "Other" },
];

const CONTAINER_LABEL: Partial<Record<ReferenceType, string>> = {
  "journal-article": "Journal",
  "book-chapter": "Book title",
  "conference-paper": "Proceedings title",
  website: "Website name",
};

const FIELD_LABEL = "block text-xs font-semibold text-text-body mb-1";
const SMALL_INPUT = `${INPUT_CLASS} !h-10 text-[13px]`;

function authorLine(author: ReferenceAuthor): string {
  if (typeof author === "string") return author;
  if (author.literal) return author.literal;
  if (author.family && author.given) return `${author.family}, ${author.given}`;
  return author.family ?? author.given ?? "";
}

function parseAuthorLines(value: string): ReferenceAuthor[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 50);
}

export interface ReferenceDetailsFormProps {
  reference: PublicationReference;
  position: number;
  disabled?: boolean;
  onPatch: (referenceId: string, patch: Partial<PublicationReference>) => void;
}

export default function ReferenceDetailsForm({
  reference,
  position,
  disabled = false,
  onPatch,
}: ReferenceDetailsFormProps) {
  const baseId = `${useId().replace(/:/g, "")}-ref`;
  const meta: StructuredReferenceMetadata = reference.meta ?? { type: "other" };
  const type = meta.type;

  const patchMeta = (patch: Partial<StructuredReferenceMetadata>) => {
    const nextMeta = { ...meta, ...patch } as StructuredReferenceMetadata;
    onPatch(reference.id, { meta: nextMeta });
  };

  /** Keep the canonical top-level doi/url in sync with the structured field. */
  const patchIdentifier = (key: "doi" | "url", value: string) => {
    const trimmed = value.trim();
    onPatch(reference.id, {
      [key]: trimmed || undefined,
      meta: { ...meta, [key]: trimmed || undefined } as StructuredReferenceMetadata,
    });
  };

  const formatted = formatReadableReference({ ...meta, doi: reference.doi ?? meta.doi, url: reference.url ?? meta.url });
  const canFormat = hasStructuredReferenceContent(meta) && formatted !== reference.text;

  const field = (
    label: string,
    key: keyof StructuredReferenceMetadata,
    options?: { placeholder?: string; span?: boolean },
  ) => (
    <div className={options?.span ? "sm:col-span-2" : undefined}>
      <label htmlFor={`${baseId}-${String(key)}`} className={FIELD_LABEL}>
        {label}
      </label>
      <input
        id={`${baseId}-${String(key)}`}
        value={(meta[key] as string | number | undefined)?.toString() ?? ""}
        onChange={(event) => patchMeta({ [key]: event.target.value } as Partial<StructuredReferenceMetadata>)}
        disabled={disabled}
        placeholder={options?.placeholder}
        className={SMALL_INPUT}
      />
    </div>
  );

  return (
    <div className="space-y-3 border-t border-divider pt-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${baseId}-type`} className={FIELD_LABEL}>
            Reference type
          </label>
          <select
            id={`${baseId}-type`}
            value={type}
            onChange={(event) => patchMeta({ type: event.target.value as ReferenceType })}
            disabled={disabled}
            className={SMALL_INPUT}
          >
            {TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        {field("Year", "year", { placeholder: "2024" })}
        <div className="sm:col-span-2">
          <label htmlFor={`${baseId}-authors`} className={FIELD_LABEL}>
            Authors — one per line, “Family, Given”
          </label>
          <textarea
            id={`${baseId}-authors`}
            value={(meta.authors ?? []).map(authorLine).filter(Boolean).join("\n")}
            onChange={(event) => patchMeta({ authors: parseAuthorLines(event.target.value) })}
            disabled={disabled}
            rows={2}
            placeholder={"Smith, Jane\nChan, Dara"}
            className={`${INPUT_CLASS} h-auto py-2 text-[13px] leading-relaxed`}
          />
        </div>
        {field("Organization (if no authors)", "organization", { span: true })}
        {field("Title", "title", { span: true, placeholder: "Article or work title" })}
        {CONTAINER_LABEL[type] ? field(CONTAINER_LABEL[type]!, "containerTitle", { span: true }) : null}

        {type === "journal-article" || type === "conference-paper" ? (
          <>
            {field("Volume", "volume")}
            {field("Issue", "issue")}
          </>
        ) : null}
        {type !== "website" ? (
          <>
            {field("First page", "pageStart")}
            {field("Last page", "pageEnd")}
          </>
        ) : null}
        {type === "journal-article" ? field("Article number", "articleNumber") : null}
        {type === "book" ? field("Edition", "edition", { placeholder: "4th ed." }) : null}
        {type !== "website" && type !== "thesis-dissertation" ? field("Publisher", "publisher") : null}

        {type === "thesis-dissertation" ? (
          <>
            <div>
              <label htmlFor={`${baseId}-thesisKind`} className={FIELD_LABEL}>
                Kind
              </label>
              <select
                id={`${baseId}-thesisKind`}
                value={(meta as { thesisKind?: string }).thesisKind ?? "thesis"}
                onChange={(event) =>
                  patchMeta({ thesisKind: event.target.value as "thesis" | "dissertation" } as Partial<StructuredReferenceMetadata>)
                }
                disabled={disabled}
                className={SMALL_INPUT}
              >
                <option value="thesis">Thesis</option>
                <option value="dissertation">Dissertation</option>
              </select>
            </div>
            <div>
              <label htmlFor={`${baseId}-institution`} className={FIELD_LABEL}>
                Institution
              </label>
              <input
                id={`${baseId}-institution`}
                value={(meta as { institution?: string }).institution ?? ""}
                onChange={(event) => patchMeta({ institution: event.target.value } as Partial<StructuredReferenceMetadata>)}
                disabled={disabled}
                className={SMALL_INPUT}
              />
            </div>
          </>
        ) : null}
        {type === "conference-paper" ? (
          <div className="sm:col-span-2">
            <label htmlFor={`${baseId}-conferenceName`} className={FIELD_LABEL}>
              Conference name
            </label>
            <input
              id={`${baseId}-conferenceName`}
              value={(meta as { conferenceName?: string }).conferenceName ?? ""}
              onChange={(event) => patchMeta({ conferenceName: event.target.value } as Partial<StructuredReferenceMetadata>)}
              disabled={disabled}
              className={SMALL_INPUT}
            />
          </div>
        ) : null}
        {type === "website" ? (
          <div>
            <label htmlFor={`${baseId}-accessedDate`} className={FIELD_LABEL}>
              Accessed date
            </label>
            <input
              id={`${baseId}-accessedDate`}
              value={(meta as { accessedDate?: string }).accessedDate ?? ""}
              onChange={(event) => patchMeta({ accessedDate: event.target.value } as Partial<StructuredReferenceMetadata>)}
              disabled={disabled}
              placeholder="2026-07-11"
              className={SMALL_INPUT}
            />
          </div>
        ) : null}

        <div>
          <label htmlFor={`${baseId}-doi`} className={FIELD_LABEL}>
            DOI
          </label>
          <input
            id={`${baseId}-doi`}
            value={reference.doi ?? ""}
            onChange={(event) => patchIdentifier("doi", event.target.value)}
            disabled={disabled}
            placeholder="10.1021/ed500184t"
            className={`${SMALL_INPUT} font-mono !text-xs`}
          />
        </div>
        <div>
          <label htmlFor={`${baseId}-url`} className={FIELD_LABEL}>
            URL
          </label>
          <input
            id={`${baseId}-url`}
            value={reference.url ?? ""}
            onChange={(event) => patchIdentifier("url", event.target.value)}
            disabled={disabled}
            placeholder="https://…"
            className={`${SMALL_INPUT} font-mono !text-xs`}
          />
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <label htmlFor={`${baseId}-text`} className={FIELD_LABEL}>
            Formatted citation — shown to readers
          </label>
          <button
            type="button"
            disabled={disabled || !canFormat}
            onClick={() => onPatch(reference.id, { text: formatted })}
            title={canFormat ? `Replace with: ${formatted}` : "Structured fields already match"}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-brand transition-colors hover:bg-brand/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Wand2 className="h-3 w-3" aria-hidden="true" />
            Format from fields
          </button>
        </div>
        <textarea
          id={`${baseId}-text`}
          value={reference.text}
          onChange={(event) => onPatch(reference.id, { text: event.target.value })}
          disabled={disabled}
          rows={2}
          aria-label={`Reference ${position} formatted citation`}
          placeholder="Smith, J. (2024). Teacher training in Southeast Asia. J. Educ. 12, 101–118."
          className={`${INPUT_CLASS} h-auto py-2 text-[13px] leading-relaxed`}
        />
        {meta.originalText && meta.originalText !== reference.text ? (
          <details className="mt-1">
            <summary className="cursor-pointer text-[11px] font-medium text-text-muted hover:text-brand">
              Original imported text
            </summary>
            <p className="mt-1 rounded-md bg-paper/60 px-2 py-1.5 text-[12px] leading-relaxed text-text-muted">
              {meta.originalText}
            </p>
          </details>
        ) : null}
      </div>
    </div>
  );
}
