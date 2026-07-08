import type { LucideIcon } from "lucide-react";

/**
 * Card shell for every analytics block: header (icon, title, subtitle,
 * period value) plus loading / error / empty / normal body states and an
 * optional screen-reader summary of the plotted data.
 */
export default function ChartCard({
  icon: Icon,
  title,
  subtitle,
  value,
  valueLabel,
  accent = "var(--ptec-brand)",
  isLoading = false,
  error,
  empty = false,
  emptyText = "No data yet for this period.",
  srSummary,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  value?: string | number;
  valueLabel?: string;
  accent?: string;
  isLoading?: boolean;
  error?: string;
  empty?: boolean;
  emptyText?: string;
  srSummary?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-2xl bg-bg-surface p-5 shadow-sm sm:p-6"
      style={{ border: "1px solid var(--ptec-divider)" }}
      aria-label={title}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{ background: `color-mix(in srgb, ${accent} 12%, transparent)` }}
            aria-hidden="true"
          >
            <Icon className="h-4 w-4" style={{ color: accent }} />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-text-heading">{title}</h2>
            {subtitle && <p className="text-xs text-text-muted">{subtitle}</p>}
          </div>
        </div>
        {value !== undefined && (
          <div className="shrink-0 text-right">
            <div className="text-xl font-bold tabular-nums leading-none sm:text-2xl" style={{ color: accent }}>
              {value}
            </div>
            {valueLabel && <div className="mt-1 text-xs text-text-muted">{valueLabel}</div>}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="skeleton h-[220px] w-full rounded-xl" aria-hidden="true" />
      ) : error ? (
        <div className="flex h-[180px] flex-col items-center justify-center gap-1 text-center">
          <p className="text-sm font-medium text-text-body">Could not load analytics.</p>
          <p className="text-xs text-text-muted">{error}</p>
        </div>
      ) : empty ? (
        <div className="flex h-[180px] items-center justify-center">
          <p className="text-sm text-text-muted">{emptyText}</p>
        </div>
      ) : (
        <>
          {srSummary && <p className="sr-only">{srSummary}</p>}
          {children}
        </>
      )}
    </section>
  );
}
