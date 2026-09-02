"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, ChevronDown, Loader2, UserPlus, X } from "lucide-react";
import { searchBookAuthors } from "@/app/actions/book-duplicates";
import type { AuthorSuggestion } from "@/lib/books/duplicate-detection/service";
import { INPUT_CLASS } from "@/components/admin/kit/form";

/**
 * Author entry that remembers who the library already knows.
 *
 * WHY THIS REPLACED A TEXT INPUT. `saveBookRecord` upserts `authors` by exact
 * name, so "Sok Dara", "sok dara" and "Dr. Sok Dara" become three people, each
 * owning part of one person's shelf. Typing is where that happens, so this is
 * where it is fixed: existing records are offered while the librarian types,
 * and choosing one attaches the book to that exact row by id.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It never merges, and it never silently
 * substitutes. A fuzzy suggestion is labelled as one; picking it is a human
 * act; and typing a name that resembles an existing author still creates a new
 * author if that is what the librarian confirms. Two people can share a name,
 * and a catalogue that decides otherwise on a similarity score is a catalogue
 * that loses attributions.
 *
 * The control is a WAI-ARIA 1.2 combobox: a real text input the librarian can
 * always type into, with a listbox popup — not a select that hides free entry
 * behind a "create" mode.
 */

export type AuthorSelection = { id: string | null; name: string };

const MIN_QUERY = 1;
const DEBOUNCE_MS = 250;

