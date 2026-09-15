"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, X, Loader2, RotateCcw, ChevronDown } from "lucide-react";
import type { PathLevelFilter, PathSortOption } from "@/lib/learning-paths/filter";
import { VALID_LEVELS, VALID_SORTS } from "@/lib/learning-paths/filter";

interface PathsFilterBarProps {
  currentLevel: PathLevelFilter;
  currentQuery: string;
  currentSort: PathSortOption;
  totalCount: number;
  filteredCount: number;
}

export default function PathsFilterBar({
  currentLevel,
  currentQuery,
  currentSort,
  totalCount,
  filteredCount,
}: PathsFilterBarProps) {
  const t = useTranslations("paths");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [query, setQuery] = useState(currentQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync internal search input state if external search param changed
  useEffect(() => {
    setQuery(currentQuery);
  }, [currentQuery]);

  // Global keyboard shortcut: "/" or "Cmd/Ctrl+K" focuses search input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Update URL helper
  const navigateParams = (
    updater: (params: URLSearchParams) => void,
    replace = false,
  ) => {
    const next = new URLSearchParams(searchParams.toString());
    updater(next);
    const queryString = next.toString();
    const targetUrl = queryString ? `${pathname}?${queryString}` : pathname;
    startTransition(() => {
      if (replace) {
        router.replace(targetUrl, { scroll: false });
      } else {
        router.push(targetUrl, { scroll: false });
      }
    });
  };

  // Debounced search query
  useEffect(() => {
    if (query === currentQuery) return;
    const timer = setTimeout(() => {
      navigateParams((params) => {
        if (query.trim()) {
          params.set("q", query.trim());
        } else {
          params.delete("q");
        }
      }, true);
    }, 250);

    return () => clearTimeout(timer);
  }, [query, currentQuery]);

  const handleLevelSelect = (level: PathLevelFilter) => {
    navigateParams((params) => {
      if (level === "all") {
        params.delete("level");
      } else {
        params.set("level", level);
      }
    });
  };

  const handleSortChange = (sort: PathSortOption) => {
    navigateParams((params) => {
      if (sort === "popular") {
        params.delete("sort");
      } else {
        params.set("sort", sort);
      }
    });
  };

  const handleClearSearch = () => {
    setQuery("");
    inputRef.current?.focus();
    navigateParams((params) => {
      params.delete("q");
    }, true);
  };

  const handleResetFilters = () => {
    setQuery("");
    startTransition(() => {
      router.push(pathname, { scroll: false });
    });
  };

  const hasActiveFilters = currentLevel !== "all" || currentQuery !== "" || currentSort !== "popular";

  return (
    <div className="mb-6 space-y-4">
      {/* Top Filter Bar Controls */}
      <div className="flex flex-col gap-3 rounded-2xl border border-divider bg-bg-surface p-3 shadow-sm md:flex-row md:items-center md:justify-between">
        {/* Search Field */}
        <div className="focus-shell relative flex-1 rounded-xl border border-divider bg-bg-body">
          <label htmlFor="paths-search-input" className="sr-only">
            {t("searchLabel")}
          </label>
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            id="paths-search-input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            autoComplete="off"
            className="min-h-11 w-full bg-transparent py-2.5 pl-10 pr-16 text-[15px] text-text-heading placeholder:text-text-muted sm:text-[14px]"
          />
          <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
            {isPending && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-text-muted" aria-hidden="true" />
            )}
            {query ? (
              <button
                type="button"
                onClick={handleClearSearch}
                aria-label={t("clearSearch")}
                className="focus-field flex h-6 w-6 items-center justify-center rounded-full text-text-muted hover:bg-paper hover:text-text-heading"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              <kbd
                aria-hidden="true"
                className="hidden rounded border border-divider bg-paper px-1.5 py-0.5 text-[10px] font-bold text-text-muted sm:inline-block"
              >
                /
              </kbd>
            )}
          </div>
        </div>

        {/* Sort Select */}
        <div className="relative shrink-0">
          <label htmlFor="paths-sort-select" className="sr-only">
            {t("sortLabel")}
          </label>
          <select
            id="paths-sort-select"
            value={currentSort}
            onChange={(e) => handleSortChange(e.target.value as PathSortOption)}
            className="focus-field h-11 w-full cursor-pointer appearance-none rounded-xl border border-divider bg-bg-body pl-3.5 pr-9 text-[13px] font-semibold text-text-heading hover:border-brand/40 sm:w-auto"
          >
            {VALID_SORTS.map((opt) => (
              <option key={opt} value={opt}>
                {t("sortLabel")}: {t(`sort.${opt}`)}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
        </div>
      </div>

      {/* Level Filter Pills & Reset Action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="radiogroup"
          aria-label={t("filterLevel")}
          className="flex flex-wrap items-center gap-1.5"
        >
          {VALID_LEVELS.map((level) => {
            const isSelected = currentLevel === level;
            const label = level === "all" ? t("levelAll") : t(`difficulty.${level}`);
            return (
              <button
                key={level}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => handleLevelSelect(level)}
                className={`focus-field rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-150 ${
                  isSelected
                    ? "bg-brand text-brand-contrast shadow-sm"
                    : "border border-divider bg-bg-surface text-text-muted hover:border-brand/40 hover:text-text-heading"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Result summary and Reset Button */}
        <div className="flex items-center gap-3 text-xs font-medium text-text-muted">
          <span>
            {t("resultCount", { filtered: filteredCount, total: totalCount })}
          </span>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="focus-field inline-flex items-center gap-1 font-semibold text-brand hover:underline"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              {t("resetFilters")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
