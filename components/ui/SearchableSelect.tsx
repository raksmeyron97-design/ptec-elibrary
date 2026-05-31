"use client";

import { useState, useRef, useEffect } from "react";
import Icon from "./Icon";

interface SearchableSelectProps {
  name: string;
  options: string[];
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
}

export default function SearchableSelect({
  name,
  options,
  disabled = false,
  required = false,
  placeholder = "Select...",
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(options[0] || "");
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Update selected if options change and the current selected is not in the options
  useEffect(() => {
    if (options.length > 0 && !options.includes(selected)) {
      setSelected(options[0]);
    }
  }, [options, selected]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.addEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const filteredOptions = options.filter((option) =>
    option.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative w-full" ref={wrapperRef}>
      {/* Hidden input for form submission */}
      <input type="hidden" name={name} value={selected} required={required} />

      {/* Select Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex h-11 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-[#007c91] focus:ring-2 focus:ring-[#007c91]/15 disabled:bg-slate-50 disabled:opacity-60"
      >
        <span className={selected ? "text-slate-900" : "text-slate-400"}>
          {selected || placeholder}
        </span>
        <Icon
          name="chevron-right"
          className={`text-slate-400 transition-transform ${isOpen ? "rotate-90" : "rotate-0"}`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && !disabled && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          {/* Search Input */}
          <div className="relative mb-2">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search.."
              className="h-10 w-full rounded-md border border-slate-200 pl-9 pr-3 text-sm outline-none transition focus:border-[#007c91] focus:ring-2 focus:ring-[#007c91]/15"
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
                  className={`cursor-pointer rounded-md px-3 py-2 text-sm transition hover:bg-slate-50 ${
                    selected === option
                      ? "bg-slate-50 font-semibold text-[#007c91]"
                      : "text-slate-700"
                  }`}
                >
                  {option}
                </li>
              ))
            ) : (
              <li className="px-3 py-4 text-center text-sm text-slate-500">
                No results found.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
