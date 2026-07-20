"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Plus, ChevronDown, Search, Loader2 } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
}

interface AddableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Called with the raw input when "Add" is clicked. Return new option or null on failure. */
  onAdd?: (input: string) => Promise<SelectOption | null>;
  placeholder?: string;
  addPlaceholder?: string;
  disabled?: boolean;
  /** External label to validate add input (e.g. "Enter a number") */
  addHint?: string;
}

const BASE_BTN =
  "flex h-11 w-full items-center justify-between rounded-lg border border-divider bg-bg-surface px-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15";

export default function AddableSelect({
  value,
  onChange,
  options,
  onAdd,
  placeholder = "Select…",
  addPlaceholder = "Type to add…",
  disabled = false,
  addHint,
}: AddableSelectProps) {
  const t = useTranslations("adminThesisForm.addableSelect");
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch("");
        setAddError("");
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;

  const filteredOptions = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  // Show add-new button when there's input and no exact match
  const exactMatch = options.some(
    (o) => o.label.toLowerCase() === search.toLowerCase() || o.value.toLowerCase() === search.toLowerCase()
  );
  const canAdd = !!onAdd && search.trim().length > 0 && !exactMatch;

  function select(opt: SelectOption) {
    onChange(opt.value);
    setIsOpen(false);
    setSearch("");
    setAddError("");
  }

  async function handleAdd() {
    if (!onAdd || !search.trim()) return;
    setAdding(true);
    setAddError("");
    try {
      const result = await onAdd(search.trim());
      if (result) {
        onChange(result.value);
        setIsOpen(false);
        setSearch("");
      } else {
        setAddError(t("addFailed"));
      }
    } catch (err) {
      setAddError(err instanceof Error ? err.message : t("addFailedShort"));
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="relative w-full" ref={wrapperRef}>
      {/* Trigger button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) setIsOpen((prev) => !prev);
        }}
        className={`${BASE_BTN} disabled:bg-paper disabled:opacity-60 disabled:cursor-not-allowed`}
      >
        <span className={value ? "text-text-heading" : "text-text-muted"}>
          {value ? selectedLabel : placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-text-muted transition-transform shrink-0 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown */}
      {isOpen && !disabled && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-divider bg-bg-surface p-2 shadow-lg">
          {/* Search input */}
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setAddError(""); }}
              placeholder={onAdd ? addPlaceholder : t("search")}
              autoFocus
              className="h-9 w-full rounded-md border border-divider pl-8 pr-3 text-sm text-text-heading outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15"
            />
          </div>

          {/* Options list */}
          <ul className="max-h-52 overflow-y-auto">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => (
                <li
                  key={opt.value}
                  onClick={() => select(opt)}
                  className={`cursor-pointer rounded-md px-3 py-2 text-sm transition hover:bg-paper ${
                    opt.value === value ? "bg-brand/5 font-semibold text-brand" : "text-text-body"
                  }`}
                >
                  {opt.label}
                </li>
              ))
            ) : (
              !canAdd && (
                <li className="px-3 py-3 text-center text-sm text-text-muted">
                  {t("noResults")}
                </li>
              )
            )}
          </ul>

          {/* Add new */}
          {canAdd && (
            <div className="mt-1 border-t border-divider pt-1">
              {addError && (
                <p className="px-3 py-1 text-xs text-red-600">{addError}</p>
              )}
              {addHint && !addError && (
                <p className="px-3 pb-1 text-xs text-text-muted">{addHint}</p>
              )}
              <button
                type="button"
                onClick={handleAdd}
                disabled={adding}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-brand transition hover:bg-brand/5 disabled:opacity-50"
              >
                {adding ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                {t("add", { value: search.trim() })}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
