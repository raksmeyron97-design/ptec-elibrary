"use client";

import { useState, useRef, useEffect, useLayoutEffect, forwardRef } from "react";
import Icon from "@/components/ui/core/Icon";

/**
 * `useLayoutEffect` warns when it runs during server rendering, and a client
 * component still renders on the server. Same hook, no warning.
 *
 * Placement is measured from the laid-out DOM, so it has to be resolved
 * before paint — a passive effect flips the menu one frame *after* it has
 * already been painted downward.
 */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

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
  /**
   * Trigger affordance. "down" is the conventional select chevron (down when
   * closed, up when open); "right" is the disclosure arrow this component
   * shipped with and stays the default so existing call sites are unchanged.
   */
  chevron?: "right" | "down";
  /** Dropdown menu placement: "auto" (default), "top", or "bottom" */
  placement?: "auto" | "top" | "bottom";
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
  chevron = "right",
  placement = "auto",
}, ref) {
  const isControlled = value !== undefined;
  const normalizedOptions = normalize(options);

  const [isOpen, setIsOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [search, setSearch] = useState("");
  const [internalSelected, setInternalSelected] = useState(defaultValue ?? normalizedOptions[0]?.value ?? "");
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selected = isControlled ? value! : internalSelected;
  const selectedLabel = normalizedOptions.find((o) => o.value === selected)?.label ?? "";

  const checkPlacement = () => {
    if (placement === "top") {
      setDropUp(true);
      return;
    }
    if (placement === "bottom") {
      setDropUp(false);
      return;
    }
    if (wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      const stickyBar = document.querySelector(".sticky.bottom-4, [class*='bottom-']");
      const bottomOffset = stickyBar ? 80 : 0;
      let spaceBelow = window.innerHeight - bottomOffset - rect.bottom;
      let spaceAbove = rect.top;

      // Also check bounding box of any scroll container or modal dialog ancestor
      const scrollParent = wrapperRef.current.closest(".overflow-y-auto, [role='dialog'], form");
      if (scrollParent) {
        const parentRect = scrollParent.getBoundingClientRect();
        const parentSpaceBelow = parentRect.bottom - rect.bottom;
        const parentSpaceAbove = rect.top - parentRect.top;
        spaceBelow = Math.min(spaceBelow, parentSpaceBelow);
        spaceAbove = Math.min(spaceAbove, parentSpaceAbove);
      }

      setDropUp(spaceBelow < 280 && spaceAbove > spaceBelow);
    }
  };

  // Sync when options load asynchronously (e.g. from useEffect) — uncontrolled only.
  useEffect(() => {
    if (isControlled) return;
    if (normalizedOptions.length > 0 && !internalSelected) {
      setInternalSelected(defaultValue ?? normalizedOptions[0].value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, internalSelected, defaultValue, isControlled]);

  // Recheck placement when open, or on resize/scroll
  useIsomorphicLayoutEffect(() => {
    if (!isOpen) return;
    checkPlacement();
    const handleScrollOrResize = () => checkPlacement();
    window.addEventListener("resize", handleScrollOrResize);
    window.addEventListener("scroll", handleScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", handleScrollOrResize);
      window.removeEventListener("scroll", handleScrollOrResize, true);
    };
  }, [isOpen, placement]);

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

  function handleToggle() {
    if (disabled) return;
    if (!isOpen) {
      checkPlacement();
    }
    setIsOpen((prev) => !prev);
  }

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
      {/* Hidden input for native form submission.
          Rendered in BOTH modes on purpose. It used to be uncontrolled-only,
          which quietly broke the contract this component advertises by taking a
          `name`: a controlled caller got a widget that displayed a selection,
          reported it to `onChange`, and contributed NOTHING to `new
          FormData(form)`. The book upload form hit exactly that — the
          department was visibly chosen, the readiness panel said "Category and
          department set", and the server answered "department is required",
          because `formData.get("department")` was null. `selected` resolves to
          the controlled `value` when there is one, so this is the same value
          the trigger displays either way. */}
      <input type="hidden" name={name} value={selected} required={required} />

      {/* Select Trigger — brand focus ring (was hardcoded teal #007c91) */}
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        onClick={handleToggle}
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
          className={`text-text-muted transition-transform ${
            chevron === "down"
              ? isOpen ? "-rotate-90" : "rotate-90"
              : isOpen ? "rotate-90" : "rotate-0"
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && !disabled && (
        <div
          className={`absolute z-50 w-full rounded-lg border border-divider bg-bg-surface p-2 shadow-xl ${
            dropUp ? "bottom-full mb-1.5" : "top-full mt-1.5"
          }`}
        >
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
