"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Plus, Search, X } from "lucide-react";
import { withUpdatedParams } from "@/lib/admin/ebooks-url";

/**
 * The command bar: search, filters, and the one primary action, in a single
 * 40px-tall row, with the result count and the active filter chips on a
 * quieter second line.
 *
 * `filters` and `chips` arrive as slots rather than being rendered here so
 * the filter state stays in EbookFilters — this component owns the shell and
 * the search box only.
 */
export default function EbookToolbar({
  totalItems,
  filters,
  chips,
}: {
  totalItems: number;
  filters?: React.ReactNode;
  chips?: React.ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("adminEbooks.toolbar");
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  // Debounce: push the URL 350ms after the user stops typing.
  useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (query === current) return;
    const timer = setTimeout(() => {
      router.push(withUpdatedParams(searchParams, { q: query || null }));
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="rounded-xl border border-divider bg-bg-surface p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div className="focus-shell flex h-10 w-full min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-divider bg-bg-surface px-3 sm:w-auto sm:max-w-[480px]">
          <Search className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
          <label htmlFor="ebook-search" className="sr-only">
            {t("searchLabel")}
          </label>
          <input
            id="ebook-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-full flex-1 bg-transparent text-sm text-text-heading placeholder-text-muted outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("clearSearch")}
              className="shrink-0 rounded p-0.5 text-text-muted transition-colors hover:text-text-body"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {filters}

        <Link
          href="/admin/upload"
          className="ml-auto inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-medium text-brand-contrast shadow-sm transition duration-150 hover:-translate-y-px hover:bg-brand-hover hover:shadow-md active:translate-y-0 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("upload")}
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-divider pt-3">
        <p className="text-sm tabular-nums text-text-muted" aria-live="polite">
          {t("showing", { count: totalItems })}
        </p>
        {chips}
      </div>
    </div>
  );
}
