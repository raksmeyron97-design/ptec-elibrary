"use client";

// Structured reference editor for the admin publication form. Rows keep a
// stable `id` (never shown as the number — visible numbering is array order),
// so reordering references cannot detach inline citations in the abstracts.

import { useId, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ClipboardPaste,
  Link2,
  Plus,
  Quote,
  Trash2,
} from "lucide-react";
import type { PublicationReference } from "@/lib/publications";
import {
  MAX_PUBLICATION_REFERENCES,
  createPublicationReferenceId,
  type CitationValidationIssue,
} from "@/lib/publications/citations";
import { INPUT_CLASS, LABEL_CLASS } from "@/app/(admin)/admin/(protected)/theses/_components/form-styles";

export interface ReferenceEditorProps {
  references: PublicationReference[];
  onChange: (references: PublicationReference[]) => void;
  /** Remove a reference AND strip its citation tokens from both abstracts. */
  onRemove: (referenceId: string) => void;
  /** Insert a citation token for this reference into the active abstract. */
  onInsertCitation: (referenceId: string) => void;
  /** How many times each reference is cited across both abstracts. */
  citationCounts: Record<string, number>;
  /** Issues from validatePublicationCitations for the current form state. */
  issues: CitationValidationIssue[];
  disabled?: boolean;
}

function renumber(references: PublicationReference[]): PublicationReference[] {
  return references.map((reference, index) => ({ ...reference, index: index + 1 }));
}

