"use client";

import { useState, useRef, useEffect, forwardRef } from "react";
import Icon from "@/components/ui/core/Icon";

export type SearchableSelectOption = { value: string; label: string };

interface SearchableSelectProps {
  name: string;
  options: string[] | SearchableSelectOption[];
  defaultValue?: string;
  /** Controlled value — when provided, this component no longer tracks its own selection. */
  value?: string;
  /** Controlled change handler — required alongside `value`. */
  onChange?: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  /** Accessible name for the trigger button — needed since this is a custom widget, not a native <select> a wrapping <label> would associate automatically. */
  ariaLabel?: string;
}

function normalize(options: string[] | SearchableSelectOption[]): SearchableSelectOption[] {
  return options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
}

const SearchableSelect = forwardRef<HTMLButtonElement, SearchableSelectProps>(function SearchableSelect({
  name,
  options,
  defaultValue,
  value,
  onChange,
  disabled = false,
  required = false,
  placeholder = "Select...",
  ariaLabel,
}, ref) {
  const isControlled = value !== undefined;
  const normalizedOptions = normalize(options);

  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [internalSelected, setInternalSelected] = useState(defaultValue ?? normalizedOptions[0]?.value ?? "");
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selected = isControlled ? value! : internalSelected;
  const selectedLabel = normalizedOptions.find((o) => o.value === selected)?.label ?? "";

  // Sync when options load asynchronously (e.g. from useEffect) — uncontrolled only.
  useEffect(() => {
    if (isControlled) return;
    if (normalizedOptions.length > 0 && !internalSelected) {
      setInternalSelected(defaultValue ?? normalizedOptions[0].value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, internalSelected, defaultValue, isControlled]);

  // Close on outside click.
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  function selectOption(v: string) {
    if (isControlled) onChange?.(v);
    else setInternalSelected(v);
    setIsOpen(false);
    setSearch("");
  }

  const filteredOptions = normalizedOptions.filter((option) =>
    option.label.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative w-full" ref={wrapperRef}>
      {/* Hidden input for native form submission (uncontrolled callers only) */}
      {!isControlled && <input type="hidden" name={name} value={selected} required={required} />}

      {/* Select Trigger — brand focus ring (was hardcoded teal #007c91) */}
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="flex h-11 w-full items-center justify-between rounded-lg border border-divider bg-bg-surface px-4 text-sm text-text-heading outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/30 disabled:bg-paper disabled:opacity-60"
      >
        <span className={selectedLabel ? "text-text-heading" : "text-text-muted"}>
          {selectedLabel || placeholder}
        </span>
        <Icon
          name="chevron-right"
          className={`text-text-muted transition-transform ${isOpen ? "rotate-90" : "rotate-0"}`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && !disabled && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-divider bg-bg-surface p-2 shadow-lg">
          {/* Search Input */}
          <div className="relative mb-2">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
              placeholder="Search.."
              className="h-10 w-full rounded-md border border-divider pl-9 pr-3 text-sm text-text-heading outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/30"
              autoFocus
            />
          </div>

          {/* Options List */}
          <ul className="max-h-60 overflow-y-auto">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <li
                  key={option.value}
                  onClick={() => selectOption(option.value)}
                  className={`cursor-pointer rounded-md px-3 py-2 text-sm transition hover:bg-paper ${
                    selected === option.value
                      ? "bg-brand/5 font-semibold text-brand"
                      : "text-text-body"
                  }`}
                >
                  {option.label}
                </li>
              ))
            ) : (
              <li className="px-3 py-4 text-center text-sm text-text-muted">
                No results found.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
});

SearchableSelect.displayName = "SearchableSelect";

export default SearchableSelect;
