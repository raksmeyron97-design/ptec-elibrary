"use client";

// components/ui/authors/AuthorDirectoryFilter.tsx
// "Find an author" for the /authors directory.
//
// The directory itself stays SERVER-rendered, all of it: it is the page's
// CollectionPage/ItemList structure and the crawl path to every author
// profile, and without JavaScript it simply lists everyone. This island only
// hides the rows that do not match, in place — so the 269 names are not sent
// a second time in the client payload to be re-rendered from state.
//
// Filtering happens in the input's change handler rather than an effect: it
// is a response to typing, and the count it returns is the only state.

import { useId, useState } from "react";
import { Search, X } from "lucide-react";
import { authorFilterKey } from "@/lib/authors/filter-key";

function applyFilter(listId: string, query: string): number | null {
  const list = document.getElementById(listId);
  if (!list) return null;
  const key = authorFilterKey(query);
  let shown = 0;
  for (const row of list.querySelectorAll<HTMLElement>("[data-author-key]")) {
    const match = !key || (row.dataset.authorKey ?? "").includes(key);
    row.hidden = !match;
    if (match) shown++;
  }
  return key ? shown : null;
}

export default function AuthorDirectoryFilter({
  listId,
  label,
  placeholder,
  noMatches,
  clearLabel,
}: {
  /** id of the server-rendered <ul> whose rows carry data-author-key. */
  listId: string;
  label: string;
  placeholder: string;
  noMatches: string;
  clearLabel: string;
}) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  // null = no active filter; a number = how many rows the filter left.
  const [shown, setShown] = useState<number | null>(null);

  const update = (next: string) => {
    setQuery(next);
    setShown(applyFilter(listId, next));
  };

  return (
    <div className="mb-5">
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <div className="focus-shell flex h-12 items-center gap-2 rounded-xl border border-divider bg-bg-surface px-3.5 shadow-sm">
        <Search className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(e) => update(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          // 16px on phones: iOS zooms into any smaller field on focus.
          className="h-full min-w-0 flex-1 bg-transparent text-base text-text-heading outline-none placeholder:text-text-muted [&::-webkit-search-cancel-button]:appearance-none sm:text-[15px]"
        />
        {query && (
          <button
            type="button"
            onClick={() => update("")}
            aria-label={clearLabel}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-paper hover:text-text-heading"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      <p role="status" aria-live="polite" className={shown === 0 ? "mt-4 rounded-xl border border-divider bg-bg-surface p-5 text-center text-[14px] text-text-muted" : "sr-only"}>
        {shown === 0 ? noMatches : ""}
      </p>
    </div>
  );
}