export default function ReferenceEditor({
  references,
  onChange,
  onRemove,
  onInsertCitation,
  citationCounts,
  issues,
  disabled = false,
}: ReferenceEditorProps) {
  const baseId = useId().replace(/:/g, "");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const [announcement, setAnnouncement] = useState("");

  const fieldIssues = (index: number, field: CitationValidationIssue["field"]) =>
    issues.filter((issue) => issue.referenceIndex === index && issue.field === field);
  const tokenIssues = issues.filter((issue) => issue.field === "citation");

  const update = (id: string, patch: Partial<PublicationReference>) => {
    onChange(references.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= references.length) return;
    const next = [...references];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(renumber(next));
    setAnnouncement(`Moved reference to position ${target + 1} of ${references.length}.`);
    // Keep focus with the moved reference; fall back to the opposite move
    // button when the row reaches an end and the pressed one becomes disabled.
    requestAnimationFrame(() => {
      const row = rowRefs.current.get(references[index].id);
      if (!row) return;
      const same = row.querySelector<HTMLButtonElement>(
        `button[data-move="${direction === -1 ? "up" : "down"}"]`,
      );
      const other = row.querySelector<HTMLButtonElement>(
        `button[data-move="${direction === -1 ? "down" : "up"}"]`,
      );
      (same && !same.disabled ? same : other)?.focus();
    });
  };

  const addOne = () => {
    if (references.length >= MAX_PUBLICATION_REFERENCES) return;
    const id = createPublicationReferenceId();
    onChange(renumber([...references, { id, index: references.length + 1, text: "" }]));
    requestAnimationFrame(() => {
      rowRefs.current.get(id)?.querySelector("textarea")?.focus();
    });
  };

  const addBulk = () => {
    const lines = bulkText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, Math.max(0, MAX_PUBLICATION_REFERENCES - references.length));
    if (lines.length === 0) return;
    onChange(
      renumber([
        ...references,
        ...lines.map((text) => ({
          id: createPublicationReferenceId(),
          index: 0,
          text,
        })),
      ]),
    );
    setBulkText("");
    setBulkOpen(false);
    setAnnouncement(`Added ${lines.length} reference${lines.length === 1 ? "" : "s"}.`);
  };

  const remove = (reference: PublicationReference, position: number) => {
    const cited = citationCounts[reference.id] ?? 0;
    if (cited > 0) {
      const ok = window.confirm(
        `Reference ${position} is cited ${cited} time${cited === 1 ? "" : "s"} in the abstracts. ` +
          "Removing it also removes those inline citations. Continue?",
      );
      if (!ok) return;
    }
    onRemove(reference.id);
    setAnnouncement(`Removed reference ${position}.`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className={LABEL_CLASS}>References</span>
          <p className="text-[11px] text-text-muted">
            Numbering follows this order. Citations stay attached to their reference when rows move.
          </p>
        </div>
        <span className="rounded-full bg-paper px-2.5 py-1 text-[11px] font-medium tabular-nums text-text-muted">
          {references.length}/{MAX_PUBLICATION_REFERENCES}
        </span>
      </div>

      {tokenIssues.length > 0 && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
          <p className="font-semibold">Citation problems in the abstracts:</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {tokenIssues.slice(0, 5).map((issue, i) => (
              <li key={i}>{issue.message}</li>
            ))}
          </ul>
        </div>
      )}

      {references.length === 0 ? (
        <p className="rounded-xl border border-dashed border-divider px-4 py-8 text-center text-sm text-text-muted">
          No references yet. Add one below, then insert citations from the Abstract tab.
        </p>
      ) : (
        <ol className="space-y-3">
          {references.map((reference, index) => {
            const cited = citationCounts[reference.id] ?? 0;
            const textErrors = fieldIssues(index, "text");
            const doiErrors = fieldIssues(index, "doi");
            const urlErrors = fieldIssues(index, "url");
            const rowId = `${baseId}-ref-${index}`;
            return (
              <li
                key={reference.id}
                ref={(node) => {
                  if (node) rowRefs.current.set(reference.id, node);
                  else rowRefs.current.delete(reference.id);
                }}
                className="rounded-xl border border-divider bg-bg-surface p-3 sm:p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center gap-1">
                    <span
                      aria-hidden="true"
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-brand/8 text-[11px] font-bold text-brand"
                    >
                      {index + 1}
                    </span>
                    <button
                      type="button"
                      data-move="up"
                      disabled={disabled || index === 0}
                      onClick={() => move(index, -1)}
                      aria-label={`Move reference ${index + 1} up`}
                      className="cursor-pointer rounded-md p-1 text-text-muted transition-colors hover:bg-paper hover:text-brand disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <ArrowUp className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      data-move="down"
                      disabled={disabled || index === references.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label={`Move reference ${index + 1} down`}
                      className="cursor-pointer rounded-md p-1 text-text-muted transition-colors hover:bg-paper hover:text-brand disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <ArrowDown className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="min-w-0 flex-1 space-y-2">
                    <div>
                      <label htmlFor={`${rowId}-text`} className="sr-only">
                        Reference {index + 1} citation text
                      </label>
                      <textarea
                        id={`${rowId}-text`}
                        value={reference.text}
                        onChange={(e) => update(reference.id, { text: e.target.value })}
                        disabled={disabled}
                        rows={2}
                        aria-invalid={textErrors.length > 0 ? true : undefined}
                        placeholder="Smith, J. (2024). Teacher training in Southeast Asia. J. Educ. 12, 101–118."
                        className={`w-full resize-y rounded-lg border bg-transparent px-3 py-2 text-sm leading-6 text-text-body outline-none transition placeholder:text-text-muted/50 focus:border-brand focus:ring-[3px] focus:ring-brand/15 disabled:cursor-not-allowed disabled:opacity-60 ${
                          textErrors.length > 0 ? "border-danger" : "border-divider"
                        }`}
                      />
                      {textErrors.map((issue, i) => (
                        <p key={i} role="alert" className="mt-1 text-xs font-medium text-danger">
                          {issue.message}
                        </p>
                      ))}
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <label htmlFor={`${rowId}-doi`} className="sr-only">
                          Reference {index + 1} DOI
                        </label>
                        <input
                          id={`${rowId}-doi`}
                          value={reference.doi ?? ""}
                          onChange={(e) =>
                            update(reference.id, { doi: e.target.value.trim() || undefined })
                          }
                          disabled={disabled}
                          aria-invalid={doiErrors.length > 0 ? true : undefined}
                          placeholder="DOI, e.g. 10.1021/ed500184t"
                          className={`${INPUT_CLASS} font-mono text-xs ${doiErrors.length > 0 ? "!border-danger" : ""}`}
                        />
                        {doiErrors.map((issue, i) => (
                          <p key={i} role="alert" className="mt-1 text-xs font-medium text-danger">
                            {issue.message}
                          </p>
                        ))}
                      </div>
                      <div>
                        <label htmlFor={`${rowId}-url`} className="sr-only">
                          Reference {index + 1} URL
                        </label>
                        <input
                          id={`${rowId}-url`}
                          value={reference.url ?? ""}
                          onChange={(e) =>
                            update(reference.id, { url: e.target.value.trim() || undefined })
                          }
                          disabled={disabled}
                          aria-invalid={urlErrors.length > 0 ? true : undefined}
                          placeholder="https://…"
                          className={`${INPUT_CLASS} font-mono text-xs ${urlErrors.length > 0 ? "!border-danger" : ""}`}
                        />
                        {urlErrors.map((issue, i) => (
                          <p key={i} role="alert" className="mt-1 text-xs font-medium text-danger">
                            {issue.message}
                          </p>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={disabled || !reference.text.trim()}
                        onClick={() => onInsertCitation(reference.id)}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-divider px-2.5 py-1.5 text-xs font-medium text-text-body transition-colors hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Quote className="h-3.5 w-3.5" aria-hidden="true" />
                        Cite in abstract
                      </button>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          cited > 0 ? "bg-brand/10 text-brand" : "bg-paper text-text-muted"
                        }`}
                      >
                        <Link2 className="h-3 w-3" aria-hidden="true" />
                        {cited > 0 ? `Cited ${cited}×` : "Not cited yet"}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => remove(reference, index + 1)}
                    aria-label={`Remove reference ${index + 1}`}
                    className="shrink-0 cursor-pointer rounded-md p-1.5 text-text-muted transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled || references.length >= MAX_PUBLICATION_REFERENCES}
          onClick={addOne}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-divider px-3 py-2 text-xs font-medium text-text-body transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add reference
        </button>
        <button
          type="button"
          disabled={disabled || references.length >= MAX_PUBLICATION_REFERENCES}
          onClick={() => setBulkOpen((v) => !v)}
          aria-expanded={bulkOpen}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-divider px-3 py-2 text-xs font-medium text-text-body transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" />
          Paste a list
        </button>
      </div>

      {bulkOpen && (
        <div className="rounded-xl border border-divider bg-paper/35 p-3">
          <label htmlFor={`${baseId}-bulk`} className={LABEL_CLASS}>
            One reference per line
          </label>
          <textarea
            id={`${baseId}-bulk`}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={6}
            disabled={disabled}
            placeholder={"Smith, J. (2024). Teacher training in Southeast Asia. J. Educ. 12, 101–118.\nChan, D. (2023). …"}
            className={`${INPUT_CLASS} h-auto py-3 font-mono text-xs leading-relaxed`}
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={disabled || !bulkText.trim()}
              onClick={addBulk}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-brand-contrast transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add these references
            </button>
            <button
              type="button"
              onClick={() => setBulkOpen(false)}
              className="cursor-pointer rounded-lg px-3 py-2 text-xs font-medium text-text-muted transition-colors hover:bg-paper"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </div>
  );
}
