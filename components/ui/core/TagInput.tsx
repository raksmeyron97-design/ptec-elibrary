"use client";

import React, { useState, useRef, KeyboardEvent, useEffect, useLayoutEffect } from "react";
import { getAllTags } from "@/app/actions/tags";

/**
 * `useLayoutEffect` warns when it runs during server rendering, and a client
 * component still renders on the server. Same hook, no warning.
 *
 * Placement is measured from the laid-out DOM, so it has to be resolved
 * before paint — a passive effect flips the menu one frame *after* it has
 * already been painted downward.
 */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

interface TagInputProps {
  name: string;
  defaultTags?: string[];
  placeholder?: string;
  max?: number;
  disabled?: boolean;
  label?: string;
  /** Dropdown menu placement: "auto" (default), "top", or "bottom" */
  placement?: "auto" | "top" | "bottom";
  /** Notified with the current tag list on every change (including mount). Optional — most callers just read the hidden input at submit time. */
  onChange?: (tags: string[]) => void;
}

export default function TagInput({
  name,
  defaultTags = [],
  placeholder = "Add a tag...",
  max = 20,
  disabled = false,
  label,
  placement = "auto",
  onChange,
}: TagInputProps) {
  const [tags, setTags] = useState<string[]>(defaultTags);
  const [inputValue, setInputValue] = useState("");
  const [allTags, setAllTags] = useState<string[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getAllTags().then(setAllTags).catch(console.error);
  }, []);

  useEffect(() => {
    onChange?.(tags);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tags]);

  const checkPlacement = () => {
    if (placement === "top") {
      setDropUp(true);
      return;
    }
    if (placement === "bottom") {
      setDropUp(false);
      return;
    }
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const stickyBar = document.querySelector(".sticky.bottom-4, [class*='bottom-']");
      const bottomOffset = stickyBar ? 80 : 0;
      let spaceBelow = window.innerHeight - bottomOffset - rect.bottom;
      let spaceAbove = rect.top;

      const scrollParent = containerRef.current.closest(".overflow-y-auto, [role='dialog'], form");
      if (scrollParent) {
        const parentRect = scrollParent.getBoundingClientRect();
        const parentSpaceBelow = parentRect.bottom - rect.bottom;
        const parentSpaceAbove = rect.top - parentRect.top;
        spaceBelow = Math.min(spaceBelow, parentSpaceBelow);
        spaceAbove = Math.min(spaceAbove, parentSpaceAbove);
      }

      setDropUp(spaceBelow < 250 && spaceAbove > spaceBelow);
    }
  };

  useIsomorphicLayoutEffect(() => {
    if (!isFocused) return;
    checkPlacement();
    const handleScrollOrResize = () => checkPlacement();
    window.addEventListener("resize", handleScrollOrResize);
    window.addEventListener("scroll", handleScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", handleScrollOrResize);
      window.removeEventListener("scroll", handleScrollOrResize, true);
    };
  }, [isFocused, placement]);

  const filteredSuggestions = allTags.filter(
    (t) =>
      t.toLowerCase().includes(inputValue.toLowerCase()) &&
      !tags.some((existing) => existing.toLowerCase() === t.toLowerCase())
  ).slice(0, 50); // limit to 50 to avoid rendering huge lists

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    if (tags.length >= max) return;
    
    // Case-insensitive duplicate check
    const isDuplicate = tags.some((t) => t.toLowerCase() === trimmed.toLowerCase());
    if (!isDuplicate) {
      setTags([...tags, trimmed]);
    }
    setInputValue("");
  };

  const removeTag = (indexToRemove: number) => {
    setTags(tags.filter((_, index) => index !== indexToRemove));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === "Backspace" && !inputValue && tags.length > 0) {
      // Remove last tag when pressing backspace on empty input
      e.preventDefault();
      removeTag(tags.length - 1);
    }
  };

  return (
    <div className="w-full relative" ref={containerRef}>
      {label && <label className="mb-1.5 block text-sm font-semibold text-text-body">{label}</label>}
      <div
        className={`focus-shell flex flex-wrap gap-1.5 min-h-[44px] rounded-xl border border-divider bg-bg-surface p-2 hover:border-border-strong ${
          disabled ? "opacity-60 pointer-events-none" : ""
        }`}
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag, index) => (
          <span
            key={index}
            className="inline-flex items-center gap-1 rounded-full border border-brand/20 bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand"
          >
            {tag}
            <button
              type="button"
              className="ml-0.5 text-brand/60 hover:text-brand cursor-pointer leading-none"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(index);
              }}
              disabled={disabled}
            >
              ✕
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            checkPlacement();
            setIsFocused(true);
          }}
          onBlur={() => {
            addTag(inputValue);
            setIsFocused(false);
          }}
          placeholder={tags.length < max ? placeholder : ""}
          className="flex-1 min-w-[120px] border-none bg-transparent text-sm outline-none placeholder:text-text-muted disabled:cursor-not-allowed"
          disabled={disabled || tags.length >= max}
        />
      </div>
      
      {/* Dropdown Suggestions */}
      {isFocused && inputValue && filteredSuggestions.length > 0 && (
        <div
          className={`absolute z-50 w-full rounded-xl border border-divider bg-bg-surface p-1.5 shadow-xl ${
            dropUp ? "bottom-full mb-1.5" : "top-full mt-1.5"
          }`}
        >
          <ul className="max-h-48 overflow-y-auto space-y-0.5">
            {filteredSuggestions.map((suggestion) => (
              <li
                key={suggestion}
                className="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium text-text-body transition-colors hover:bg-brand/5 hover:text-brand"
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevents input from losing focus
                  addTag(suggestion);
                }}
              >
                {suggestion}
              </li>
            ))}
          </ul>
        </div>
      )}

      <input type="hidden" name={name} value={tags.join(",")} />
      {tags.length > 0 && (
        <div className="mt-1 text-right text-[11px] text-text-muted">
          {tags.length}/{max} tags
        </div>
      )}
    </div>
  );
}
