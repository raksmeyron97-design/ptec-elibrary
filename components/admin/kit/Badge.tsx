import type { LucideIcon } from "lucide-react";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";

/**
 * The one badge shape for admin tables and cards.
 *
 * Admin surfaces had drifted into two shapes (`rounded-full` pills and
 * `rounded-md` chips) over hand-written `bg-emerald-50 text-emerald-700
 * border-emerald-200` triplets, so the same meaning looked different per
 * column. Tone is the only knob here, and every tone resolves through the
 * `--ptec-{success,warning,danger,info}-{soft,line,text}` tokens — which
 * means no call site ever needs a `dark:` variant.
 *
 * Colour is never the only signal: the label text always carries the meaning.
 * Server-component safe.
 */
const TONES: Record<BadgeTone, string> = {
  neutral: "border-divider bg-paper text-text-body",
  success: "border-success-line bg-success-soft text-success-text",
  warning: "border-warning-line bg-warning-soft text-warning-text",
  danger: "border-danger-line bg-danger-soft text-danger-text",
  info: "border-info-line bg-info-soft text-info-text",
  brand: "border-surface-brand-line bg-surface-brand-soft text-brand",
};

export default function Badge({
  tone = "neutral",
  icon: Icon,
  title,
  children,
  className = "",
}: {
  tone?: BadgeTone;
  /** Optional leading lucide icon, rendered decoratively at 12px. */
  icon?: LucideIcon;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium leading-5 ${TONES[tone]} ${className}`}
    >
      {Icon && <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />}
      <span className="truncate">{children}</span>
    </span>
  );
}
