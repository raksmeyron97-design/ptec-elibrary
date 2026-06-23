"use client";

import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { markAsRead } from "@/app/actions/notifications";
import type { Notification } from "@/app/actions/notifications";

const TYPE_COLOR: Record<string, string> = {
  new_user:     "bg-brand/10 text-brand",
  new_book:     "bg-success/10 text-success",
  new_report:   "bg-warning/10 text-warning",
  announcement: "bg-accent/10 text-accent",
};

function NotifIcon({ type }: { type: string }) {
  if (type === "new_user")
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
      </svg>
    );
  if (type === "new_book")
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    );
  if (type === "new_report")
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
      </svg>
    );
  // announcement
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

type Props = {
  notification: Notification;
  onRead: (id: string) => void;
  onClose: () => void;
};

export default function NotificationItem({ notification: n, onRead, onClose }: Props) {
  const router = useRouter();
  const locale = useLocale();
  const title = locale === "km" && n.title_km ? n.title_km : n.title_en;
  const body  = locale === "km" && n.body_km  ? n.body_km  : n.body_en;

  async function handleClick() {
    if (!n.is_read) {
      onRead(n.id);
      await markAsRead(n.id);
    }
    if (n.link) {
      router.push(n.link);
      onClose();
    }
  }

  return (
    <button type="button" onClick={handleClick} className="flex w-full items-start gap-3 text-left">
      <span
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          TYPE_COLOR[n.type] ?? "bg-bg-muted text-text-muted"
        }`}
      >
        <NotifIcon type={n.type} />
      </span>

      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug text-text-body ${!n.is_read ? "font-semibold" : ""}`}>
          {title}
        </p>
        {body && (
          <p className="mt-0.5 text-xs text-text-muted line-clamp-2">{body}</p>
        )}
        <p className="mt-1 text-[11px] text-text-muted">{timeAgo(n.created_at)}</p>
      </div>

      {!n.is_read && (
        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand" />
      )}
    </button>
  );
}
