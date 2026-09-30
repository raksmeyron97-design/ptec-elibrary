import type { ReactNode } from "react";

/**
 * The Overview's panel shell: a titled header over a hairline, then the data.
 *
 * Every library-facing panel on the Overview (recently added, reader
 * requests, the shelf, the calendar, the reading rhythm) shares it, so the
 * page reads as one set of panels rather than five cards each inventing its
 * own header. Presentational only — it renders in a server or client tree.
 */
export default function DashPanel({
  id,
  title,
  subtitle,
  action,
  icon,
  children,
  className = "",
  bodyClassName = "dash-panel-body",
}: {
  /** Prefix for the heading id the section is labelled by. */
  id: string;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right-hand header control — a link or button, never a second heading. */
  action?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const headingId = `${id}-heading`;
  return (
    <section aria-labelledby={headingId} className={`dash-card flex min-w-0 flex-col ${className}`}>
      <header className="dash-panel-head">
        {icon}
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="text-sm font-bold leading-5 text-text-heading">
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-xs leading-[18px] text-text-muted">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className={`min-w-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
