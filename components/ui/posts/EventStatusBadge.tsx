import type { EventStatus } from "@/lib/posts/event-status";
import { EVENT_STATUS_STYLE } from "./postStyles";

/**
 * Presentational event-status badge. Pure — the caller supplies the localized
 * `label`, so it works in both server and client trees. Status is shown with a
 * coloured dot AND the text label (never colour alone), satisfying WCAG 1.4.1.
 */
export default function EventStatusBadge({
  status,
  label,
  className = "",
}: {
  status: EventStatus;
  label: string;
  className?: string;
}) {
  const style = EVENT_STATUS_STYLE[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${style.badge} ${className}`}
    >
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        {style.pulse && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${style.dot} motion-reduce:hidden`}
          />
        )}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${style.dot}`} />
      </span>
      {label}
    </span>
  );
}
