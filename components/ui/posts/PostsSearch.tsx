"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SearchIcon, CloseIcon } from "./icons";

/**
 * URL-synced search for the News & Events hub. Typing debounces (350 ms) and
 * updates the URL with `router.replace` (so history isn't spammed with every
 * keystroke); Enter/submit commits immediately with `push`. All state lives in
 * the URL, so Back/Forward, bookmarks, and "open a post and return" restore the
 * query for free. `basePath` already carries the locale prefix.
 */
export default function PostsSearch({
  basePath,
  placeholder,
  label,
  clearLabel,
}: {
  basePath: string;
  placeholder: string;
  label: string;
  clearLabel: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const [value, setValue] = useState(urlQuery);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCommitted = useRef(urlQuery);
  const inputId = useId();

  // Re-sync when the URL query changes from outside this input (Back/Forward,
  // a "clear all" elsewhere) — but never clobber the user mid-type.
  useEffect(() => {
    if (urlQuery !== lastCommitted.current) {
      lastCommitted.current = urlQuery;
      setValue(urlQuery);
    }
  }, [urlQuery]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function commit(next: string, replace: boolean) {
    lastCommitted.current = next;
    const p = new URLSearchParams(searchParams.toString());
    const trimmed = next.trim();
    if (trimmed) p.set("q", trimmed);
    else p.delete("q");
    p.delete("page"); // a new query always restarts at page 1
    const qs = p.toString();
    const url = `${basePath}${qs ? `?${qs}` : ""}`;
    if (replace) router.replace(url, { scroll: false });
    else router.push(url, { scroll: false });
  }

  function onChange(next: string) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(next, true), 350);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (timer.current) clearTimeout(timer.current);
    commit(value, false);
  }

  function clear() {
    if (timer.current) clearTimeout(timer.current);
    setValue("");
    commit("", true);
  }

  return (
    <form role="search" onSubmit={onSubmit} className="w-full">
      <label htmlFor={inputId} className="sr-only">{label}</label>
      <div className="flex items-center gap-2 rounded-xl border border-divider bg-bg-surface px-3.5 py-2.5 shadow-sm transition-shadow focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-focus-ring/20">
        <SearchIcon className="shrink-0 text-text-muted" />
        <input
          id={inputId}
          // type="text" (not "search") deliberately — matches SearchBar.tsx's
          // convention: a native type="search" field triggers Chromium's own
          // search-history UI, which injects a caret-color style after mount
          // and causes a hydration mismatch. inputMode/enterKeyHint below still
          // give mobile keyboards the right affordances.
          type="text"
          role="searchbox"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full border-none bg-transparent text-[16px] text-text-heading outline-none placeholder:text-text-muted sm:text-sm"
        />
        {value && (
          <button
            type="button"
            onClick={clear}
            aria-label={clearLabel}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-paper hover:text-text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </form>
  );
}
