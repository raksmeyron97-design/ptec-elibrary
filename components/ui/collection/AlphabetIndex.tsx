"use client";

import React from "react";

export interface AlphabetIndexProps {
  /** Available letters in the collection (letters with no items can be disabled or omitted) */
  availableLetters: string[];
  activeLetter: string | null;
  onSelectLetter: (letter: string | null) => void;
  allLabel?: string;
  ariaLabel?: string;
  className?: string;
}

/**
 * Alphabetical jump index for directories.
 * Keyboard accessible, responsive, semantic nav with subtle active states.
 */
export default function AlphabetIndex({
  availableLetters,
  activeLetter,
  onSelectLetter,
  allLabel = "All",
  ariaLabel = "Alphabetical navigation",
  className = "",
}: AlphabetIndexProps) {
  const lettersSet = new Set(availableLetters.map((l) => l.toUpperCase()));

  return (
    <nav
      aria-label={ariaLabel}
      className={`relative my-4 flex items-center gap-1 overflow-x-auto py-1 scrollbar-none sm:flex-wrap sm:justify-start ${className}`}
    >
      <button
        type="button"
        onClick={() => onSelectLetter(null)}
        aria-pressed={activeLetter === null}
        className={`focus-field inline-flex min-h-[34px] min-w-[40px] shrink-0 cursor-pointer items-center justify-center rounded-lg px-2.5 text-[12.5px] font-semibold transition-colors ${
          activeLetter === null
            ? "border border-brand bg-brand/10 text-brand shadow-xs"
            : "border border-divider bg-bg-surface text-text-muted hover:border-brand/40 hover:text-text-heading"
        }`}
      >
        {allLabel}
      </button>

      {availableLetters.map((letter) => {
        const upper = letter.toUpperCase();
        const isActive = activeLetter?.toUpperCase() === upper;
        const hasItems = lettersSet.has(upper);

        return (
          <button
            key={upper}
            type="button"
            disabled={!hasItems}
            onClick={() => onSelectLetter(isActive ? null : upper)}
            aria-pressed={isActive}
            className={`focus-field inline-flex h-8.5 min-w-[34px] shrink-0 cursor-pointer items-center justify-center rounded-lg px-2 text-[12.5px] font-bold transition-colors ${
              isActive
                ? "border border-brand bg-brand/10 text-brand shadow-xs"
                : hasItems
                  ? "border border-divider bg-bg-surface text-text-muted hover:border-brand/40 hover:text-text-heading"
                  : "cursor-not-allowed border border-transparent text-text-muted/30"
            }`}
          >
            {upper}
          </button>
        );
      })}
    </nav>
  );
}
