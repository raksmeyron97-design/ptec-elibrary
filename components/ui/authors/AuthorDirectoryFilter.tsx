"use client";

import { useId, useState } from "react";
import { Search, X, RotateCcw } from "lucide-react";
import { authorFilterKey } from "@/lib/authors/filter-key";
import AlphabetIndex from "@/components/ui/collection/AlphabetIndex";

function applyFilter(listId: string, query: string, letter: string | null): number | null {
  const list = document.getElementById(listId);
  if (!list) return null;
  const key = authorFilterKey(query);
  const targetLetter = letter?.toUpperCase() ?? null;
  let shown = 0;

  for (const row of list.querySelectorAll<HTMLElement>("[data-author-key]")) {
    const rowKey = row.dataset.authorKey ?? "";
    const rowLetter = (row.dataset.letter ?? "").toUpperCase();
    const rowIsKhmer = row.dataset.isKhmer === "true";

    const matchesQuery = !key || rowKey.includes(key);
    let matchesLetter = true;

    if (targetLetter) {
      if (targetLetter === "KHMER") {
        matchesLetter = rowIsKhmer;
      } else {
        matchesLetter = rowLetter === targetLetter;
      }
    }

    const visible = matchesQuery && matchesLetter;
    row.hidden = !visible;
    if (visible) shown++;
  }

  const hasFilter = !!key || targetLetter !== null;
  return hasFilter ? shown : null;
}

export interface AuthorDirectoryFilterProps {
  /** id of the server-rendered <ul> whose rows carry data-author-key, data-letter, data-is-khmer. */
  listId: string;
  label: string;
  placeholder: string;
  noMatches: string;
  clearLabel: string;
  availableLetters?: string[];
  allLetterLabel?: string;
  khmerLetterLabel?: string;
  alphabetNavLabel?: string;
}

export default function AuthorDirectoryFilter({
  listId,
  label,
  placeholder,
  noMatches,
  clearLabel,
  availableLetters = [],
  allLetterLabel = "All",
  khmerLetterLabel = "Khmer",
  alphabetNavLabel = "Filter contributors by first letter",
}: AuthorDirectoryFilterProps) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [shown, setShown] = useState<number | null>(null);

  const updateSearch = (nextQuery: string) => {
    setQuery(nextQuery);
    setShown(applyFilter(listId, nextQuery, selectedLetter));
  };

  const updateLetter = (nextLetter: string | null) => {
    setSelectedLetter(nextLetter);
    setShown(applyFilter(listId, query, nextLetter));
  };

  const handleResetAll = () => {
    setQuery("");
    setSelectedLetter(null);
    setShown(applyFilter(listId, "", null));
  };

  // Split available letters into Latin and Khmer presence
  const latinLetters = availableLetters.filter((l) => /^[A-Z]$/i.test(l));
  const hasKhmer = availableLetters.some((l) => /[\u1780-\u17FF]/.test(l));
  const lettersToShow = hasKhmer ? [...latinLetters, "KHMER"] : latinLetters;

  return (
    <div className="mb-6 space-y-3">
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
          // 16px font on phone prevents iOS zoom
          className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-base text-text-heading outline-none placeholder:text-text-muted sm:text-[14.5px] [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => updateSearch("")}
            aria-label={clearLabel}
            className="focus-field flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-paper hover:text-text-heading"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Alphabetical Quick-Filter */}
      {lettersToShow.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-hidden">
          <AlphabetIndex
            availableLetters={lettersToShow}
            activeLetter={selectedLetter}
            onSelectLetter={updateLetter}
            allLabel={allLetterLabel}
            ariaLabel={alphabetNavLabel}
            className="my-0 flex-1"
          />
        </div>
      )}

      {/* Live announcement of filtered count */}
      <div role="status" aria-live="polite">
        {shown === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-divider bg-bg-surface p-8 text-center sm:p-10">
            <p className="text-[15px] font-bold text-text-heading">{noMatches}</p>
            <button
              type="button"
              onClick={handleResetAll}
              className="focus-field mt-4 inline-flex min-h-[38px] cursor-pointer items-center gap-2 rounded-xl border border-divider bg-bg-app px-4 py-2 text-[13px] font-semibold text-brand transition-colors hover:border-brand/40"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {clearLabel}
            </button>
          </div>
        ) : shown !== null ? (
          <p className="sr-only">{`${shown} results`}</p>
        ) : null}
      </div>
    </div>
  );
}
