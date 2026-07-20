"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { FilterLink } from "@/components/ui/books/ClientNavWrapper";
import type { PostCategory } from "@/lib/admin/posts-shared";

/**
 * Horizontally-scrollable category chips. Rendered as real <a href> links
 * (FilterLink) so they are crawlable and keyboard-operable; the click handler
 * enhances them with client-side navigation. The active chip carries
 * aria-current and a filled style, so selection is conveyed by more than colour.
 */
export default function CategoryFilters({
  basePath,
  activeCategory,
  categories,
  totalCount,
}: {
  basePath: string;
  activeCategory?: string;
  categories: { key: PostCategory; count: number }[];
  totalCount: number;
}) {
  const t = useTranslations("posts");
  const searchParams = useSearchParams();

  function hrefFor(category: string | null): string {
    const p = new URLSearchParams(searchParams.toString());
    if (category) p.set("category", category);
    else p.delete("category");
    p.delete("page");
    const qs = p.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  }

  const chips: { key: string; label: string; count: number }[] = [
    { key: "All", label: t("categoryAll"), count: totalCount },
    ...categories.map((c) => ({
      key: c.key,
      label: t(`category${c.key}` as never),
      count: c.count,
    })),
  ];

  const active = activeCategory && activeCategory !== "All" ? activeCategory : "All";

  return (
    <nav aria-label={t("categoriesTitle")} className="w-full">
      <ul className="flex list-none items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {chips.map((chip) => {
          const isActive = chip.key === active;
          return (
            <li key={chip.key} className="shrink-0">
              <FilterLink
                href={hrefFor(chip.key === "All" ? null : chip.key)}
                aria-current={isActive ? "true" : undefined}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-4 py-1.5 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-app ${
                  isActive
                    ? "border-brand bg-brand text-brand-contrast shadow-sm shadow-brand/20"
                    : "border-divider bg-bg-surface text-text-body hover:border-brand/30 hover:bg-brand/5 hover:text-brand"
                }`}
              >
                {chip.label}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none tabular-nums ${
                    isActive ? "bg-white/20 text-brand-contrast" : "bg-paper text-text-muted"
                  }`}
                >
                  {chip.count}
                </span>
              </FilterLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
