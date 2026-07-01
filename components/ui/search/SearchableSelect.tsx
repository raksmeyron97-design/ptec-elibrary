"use client";

import { useState, useRef, useEffect } from "react";
import Icon from "@/components/ui/core/Icon";

interface SearchableSelectProps {
  name: string;
  options: string[];
  defaultValue?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
}

export default function SearchableSelect({
  name,
  options,
  defaultValue,
  disabled = false,
  required = false,
  placeholder = "Select...",
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(defaultValue ?? options[0] ?? "");
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Sync when options load asynchronously (e.g. from useEffect)
  useEffect(() => {
    if (options.length > 0 && !selected) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelected(defaultValue ?? options[0]);
    }
  }, [options, selected, defaultValue]);

  // Close on outside click  (FIX: previous code re-added the listener on cleanup
  // instead of removing it — leaked a listener on every mount)
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

  const filteredOptions = options.filter((option) =>
    option.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative w-full" ref={wrapperRef}>
      {/* Hidden input for form submission */}
      <input type="hidden" name={name} value={selected} required={required} />

      {/* Select Trigger — brand focus ring (was hardcoded teal #007c91) */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex h-11 w-full items-center justify-between rounded-lg border border-divider bg-bg-surface px-4 text-sm text-text-heading outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/30 disabled:bg-paper disabled:opacity-60"
      >
        <span className={selected ? "text-text-heading" : "text-text-muted"}>
          {selected || placeholder}
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
                  key={option}
                  onClick={() => {
                    setSelected(option);
                    setIsOpen(false);
                    setSearch("");
                  }}
                  className={`cursor-pointer rounded-md px-3 py-2 text-sm transition hover:bg-paper ${
                    selected === option
                      ? "bg-brand/5 font-semibold text-brand"
                      : "text-text-body"
                  }`}
                >
                  {option}
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
}