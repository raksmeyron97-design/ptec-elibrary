import Link from "next/link";
import { CheckCircle2, type LucideIcon } from "lucide-react";
import type { AttentionStatus } from "@/lib/admin/dashboard";

const STATUS_STYLE: Record<
  AttentionStatus,
  { border: string; hoverBg: string; badge: string; iconColor: string }
> = {
  success: {
    border: "border-divider",
    hoverBg: "hover:bg-emerald-50/60 hover:border-emerald-200",
    badge: "bg-emerald-100 text-emerald-800",
    iconColor: "text-emerald-600",
  },
  warning: {
    border: "border-amber-200",
    hoverBg: "hover:bg-amber-50",
    badge: "bg-amber-100 text-amber-800",
    iconColor: "text-amber-600",
  },
  danger: {
    border: "border-red-200",
    hoverBg: "hover:bg-red-50",
    badge: "bg-red-100 text-red-700",
    iconColor: "text-red-600",
  },
  neutral: {
    border: "border-divider",
    hoverBg: "hover:bg-bg-app",
    badge: "bg-slate-200/70 text-slate-700",
    iconColor: "text-slate-500",
  },
};

/**
 * One actionable item in the "Needs attention" strip. Status is conveyed by
 * badge text + description, not color alone.
 */
export default function AttentionCard({
  title,
  count,
  status,
  description,
  href,
  icon: Icon,
}: {
  title: string;
  count?: number;
  status: AttentionStatus;
  description: string;
  href: string;
  icon: LucideIcon;
}) {
  const s = STATUS_STYLE[status];
  const showCheck = status === "success" && (count ?? 0) === 0;

  return (
    <Link
      href={href}
      className={`group flex flex-col gap-2 rounded-xl border bg-paper px-4 py-3.5 transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${s.border} ${s.hoverBg}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-text-body">
          <Icon className={`h-4 w-4 shrink-0 ${s.iconColor}`} aria-hidden="true" />
          <span className="truncate">{title}</span>
        </span>
        {showCheck ? (
          <CheckCircle2 className="h-4.5 w-4.5 shrink-0 text-emerald-500" aria-label="All clear" />
        ) : (
          <span className={`shrink-0 rounded-lg px-2 py-0.5 text-sm font-bold tabular-nums ${s.badge}`}>
            {(count ?? 0).toLocaleString("en-US")}
          </span>
        )}
      </div>
      <p className="text-xs leading-relaxed text-text-muted">{description}</p>
    </Link>
  );
}
