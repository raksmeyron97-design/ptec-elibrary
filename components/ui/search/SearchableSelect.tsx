"use client";

import { useState, useRef, useEffect, useLayoutEffect, useId, forwardRef } from "react";
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
  /**
   * Which option the keyboard is on. It is NOT the selection: a listbox has a
   * focused option and a chosen one, and conflating them would commit a value
   * on every arrow press. `-1` means "nothing focused yet", which is the state
   * the list opens in so a screen reader announces the list before a value.
   */
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Stable ids so the trigger and the search field can point at the listbox,
  // and `aria-activedescendant` can name one option without moving DOM focus
  // away from the search field the user is typing into.
  const reactId = useId();
  const listboxId = `${reactId}-listbox`;
  const optionId = (index: number) => `${reactId}-option-${index}`;

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

  const filteredOptions = normalizedOptions.filter((option) =>
    option.label.toLowerCase().includes(search.toLowerCase())
  );

  // Typing narrows the list, so an index into the previous list now points at
  // a different option — or at nothing. Reset rather than carry it over.
  // Deliberately NOT keyed on `isOpen` too: opening with ArrowDown sets the
  // cursor to the first option, and an open-keyed reset would run afterwards
  // and clear it, which is the whole behaviour that key exists to provide.
  useEffect(() => {
    setActiveIndex(-1);
  }, [search]);

  // Keep the keyboard-focused option in view. Native <select> does this for
  // free; a scrollable <ul> does not, so arrowing past the fold would move an
  // invisible cursor. Indexed off `children` rather than by id: `useId`
  // produces ids containing ":", which is not a valid CSS selector.
  useEffect(() => {
    if (!isOpen || activeIndex < 0) return;
    const option = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    // Scrolling is a nicety; the cursor is already correct without it. Guarded
    // because `scrollIntoView` is not implemented in jsdom, and a keyboard
    // handler that throws would take the whole selection with it.
    if (typeof option?.scrollIntoView === "function") {
      option.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, isOpen]);

  function openMenu(startAt: "none" | "first" | "last" = "none") {
    if (disabled) return;
    checkPlacement();
    setIsOpen(true);
    setActiveIndex(
      startAt === "first" ? 0 : startAt === "last" ? filteredOptions.length - 1 : -1,
    );
  }

  function closeMenu({ refocusTrigger = false }: { refocusTrigger?: boolean } = {}) {
    setIsOpen(false);
    setSearch("");
    setActiveIndex(-1);
    // Closing with the keyboard must leave focus somewhere reachable. The
    // popup is unmounted on close, so without this the focused element is
    // gone and focus falls back to <body> — the user's place in the form is
    // lost, which is worse than never having opened the menu.
    if (refocusTrigger) {
      wrapperRef.current?.querySelector("button")?.focus();
    }
  }

  function handleToggle() {
    if (disabled) return;
    if (isOpen) closeMenu();
    else openMenu();
  }

  function selectOption(v: string) {
    if (isControlled) onChange?.(v);
    else setInternalSelected(v);
    closeMenu();
  }

  /** Arrow keys on the trigger open the menu, as a native <select> does. */
  function handleTriggerKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled || isOpen) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      openMenu(e.key === "ArrowDown" ? "first" : "last");
    }
  }

  /**
   * The search field is the combobox: it holds DOM focus while the list is
   * open, so every list key has to be handled here and reflected back through
   * `aria-activedescendant`.
   */
  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const last = filteredOptions.length - 1;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (last < 0) return;
        setActiveIndex((i) => (i >= last ? 0 : i + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        if (last < 0) return;
        setActiveIndex((i) => (i <= 0 ? last : i - 1));
        break;
      case "Home":
        if (last < 0) return;
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        if (last < 0) return;
        e.preventDefault();
        setActiveIndex(last);
        break;
      case "Enter": {
        // Always prevent default: this widget is used inside forms, and a bare
        // Enter in the search field would otherwise submit the form around it.
        e.preventDefault();
        const option = filteredOptions[activeIndex];
        if (option) selectOption(option.value);
        break;
      }
      case "Escape":
        e.preventDefault();
        closeMenu({ refocusTrigger: true });
        break;
      case "Tab":
        // Tabbing away is a dismissal, not a choice. Let focus move on.
        closeMenu();
        break;
    }
  }

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
        onKeyDown={handleTriggerKeyDown}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
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
          {/*
            ARIA 1.2 combobox with `aria-activedescendant`: the SEARCH FIELD is
            the combobox and keeps DOM focus, while the cursor moves through
            `<ul role="listbox">` / `<li role="option">` below. Three linter
            rules object to this shape and all three are wrong about it, so
            before "correcting" any of them, check Chrome's accessibility tree:

              - `role="combobox"` on the input is NOT redundant. A bare
                `<input type="text">` computes as `textbox`; removing the role
                drops the combobox from the tree entirely AND stops
                `aria-activedescendant` being exposed at all (verified against
                the live panel via CDP `Accessibility.getFullAXTree`).
              - `role="listbox"` on a `<ul>` is the canonical markup for this
                pattern, not an interactive role bolted onto a static element.
              - the options carry `onClick` and no key handler ON PURPOSE: under
                `aria-activedescendant` they must not be individually focusable,
                and every key is handled once, on the combobox.

            `autoFocus` is likewise deliberate — it fires when the menu opens,
            not on page load, and the pattern requires focus to enter the popup.
          */}
          <div className="relative mb-2">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              role="combobox"
              aria-expanded
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-label={ariaLabel ? `Search ${ariaLabel}` : "Search options"}
              aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
              placeholder="Search.."
              className="h-10 w-full rounded-md border border-divider pl-9 pr-3 text-sm text-text-heading outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/30"
              autoFocus
            />
          </div>

          {/* Options List */}
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            className="max-h-60 overflow-y-auto"
          >
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option, index) => (
                <li
                  key={option.value}
                  id={optionId(index)}
                  role="option"
                  aria-selected={selected === option.value}
                  onClick={() => selectOption(option.value)}
                  // Pointer and keyboard share one cursor, so moving the mouse
                  // does not leave a second highlight behind somewhere else.
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`cursor-pointer rounded-md px-3 py-2 text-sm transition ${
                    index === activeIndex ? "bg-paper" : ""
                  } ${
                    selected === option.value
                      ? "bg-brand/5 font-semibold text-brand"
                      : "text-text-body"
                  }`}
                >
                  {option.label}
                </li>
              ))
            ) : (
              // Not an option: an empty-state message inside a listbox would be
              // announced and arrowed onto as if it were a choosable value.
              <li role="presentation" className="px-3 py-4 text-center text-sm text-text-muted">
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
