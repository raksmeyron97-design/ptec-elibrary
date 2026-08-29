"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, Loader2 } from "lucide-react";

import { mergePublicationAuthors } from "@/app/actions/authors";
import type { AdminAuthorRow } from "@/lib/authors/admin";

/**
 * Merge one author record into another.
 *
 * NOT a ConfirmDialog: the kit's confirm asks a yes/no question, and this asks
 * "which of these two survives?" — a choice, with a consequence that changes
 * depending on the answer. Getting it backwards deletes the wrong profile, so
 * the dialog states in plain words what will happen to each side before the
 * button is live.
 *
 * The source's credits move to the target first, then the source row is
 * deleted (see mergePublicationAuthors). Nothing here can lose a byline.
 */
export default function MergeAuthorsDialog({
  source,
  candidates,
  onDone,
  onCancel,
}: {
  /** The record being merged AWAY — it will not exist afterwards. */
  source: AdminAuthorRow;
  /** Every other author, for the "merge into" picker. */
  candidates: AdminAuthorRow[];
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [targetId, setTargetId] = useState<string>(
    // Pre-select the likely duplicate when the list already found one — that
    // is the whole reason this dialog was opened from a duplicate badge.
    source.duplicateOf[0] ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const options = useMemo(
    () =>
      candidates
        .filter((c) => c.id !== source.id)
        .sort((a, b) => {
          // Likely duplicates first, then by name.
          const aDup = source.duplicateOf.includes(a.id) ? 0 : 1;
          const bDup = source.duplicateOf.includes(b.id) ? 0 : 1;
          if (aDup !== bDup) return aDup - bDup;
          return a.full_name.localeCompare(b.full_name);
        }),
    [candidates, source],
  );

  const target = options.find((o) => o.id === targetId) ?? null;

  const run = async () => {
    if (!target || busy) return;
    setBusy(true);
    setError("");
    const result = await mergePublicationAuthors(source.id, target.id);
    setBusy(false);
    if (!result.success) {
      setError(result.error ?? "The merge failed.");
      return;
    }
    onDone(
      `Merged "${source.full_name}" into "${target.full_name}"` +
        (result.moved ? ` — ${result.moved} credit${result.moved === 1 ? "" : "s"} moved.` : "."),
    );
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onCancel}
      onClick={(e) => {
        if (e.target === dialogRef.current) onCancel();
      }}
      aria-labelledby="merge-authors-title"
      className="w-[min(560px,94vw)] rounded-2xl border border-divider bg-bg-surface p-0 text-text-body backdrop:bg-black/50"
    >
      <div className="p-5 sm:p-6">
        <h2 id="merge-authors-title" className="text-base font-semibold text-text-heading">
          Merge author records
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          Use this when the same person exists twice. Credits move first, so no publication loses a
          byline.
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Merge this record away
            </p>
            <p className="mt-1 text-sm font-semibold text-text-heading">{source.full_name}</p>
            <p className="text-xs text-text-muted">
              {source.publicationCount} publication{source.publicationCount === 1 ? "" : "s"}
              {source.slug ? ` · /authors/${source.slug}` : ""}
            </p>
          </div>

          <div className="flex items-center gap-2 text-text-muted">
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
            <span className="text-xs font-semibold uppercase tracking-wide">into</span>
          </div>

          <div>
            <label
              htmlFor="merge-target"
              className="mb-1.5 block text-sm font-medium text-text-body"
            >
              Author to keep
            </label>
            <select
              id="merge-target"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="focus-field h-11 w-full rounded-lg border border-divider bg-bg-surface px-3.5 text-sm shadow-sm"
            >
              <option value="">Choose an author…</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.full_name}
                  {source.duplicateOf.includes(option.id) ? " — likely duplicate" : ""}
                  {` (${option.publicationCount})`}
                </option>
              ))}
            </select>
          </div>

          {target && (
            <div className="flex items-start gap-3 rounded-lg border border-warning-line bg-warning-soft px-4 py-3 text-xs leading-6 text-warning-text">
              <AlertTriangle className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
              <div>
                <p>
                  <strong>{source.full_name}</strong> will be deleted. Their{" "}
                  {source.publicationCount} credit{source.publicationCount === 1 ? "" : "s"} will be
                  reassigned to <strong>{target.full_name}</strong>.
                </p>
                <p className="mt-1">
                  {target.full_name}&apos;s own biography, photo and links are kept as they are.
                  Where both are already credited on the same article, that article is left
                  untouched. This cannot be undone.
                </p>
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="focus-field inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-divider px-4 text-sm font-medium text-text-body transition-colors hover:bg-paper"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={run}
            disabled={!target || busy}
            className="focus-field inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-danger px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {busy ? "Merging…" : "Merge and delete"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
