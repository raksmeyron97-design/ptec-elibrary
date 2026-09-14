import React from "react";

export type ResourceKind = "ebook" | "thesis" | "publication" | "catalog" | "book";

export interface ResourceTypeBadgeProps {
  type: ResourceKind;
  label: string;
  className?: string;
}

const TYPE_STYLES: Record<ResourceKind, string> = {
  ebook: "border-sky-500/25 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:border-sky-800/60 dark:text-sky-300",
  book: "border-sky-500/25 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:border-sky-800/60 dark:text-sky-300",
  thesis: "border-purple-500/25 bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:border-purple-800/60 dark:text-purple-300",
  publication: "border-indigo-500/25 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:border-indigo-800/60 dark:text-indigo-300",
  catalog: "border-amber-600/25 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:border-amber-800/60 dark:text-amber-300",
};

/**
 * Compact academic catalogue badge for resource types.
 */
export default function ResourceTypeBadge({
  type,
  label,
  className = "",
}: ResourceTypeBadgeProps) {
  const style = TYPE_STYLES[type] ?? "border-divider bg-bg-surface text-text-muted";

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em] ${style} ${className}`}
    >
      {label}
    </span>
  );
}
