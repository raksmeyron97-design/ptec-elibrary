/**
 * One named group of related fields.
 *
 * A section is a question the user can answer — "Basic info", "Files" — not a
 * database table. Three to eight fields; a one-line explanation only when the
 * title does not already carry it. Server-component safe.
 */
export default function FormSection({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Right-aligned affordance on the heading row — "Add author", a toggle. */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-divider bg-bg-surface p-5 sm:p-6 ${className}`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-text-heading">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-text-muted">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
