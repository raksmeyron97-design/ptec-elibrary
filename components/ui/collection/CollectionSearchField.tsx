"use client";

import React, { useId } from "react";
import { Search, X } from "lucide-react";

export interface CollectionSearchFieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  label: string;
  placeholder: string;
  clearLabel?: string;
  className?: string;
  autoFocus?: boolean;
}

/**
 * High-usability search field for directory and collection listings.
 * Enforces >=44px touch targets and 16px minimum mobile font to prevent iOS zoom.
 */
export default function CollectionSearchField({
  id,
  value,
  onChange,
  onClear,
  label,
  placeholder,
  clearLabel = "Clear search",
  className = "",
  autoFocus = false,
}: CollectionSearchFieldProps) {
  const generatedId = useId();
  const inputId = id || generatedId;

  const handleClear = () => {
    onChange("");
    if (onClear) onClear();
  };

  return (
    <div className={`relative w-full ${className}`}>
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <div className="focus-shell relative flex min-h-[46px] w-full items-center rounded-xl border border-divider bg-bg-surface px-3.5 shadow-sm transition-all hover:border-brand/30">
        <Search
          className="pointer-events-none h-4 w-4 shrink-0 text-text-muted"
          aria-hidden="true"
        />
        <input
          id={inputId}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          autoFocus={autoFocus}
          // text-base on mobile prevents iOS viewport zoom, sm:text-[14.5px] on desktop
          className="h-full min-w-0 flex-1 bg-transparent px-2.5 py-2.5 text-base text-text-heading outline-none placeholder:text-text-muted sm:text-[14.5px] [&::-webkit-search-cancel-button]:appearance-none"
        />
        {value && (
          <button
            type="button"
            onClick={handleClear}
            aria-label={clearLabel}
            className="focus-field inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-paper hover:text-text-heading"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
