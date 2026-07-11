"use client";

// Staged import for a pasted reference list. Parsing happens purely on the
// client and never touches saved data: every entry is reviewed (editable,
// skippable) before one confirmed import. Original text is always preserved.

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ClipboardPaste, Copy, X } from "lucide-react";
import type { PublicationReference } from "@/lib/publications";
import { createPublicationReferenceId, MAX_PUBLICATION_REFERENCES } from "@/lib/publications/citations";
import {
  detectLikelyReferenceDuplicates,
  parsePastedReferenceList,
  type ReferenceReviewCandidate,
} from "@/lib/publications/reference-metadata";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import { INPUT_CLASS } from "@/app/(admin)/admin/(protected)/theses/_components/form-styles";

interface ReviewRow {
  candidate: ReferenceReviewCandidate;
  text: string;
  include: boolean;
  duplicateOf: number | null; // 1-based existing reference number
}

export interface PasteReferencesDialogProps {
  open: boolean;
  onClose: () => void;
  existingReferences: PublicationReference[];
  onImport: (references: PublicationReference[]) => void;
}

export default function PasteReferencesDialog({
  open,
  onClose,
  existingReferences,
  onImport,
}: PasteReferencesDialogProps) {
  const [stage, setStage] = useState<"paste" | "review">("paste");
  const [raw, setRaw] = useState("");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [truncatedNote, setTruncatedNote] = useState("");
  const trapRef = useFocusTrap<HTMLDivElement>(open);

  // Start every dialog session clean (render-time adjustment, no effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStage("paste");
      setRaw("");
      setRows([]);
      setTruncatedNote("");
    }
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const remainingCapacity = MAX_PUBLICATION_REFERENCES - existingReferences.length;

  const detect = useCallback(() => {
    const result = parsePastedReferenceList(raw);
    const duplicates = detectLikelyReferenceDuplicates(
      result.candidates,
      existingReferences,
    );
    const duplicateByCandidate = new Map<number, number>();
    for (const entry of duplicates) {
      const strongest = entry.matches[0];
      if (strongest && strongest.confidence >= 0.9) {
        duplicateByCandidate.set(entry.candidateIndex, strongest.existingIndex + 1);
      }
    }
    setRows(
      result.candidates.slice(0, Math.max(0, remainingCapacity)).map((candidate, index) => ({
        candidate,
        text: candidate.originalInput,
        include: !duplicateByCandidate.has(index),
        duplicateOf: duplicateByCandidate.get(index) ?? null,
      })),
    );
    const notes: string[] = [];
    if (result.truncated || result.candidates.length > remainingCapacity) {
      notes.push("Some entries were left out because of the size limit.");
    }
    setTruncatedNote(notes.join(" "));
    setStage("review");
  }, [raw, existingReferences, remainingCapacity]);

  const includedCount = useMemo(() => rows.filter((row) => row.include).length, [rows]);

  const importNow = useCallback(() => {
    const references = rows
      .filter((row) => row.include && row.text.trim())
      .map((row, offset) => ({
        id: createPublicationReferenceId(),
        index: existingReferences.length + offset + 1,
        text: row.text.trim(),
        ...(row.candidate.metadata.doi ? { doi: row.candidate.metadata.doi } : {}),
        ...(row.candidate.metadata.url ? { url: row.candidate.metadata.url } : {}),
        meta: row.candidate.metadata,
      }));
    if (references.length > 0) onImport(references);
    onClose();
  }, [rows, existingReferences.length, onImport, onClose]);

  if (!open) return null;

  const confidenceBadge = (candidate: ReferenceReviewCandidate) => {
    const palette =
      candidate.confidence === "high"
        ? "bg-success/10 text-success"
        : candidate.confidence === "medium"
          ? "bg-warning/10 text-warning"
          : "bg-danger/10 text-danger";
    return (
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${palette}`}>
        {candidate.confidence} confidence
      </span>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="paste-refs-title"
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-divider bg-bg-surface shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-divider px-4 py-3 sm:px-5">
          <h2 id="paste-refs-title" className="flex items-center gap-2 text-sm font-bold text-text-heading">
            <ClipboardPaste className="h-4 w-4 text-brand" aria-hidden="true" />
            Paste a reference list
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer rounded-lg p-2 text-text-muted transition-colors hover:bg-paper hover:text-text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {stage === "paste" ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 sm:p-5">
            <p className="text-[13px] leading-5 text-text-muted">
              Paste references from a manuscript or bibliography — one per line or separated by
              blank lines. Nothing is saved yet: you will review every detected entry first.
            </p>
            <textarea
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              rows={12}
              autoFocus
              aria-label="Pasted reference list"
              placeholder={
                "[1] Smith, J. (2024). Teacher training in Southeast Asia. J. Educ. 12, 101–118.\n[2] Chan, D. (2023). Lesson study in Cambodia. https://doi.org/10.1000/xyz"
              }
              className={`${INPUT_CLASS} h-auto flex-1 py-3 font-mono !text-xs leading-relaxed`}
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-10 cursor-pointer rounded-lg px-3 text-[13px] font-medium text-text-muted transition-colors hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!raw.trim() || remainingCapacity <= 0}
                onClick={detect}
                className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg bg-brand px-4 text-[13px] font-semibold text-brand-contrast transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Detect references
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="border-b border-divider bg-paper/40 px-4 py-2 sm:px-5">
              <p className="text-[12.5px] font-medium text-text-body" aria-live="polite">
                Detected {rows.length} reference{rows.length === 1 ? "" : "s"} — review each entry,
                then import the checked ones. {truncatedNote}
              </p>
            </div>
            <ol className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
              {rows.map((row, index) => (
                <li
                  key={index}
                  className={`rounded-xl border p-3 ${row.include ? "border-divider bg-bg-surface" : "border-divider/60 bg-paper/40 opacity-75"}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-[12px] font-semibold text-text-heading">
                      <input
                        type="checkbox"
                        checked={row.include}
                        onChange={(event) =>
                          setRows((prev) =>
                            prev.map((r, ri) => (ri === index ? { ...r, include: event.target.checked } : r)),
                          )
                        }
                        className="h-4 w-4 accent-[var(--color-brand)]"
                      />
                      Entry {index + 1}
                    </label>
                    {confidenceBadge(row.candidate)}
                    {row.duplicateOf ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-bold text-warning">
                        <Copy className="h-3 w-3" aria-hidden="true" />
                        Looks like existing [{row.duplicateOf}]
                      </span>
                    ) : null}
                  </div>

                  <label htmlFor={`paste-row-${index}`} className="sr-only">
                    Entry {index + 1} reference text
                  </label>
                  <textarea
                    id={`paste-row-${index}`}
                    value={row.text}
                    onChange={(event) =>
                      setRows((prev) =>
                        prev.map((r, ri) => (ri === index ? { ...r, text: event.target.value } : r)),
                      )
                    }
                    rows={2}
                    className={`${INPUT_CLASS} mt-2 h-auto py-2 !text-[12.5px] leading-relaxed`}
                  />

                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-text-muted">
                    {row.candidate.metadata.year ? <span>Year: {row.candidate.metadata.year}</span> : null}
                    {row.candidate.metadata.doi ? (
                      <span className="font-mono">DOI: {row.candidate.metadata.doi}</span>
                    ) : null}
                    {row.candidate.metadata.url ? <span>URL detected</span> : null}
                  </div>
                  {row.candidate.warnings.length > 0 ? (
                    <p className="mt-1 flex items-start gap-1 text-[11px] text-warning">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                      {row.candidate.warnings.join(" ")}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-divider px-4 py-3 sm:px-5">
              <button
                type="button"
                onClick={() => setStage("paste")}
                className="min-h-10 cursor-pointer rounded-lg px-3 text-[13px] font-medium text-text-muted transition-colors hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
              >
                Back
              </button>
              <button
                type="button"
                disabled={includedCount === 0}
                onClick={importNow}
                className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg bg-brand px-4 text-[13px] font-semibold text-brand-contrast transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                Import {includedCount} reference{includedCount === 1 ? "" : "s"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