export default function AuthorPicker({
  id,
  value,
  onChange,
  disabled = false,
  required = false,
  placeholder,
  ariaLabel,
  describedBy,
}: {
  id: string;
  value: AuthorSelection;
  onChange: (next: AuthorSelection) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  describedBy?: string;
}) {
  const t = useTranslations("adminUpload.author");
  const listId = `${id}-listbox`;
  const statusId = `${id}-status`;
  const reactId = useId().replace(/:/g, "");

  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<AuthorSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  /* A suggestion list fetched for a name the librarian has since replaced must
     never be offered against the new one. */
  const queried = useRef("");
  /* `search` has empty deps on purpose — it is called from a debounce timer,
     and giving it a changing identity would reset that timer on every render —
     so the translated string it may need reaches it through a ref. Assigned in
     an effect, never during render. */
  const lookupFailedLabel = useRef("");

  useEffect(() => {
    lookupFailedLabel.current = t("lookupFailed");
  }, [t]);

  const closeList = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) closeList();
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [closeList]);

  const search = useCallback(
    async (needle: string) => {
      const id = ++requestId.current;
      setLoading(true);
      setError(null);
      try {
        const result = await searchBookAuthors(needle);
        if (id !== requestId.current) return; // superseded
        if (!result.ok) {
          setError(result.error);
          setSuggestions([]);
          return;
        }
        queried.current = needle;
        setSuggestions(result.authors);
      } catch (cause) {
        // A Server Action can reject outright — a dropped connection, or a
        // deployment swapped under an open form. Without this the picker sat
        // spinning forever and the librarian had no way to tell a slow lookup
        // from a dead one.
        if (id !== requestId.current) return;
        console.warn("[AuthorPicker] author lookup failed:", cause);
        setError(lookupFailedLabel.current);
        setSuggestions([]);
      } finally {
        // Cleared only by the request that still owns the flag: a superseded
        // call must not switch the spinner off for the newer one behind it.
        if (id === requestId.current) setLoading(false);
      }
    },
    [],
  );

  // Debounced lookup on the typed name. Skipped entirely once a canonical
  // author is selected — the list has done its job and reopening it under the
  // selected name is noise.
  useEffect(() => {
    if (disabled || value.id) return;
    const needle = value.name.trim();
    if (needle.length < MIN_QUERY) {
      // Supersede anything in flight; the list itself is derived below rather
      // than cleared here, so this effect never sets state synchronously.
      requestId.current += 1;
      return;
    }
    const timer = window.setTimeout(() => void search(needle), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [value.name, value.id, disabled, search]);

  function pick(suggestion: AuthorSuggestion) {
    onChange({ id: suggestion.id, name: suggestion.name });
    closeList();
    inputRef.current?.focus();
  }

  function createNew() {
    onChange({ id: null, name: value.name.trim() });
    closeList();
    inputRef.current?.focus();
  }

  /** Options are the suggestions plus, when the typed name is not one of them,
   *  an explicit "create" row. The create row is an option rather than a
   *  separate button so arrow keys reach it like everything else. */
  const typed = value.name.trim();
  /* Derived, not stored: a list fetched for a name that has since been cleared
     or shortened is not a list about the current name. */
  const visible = typed.length >= MIN_QUERY && !value.id ? suggestions : [];
  const exactExists = visible.some(
    (s) => s.name.trim().toLowerCase() === typed.toLowerCase(),
  );
  const showCreate = typed.length >= MIN_QUERY && !exactExists;
  const optionCount = visible.length + (showCreate ? 1 : 0);

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(0);
        return;
      }
      if (optionCount === 0) return;
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) => (index + delta + optionCount) % optionCount);
      return;
    }
    if (event.key === "Enter") {
      if (!open || activeIndex < 0) return;
      // Only swallow Enter when it is selecting an option — otherwise the
      // form's own submit must still work from this field.
      event.preventDefault();
      if (activeIndex < visible.length) pick(visible[activeIndex]);
      else if (showCreate) createNew();
      return;
    }
    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        closeList();
      }
      return;
    }
    if (event.key === "Tab") closeList();
  }

  const selected = Boolean(value.id);

  return (
    <div ref={wrapperRef} className="relative min-w-0">
      {/* The values the form actually submits. The visible combobox is
          unnamed on purpose: FormData must carry the resolved pair, not
          whatever half-typed string is in the box. */}
      <input type="hidden" name="author" value={value.name} />
      <input type="hidden" name="authorId" value={value.id ?? ""} />

      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && activeIndex >= 0 ? `${reactId}-option-${activeIndex}` : undefined
          }
          aria-label={ariaLabel}
          aria-describedby={[describedBy, statusId].filter(Boolean).join(" ") || undefined}
          aria-required={required || undefined}
          disabled={disabled}
          placeholder={placeholder}
          value={value.name}
          onChange={(event) => {
            // Editing the text detaches the canonical selection: the id must
            // never outlive the name it stood for.
            onChange({ id: null, name: event.target.value });
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => {
            if (!value.id && value.name.trim().length >= MIN_QUERY) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className={`${INPUT_CLASS} pe-9 ${selected ? "border-success-line" : ""}`}
        />

        <span className="pointer-events-none absolute inset-y-0 end-0 flex items-center pe-3">
          {loading ? (
            <Loader2
              className="h-4 w-4 animate-spin text-text-muted motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : selected ? (
            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4 text-text-muted" aria-hidden="true" />
          )}
        </span>
      </div>

      {/* One live region for the whole control: what was selected, or why the
          list is empty. Screen readers get the state change without the option
          list being announced on every keystroke. */}
      <p id={statusId} role="status" className="mt-1.5 text-xs">
        {selected ? (
          <span className="inline-flex items-center gap-1 font-medium text-success-text">
            <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
            {t("selected")}
            <button
              type="button"
              onClick={() => {
                onChange({ id: null, name: value.name });
                inputRef.current?.focus();
              }}
              disabled={disabled}
              className="focus-field ms-1 inline-flex items-center gap-0.5 rounded text-text-muted transition-colors hover:text-danger-text disabled:opacity-50"
            >
              <X className="h-3 w-3" aria-hidden="true" />
              {t("clear")}
            </button>
          </span>
        ) : error ? (
          <span className="font-medium text-warning-text">{error}</span>
        ) : (
          <span className="text-text-muted">{t("hint")}</span>
        )}
      </p>

      {open && (optionCount > 0 || (!loading && typed.length >= MIN_QUERY)) && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t("suggestions")}
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-divider bg-bg-surface py-1 shadow-lg"
        >
          {visible.map((suggestion, index) => (
            <li
              key={suggestion.id}
              id={`${reactId}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(suggestion)}
              onMouseEnter={() => setActiveIndex(index)}
              className={`cursor-pointer px-3 py-2 ${
                index === activeIndex ? "bg-surface-brand-soft" : ""
              }`}
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-medium text-text-heading">
                  {suggestion.name}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-text-muted">
                  {t("bookCount", { count: suggestion.bookCount })}
                </span>
              </span>
              {suggestion.matchKind === "fuzzy" && (
                <span className="mt-0.5 block text-xs text-text-muted">{t("fuzzyNote")}</span>
              )}
            </li>
          ))}

          {showCreate && (
            <li
              id={`${reactId}-option-${visible.length}`}
              role="option"
              aria-selected={activeIndex === visible.length}
              onMouseDown={(event) => event.preventDefault()}
              onClick={createNew}
              onMouseEnter={() => setActiveIndex(visible.length)}
              className={`cursor-pointer border-t border-divider px-3 py-2 ${
                activeIndex === visible.length ? "bg-surface-brand-soft" : ""
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-brand">
                <UserPlus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {t("createNew", { name: typed })}
              </span>
            </li>
          )}

          {optionCount === 0 && !loading && (
            <li className="px-3 py-2 text-sm text-text-muted">{t("noMatches")}</li>
          )}
        </ul>
      )}
    </div>
  );
}
