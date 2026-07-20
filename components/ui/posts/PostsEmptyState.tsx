"use client";

import { useTranslations } from "next-intl";
import { FilterLink } from "@/components/ui/books/ClientNavWrapper";
import { SearchIcon } from "./icons";

/**
 * Empty state for the results grid. Two shapes:
 *  - `filtered` (a search/filter is active) → explains nothing matched, echoes
 *    the query, and offers "Clear all filters".
 *  - otherwise (a genuinely empty system) → a reassuring "check back soon".
 */
export default function PostsEmptyState({
  basePath,
  filtered,
  query,
}: {
  basePath: string;
  filtered: boolean;
  query?: string;
}) {
  const t = useTranslations("posts");

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-divider bg-bg-surface px-6 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-paper text-text-muted">
        <SearchIcon className="h-6 w-6" />
      </div>
      <h2 className="m-0 font-khmer-serif text-lg font-bold text-text-heading">
        {filtered ? t("noResults") : t("noPostsFound")}
      </h2>
      <p className="mt-1.5 max-w-sm text-sm text-text-muted">
        {filtered
          ? query
            ? t("noResultsForQuery", { query })
            : t("emptyHintSearch")
          : t("emptyHintEmpty")}
      </p>
      {filtered && (
        <FilterLink
          href={basePath}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-contrast transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
        >
          {t("clearAll")}
        </FilterLink>
      )}
    </div>
  );
}
