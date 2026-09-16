/**
 * Shared empty/no-results surface (dashed frame, icon well, optional action)
 * — the pattern previously copy-pasted per section (e-books, users, posts,
 * theses). Server-component safe; pass any lucide icon element and, when
 * useful, a Link/button as `action`.
 */
export default function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-divider bg-bg-surface px-6 py-16 text-center ${className}`}
    >
      {icon && (
        <span
          className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-divider bg-paper text-text-muted"
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      {/* `div`, not `p`: both slots are typed React.ReactNode, and a paragraph
          auto-closes around any block element a caller passes — the parser
          re-parents the rest and hydration fails against the server render.
          Pinned by components/admin/dashboard/markup-nesting.test.ts. */}
      <div className="text-base font-bold text-text-heading">{title}</div>
      {description && <div className="mt-1.5 max-w-sm text-sm text-text-muted">{description}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
