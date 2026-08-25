import type { LucideIcon } from "lucide-react";

/**
 * Empty state for a region *inside* a form panel — an author list with no
 * authors, a curriculum with no modules.
 *
 * Distinct from `components/admin/kit/EmptyState`, which frames a whole page at
 * `py-16`: that height inside a tab pushes the fields below it off the screen,
 * so this runs at `py-8` and carries no page-level weight. It replaces the
 * one-line dashed paragraphs each form had grown independently, which stated the
 * fact ("No authors yet") but not the move — an author reading "No modules yet"
 * still had to hunt for the button that fixes it.
 *
 * `action` is where that button goes. Server-component safe.
 */
export default function FieldEmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  /** One line on what this region is for, or what to do first. */
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-divider bg-paper/40 px-6 py-8 text-center">
      <span
        className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-divider bg-bg-surface text-text-muted"
        aria-hidden="true"
      >
        <Icon className="h-5 w-5" />
      </span>
      <p className="text-sm font-semibold text-text-heading">{title}</p>
      {description && <p className="mt-1 max-w-xs text-xs leading-[1.6] text-text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
