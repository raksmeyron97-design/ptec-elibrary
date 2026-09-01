"use client";

import React, { useState, useRef, KeyboardEvent, useEffect, useLayoutEffect } from "react";
import { Tag, ClipboardPaste, Plus } from "lucide-react";
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
  defaultMode?: "single" | "paste";
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
  defaultMode = "single",
  placement = "auto",
  onChange,
}: TagInputProps) {
  const [tags, setTags] = useState<string[]>(defaultTags);
  const [mode, setMode] = useState<"single" | "paste">(defaultMode);
  const [inputValue, setInputValue] = useState("");
  const [pasteValue, setPasteValue] = useState("");
  const [allTags, setAllTags] = useState<string[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pasteTextareaRef = useRef<HTMLTextAreaElement>(null);
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

  // Option 1 (ដូចមុន): Add single tag
  const addSingleTag = (tag: string) => {
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

  // Option 2 (Paste ដូចយើងទើបតែធ្វើ): Add multiple tags from comma-separated string
  const addBulkTags = (input: string) => {
    const rawItems = input.split(/[,，\n\r]+/);
    const items = rawItems.map((t) => t.trim()).filter((t) => t.length > 0);
    if (items.length === 0) return;

    setTags((prevTags) => {
      const nextTags = [...prevTags];
      for (const item of items) {
        if (nextTags.length >= max) break;
        const isDuplicate = nextTags.some(
          (t) => t.toLowerCase() === item.toLowerCase()
        );
        if (!isDuplicate) {
          nextTags.push(item);
        }
      }
      return nextTags;
    });
  };

  const removeTag = (indexToRemove: number) => {
    setTags(tags.filter((_, index) => index !== indexToRemove));
  };

  // Option 1 (ដូចមុន): KeyDown handler
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addSingleTag(inputValue);
    } else if (e.key === "Backspace" && !inputValue && tags.length > 0) {
      e.preventDefault();
      removeTag(tags.length - 1);
    }
  };

  // Option 2 (Paste): Paste handler for comma-separated keywords
  const handleBulkPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText = e.clipboardData.getData("text");
    if (pastedText.includes(",") || pastedText.includes("，") || pastedText.includes("\n")) {
      e.preventDefault();
      const combined = pasteValue.trim() ? `${pasteValue}, ${pastedText}` : pastedText;
      addBulkTags(combined);
      setPasteValue("");
    }
  };

  const submitPasteTags = () => {
    if (!pasteValue.trim()) return;
    addBulkTags(pasteValue);
    setPasteValue("");
  };

  return (
    <div className="w-full relative" ref={containerRef}>
      {label && <label className="mb-1.5 block text-sm font-semibold text-text-body">{label}</label>}

      {/* Mode Switcher Tabs */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div
          role="tablist"
          aria-label="Tag input mode"
          className="inline-flex rounded-lg border border-divider bg-paper/60 p-0.5 text-xs font-medium"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "single"}
            onClick={() => {
              setMode("single");
              setTimeout(() => inputRef.current?.focus(), 50);
            }}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors ${
              mode === "single"
                ? "bg-bg-surface text-brand font-semibold shadow-xs border border-divider/60"
                : "text-text-muted hover:text-text-body"
            }`}
          >
            <Tag className="h-3.5 w-3.5" />
            <span>វាយម្តងមួយ (Manual)</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "paste"}
            onClick={() => {
              setMode("paste");
              setTimeout(() => pasteTextareaRef.current?.focus(), 50);
            }}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors ${
              mode === "paste"
                ? "bg-bg-surface text-brand font-semibold shadow-xs border border-divider/60"
                : "text-text-muted hover:text-text-body"
            }`}
          >
            <ClipboardPaste className="h-3.5 w-3.5" />
            <span>បិទភ្ជាប់ជាបណ្តុំ (Paste)</span>
          </button>
        </div>

        <span className="text-[11px] text-text-muted">
          {tags.length}/{max} tags
        </span>
      </div>

      {/* Option 1: ដូចមុន (Single tag input with autocomplete) */}
      {mode === "single" ? (
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
              addSingleTag(inputValue);
              setIsFocused(false);
            }}
            placeholder={tags.length < max ? placeholder : ""}
            className="flex-1 min-w-[120px] border-none bg-transparent text-sm outline-none placeholder:text-text-muted disabled:cursor-not-allowed"
            disabled={disabled || tags.length >= max}
          />
        </div>
      ) : (
        /* Option 2: Paste (Bulk comma-separated paste input) */
        <div className="space-y-2">
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 rounded-xl border border-divider bg-bg-surface p-2">
              {tags.map((tag, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 rounded-full border border-brand/20 bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand"
                >
                  {tag}
                  <button
                    type="button"
                    className="ml-0.5 text-brand/60 hover:text-brand cursor-pointer leading-none"
                    onClick={() => removeTag(index)}
                    disabled={disabled}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}

          <div
            className={`rounded-xl border border-divider bg-bg-surface p-2.5 hover:border-border-strong focus-within:border-brand transition-colors ${
              disabled ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            <textarea
              ref={pasteTextareaRef}
              rows={2}
              value={pasteValue}
              onChange={(e) => setPasteValue(e.target.value)}
              onPaste={handleBulkPaste}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submitPasteTags();
                }
              }}
              placeholder="បិទភ្ជាប់ពាក្យគន្លឹះខណ្ឌដោយសញ្ញាក្បៀស (ឧ. Research Design, Qualitative Methods, Mixed Methods...)"
              className="w-full border-none bg-transparent text-sm outline-none placeholder:text-text-muted resize-none disabled:cursor-not-allowed"
              disabled={disabled || tags.length >= max}
            />
            <div className="flex items-center justify-between border-t border-divider/50 pt-2 mt-1">
              <span className="text-[11px] text-text-muted">
                បំបែកតាមសញ្ញាក្បៀស (,) ឬ ចុះបន្ទាត់
              </span>
              <button
                type="button"
                onClick={submitPasteTags}
                disabled={disabled || !pasteValue.trim() || tags.length >= max}
                className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-1 text-xs font-medium text-white shadow-xs hover:bg-brand-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>បន្ថែម (Add)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dropdown Suggestions for single mode */}
      {mode === "single" && isFocused && inputValue && filteredSuggestions.length > 0 && (
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
                  addSingleTag(suggestion);
                }}
              >
                {suggestion}
              </li>
            ))}
          </ul>
        </div>
      )}

      <input type="hidden" name={name} value={tags.join(",")} />
    </div>
  );
}
