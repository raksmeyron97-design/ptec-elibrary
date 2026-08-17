/**
 * Canonical page heading for admin sections: an optional breadcrumb trail,
 * one h1 per page, an optional supporting line, and a right-aligned actions
 * slot. Server-component safe.
 */
export default function PageHeader({
  breadcrumb,
  title,
  description,
  actions,
  className = "",
}: {
  /** Rendered above the title — pass a <Breadcrumb /> or any nav element. */
  breadcrumb?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3 ${className}`}>
      <div className="min-w-0">
        {breadcrumb && <div className="mb-3">{breadcrumb}</div>}
        <h1 className="mb-1 text-2xl font-semibold tracking-tight text-text-heading">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
