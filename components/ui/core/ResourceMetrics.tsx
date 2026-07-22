// components/ui/core/ResourceMetrics.tsx
//
// The single renderer for reader-activity counts (views, downloads) on every
// public surface: book cards, thesis cards and list rows, publication cards,
// and the homepage trending list.
//
// No "use client": `useTranslations` is isomorphic in next-intl v4, so this
// renders inside Server Components (ThesisCard, PublicationCard) and gets
// bundled along with Client Component parents (BookCard) without a second
// variant. Any new call site must add "metrics" to PUBLIC_NAMESPACES.
//
// Two rules this component exists to enforce:
//   1. A zero is never rendered. On a young collection, "0 views · 0 downloads"
//      repeats "nobody has been here" across the whole grid — that is anti-proof,
//      not information. A metric at zero is omitted; all-zero renders nothing.
//   2. A bare digit is never the whole story for assistive tech. The compact
//      figure ("1.2K") is shown to sighted users and hidden from AT, while the
//      full localized phrase ("1200 views") is read out instead.

import { Eye, Download } from "lucide-react";
import { useTranslations } from "next-intl";

/** 1_200 → "1.2K". Display only — AT always receives the exact count. */
function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const SIZES = {
  xs: { text: "text-[10px]", icon: "h-3 w-3", gap: "gap-2.5" },
  sm: { text: "text-[11px]", icon: "h-[13px] w-[13px]", gap: "gap-3" },
  md: { text: "text-[12px]", icon: "h-3.5 w-3.5", gap: "gap-4" },
} as const;

export type ResourceMetricsProps = {
  views?: number | null;
  downloads?: number | null;
  size?: keyof typeof SIZES;
  /** Extra classes on the wrapper — use for colour/spacing, not layout. */
  className?: string;
};

export default function ResourceMetrics({
  views,
  downloads,
  size = "sm",
  className = "",
}: ResourceMetricsProps) {
  const t = useTranslations("metrics");
  const s = SIZES[size];

  const items: { key: string; icon: typeof Eye; value: number; label: string }[] = [];
  if ((views ?? 0) > 0) {
    items.push({ key: "views", icon: Eye, value: views!, label: t("views", { count: views! }) });
  }
  if ((downloads ?? 0) > 0) {
    items.push({
      key: "downloads",
      icon: Download,
      value: downloads!,
      label: t("downloads", { count: downloads! }),
    });
  }

  // Every metric is zero — render nothing rather than an empty row that still
  // occupies vertical rhythm in the card footer.
  if (items.length === 0) return null;

  return (
    <div className={`flex items-center ${s.gap} ${s.text} text-text-muted ${className}`}>
      {items.map(({ key, icon: MetricIcon, value, label }) => (
        // title = pointer tooltip; sr-only span = the accessible text. An
        // aria-label on a bare <span> has no role to attach to and is dropped
        // by some screen readers, so the label is real hidden text instead.
        <span key={key} className="inline-flex items-center gap-1 tabular-nums" title={label}>
          <MetricIcon className={`${s.icon} shrink-0`} aria-hidden="true" />
          <span aria-hidden="true">{compact(value)}</span>
          <span className="sr-only">{label}</span>
        </span>
      ))}
    </div>
  );
}
