export type StatusTone = "success" | "warning" | "danger" | "info" | "brand" | "neutral";

const TONES: Record<StatusTone, string> = {
  success: "bg-success/10 text-success ring-success/25",
  warning: "bg-warning/10 text-warning ring-warning/25",
  danger: "bg-danger/10 text-danger ring-danger/25",
  info: "bg-info/10 text-info ring-info/25",
  brand: "bg-brand/10 text-brand ring-brand/25",
  neutral: "bg-paper text-text-muted ring-divider",
};

/**
 * Small status pill on the semantic token palette (every tone clears WCAG AA
 * on its tinted background in the light admin theme). Status must never be
 * conveyed by colour alone — the label text carries the meaning.
 */
export default function StatusBadge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
