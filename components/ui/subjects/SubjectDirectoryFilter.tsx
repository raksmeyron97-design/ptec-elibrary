"use client";

import { useId, useState } from "react";
import { Search, X, RotateCcw } from "lucide-react";

function applyFilter(listId: string, query: string): number | null {
  const list = document.getElementById(listId);
  if (!list) return null;
  const term = query.trim().toLowerCase();
  let shown = 0;

  for (const row of list.querySelectorAll<HTMLElement>("[data-subject-key]")) {
    const rowKey = (row.dataset.subjectKey ?? "").toLowerCase();
    const visible = !term || rowKey.includes(term);
    row.hidden = !visible;
    if (visible) shown++;
  }

  return term ? shown : null;
}

export interface SubjectDirectoryFilterProps {
  listId: string;
  label: string;
  placeholder: string;
  noMatches: string;
  clearLabel: string;
  countLabel?: string;
}

/**
 * Fast client-side DOM filtering island for the subjects directory.
 * Preserves SSR and canonical indexing while providing instant filtering.
 */
export default function SubjectDirectoryFilter({
  listId,
  label,
  placeholder,
  noMatches,
  clearLabel,
}: SubjectDirectoryFilterProps) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState<number | null>(null);

  const updateSearch = (nextQuery: string) => {
    setQuery(nextQuery);
    setShown(applyFilter(listId, nextQuery));
  };

  const handleReset = () => {
    setQuery("");
    setShown(applyFilter(listId, ""));
  };

  return (
    <div className="mb-8 space-y-3">
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>

      {/* Search Input */}
      <div className="focus-shell relative flex h-12 w-full items-center rounded-xl border border-divider bg-bg-surface px-3.5 shadow-xs transition-colors hover:border-brand/40">
        <Search className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(e) => updateSearch(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          // 16px font on mobile prevents iOS zoom, 14.5px on desktop
          className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-base text-text-heading outline-none placeholder:text-text-muted sm:text-[14.5px] [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query && (
          <button
            type="button"
            onClick={handleReset}
            aria-label={clearLabel}
            className="focus-field flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-paper hover:text-text-heading"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Live announcement of filtered count */}
      <div role="status" aria-live="polite">
        {shown === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-divider bg-bg-surface p-8 text-center sm:p-10">
            <p className="text-[15px] font-bold text-text-heading">{noMatches}</p>
            <button
              type="button"
              onClick={handleReset}
              className="focus-field mt-4 inline-flex min-h-[38px] cursor-pointer items-center gap-2 rounded-xl border border-divider bg-bg-app px-4 py-2 text-[13px] font-semibold text-brand transition-colors hover:border-brand/40"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {clearLabel}
            </button>
          </div>
        ) : shown !== null ? (
          <p className="sr-only">{`${shown} subjects shown`}</p>
        ) : null}
      </div>
    </div>
  );
}
