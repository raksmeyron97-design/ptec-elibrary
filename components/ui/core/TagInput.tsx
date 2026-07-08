"use client";

import React, { useState, useRef, KeyboardEvent, useEffect } from "react";
import { getAllTags } from "@/app/actions/tags";

interface TagInputProps {
  name: string;
  defaultTags?: string[];
  placeholder?: string;
  max?: number;
  disabled?: boolean;
  label?: string;
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
  onChange,
}: TagInputProps) {
  const [tags, setTags] = useState<string[]>(defaultTags);
  const [inputValue, setInputValue] = useState("");
  const [allTags, setAllTags] = useState<string[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getAllTags().then(setAllTags).catch(console.error);
  }, []);

  useEffect(() => {
    onChange?.(tags);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tags]);

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
    <div className="w-full relative">
      {label && <label className="mb-1.5 block text-sm font-semibold text-text-body">{label}</label>}
      <div
        className={`flex flex-wrap gap-1.5 min-h-[44px] rounded-xl border border-divider bg-bg-surface p-2 transition focus-within:border-brand focus-within:ring-2 focus-within:ring-focus-ring/15 ${
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
          onFocus={() => setIsFocused(true)}
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
        <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-divider bg-bg-surface p-1 shadow-xl">
          {filteredSuggestions.map((suggestion) => (
            <li
              key={suggestion}
              className="cursor-pointer rounded-lg px-3 py-2 text-sm text-text-body transition-colors hover:bg-brand/10 hover:text-brand"
              onMouseDown={(e) => {
                e.preventDefault(); // Prevents input from losing focus
                addTag(suggestion);
              }}
            >
              {suggestion}
            </li>
          ))}
        </ul>
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
