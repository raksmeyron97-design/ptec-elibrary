"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { markAsRead } from "@/app/actions/notifications";
import type { Notification } from "@/app/actions/notifications";

// ── Type metadata ─────────────────────────────────────────────────────────────

const TYPE_META: Record<
  string,
  { label: string; bg: string; color: string; icon: React.ReactNode }
> = {
  new_user: {
    label: "New User",
    bg: "rgba(79,70,229,0.10)",
    color: "#4f46e5",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  new_book: {
    label: "New Book",
    bg: "rgba(16,185,129,0.10)",
    color: "#059669",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    ),
  },
  new_report: {
    label: "Report",
    bg: "rgba(245,158,11,0.10)",
    color: "#D97706",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
  announcement: {
    label: "Announcement",
    bg: "rgba(239,68,68,0.10)",
    color: "#DC2626",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
  },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  notification: Notification;
  onRead: (id: string) => void;
  onClose: () => void;
};

export default function NotificationItem({ notification: n, onRead, onClose }: Props) {
  const router = useRouter();
  const locale = useLocale();
  const [marking, setMarking] = useState(false);

  const meta = TYPE_META[n.type] ?? TYPE_META.announcement;
  const title = locale === "km" && n.title_km ? n.title_km : n.title_en;
  const body  = locale === "km" && n.body_km  ? n.body_km  : n.body_en;

  async function handleClick() {
    if (!n.is_read && !marking) {
      setMarking(true);
      onRead(n.id);
      await markAsRead(n.id);
    }
    if (n.link) {
      router.push(n.link);
      onClose();
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="group w-full flex items-start gap-3 px-4 py-3.5 text-left transition-colors duration-150 cursor-pointer border-b border-divider last:border-0"
      style={{
        background: n.is_read ? "transparent" : "rgba(79,70,229,0.03)",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.035)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.background = n.is_read ? "transparent" : "rgba(79,70,229,0.03)";
      }}
    >
      {/* Type icon */}
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 transition-transform duration-150 group-hover:scale-105"
        style={{ background: meta.bg, color: meta.color }}
      >
        {meta.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Type badge + timestamp row */}
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span
            className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none"
            style={{ background: meta.bg, color: meta.color }}
          >
            {meta.label}
          </span>
          <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">
            {timeAgo(n.created_at)}
          </span>
        </div>

        {/* Title */}
        <p
          className="text-sm leading-snug truncate"
          style={{
            color: n.is_read ? "#64748B" : "#0F172A",
            fontWeight: n.is_read ? 400 : 600,
          }}
        >
          {title}
        </p>

        {/* Body */}
        {body && (
          <p className="mt-0.5 text-xs text-slate-400 line-clamp-2 leading-relaxed">
            {body}
          </p>
        )}

        {/* View link hint */}
        {n.link && (
          <div
            className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity duration-150"
            style={{ color: "#4f46e5" }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            View
          </div>
        )}
      </div>

      {/* Unread dot */}
      {!n.is_read && (
        <span
          className="w-2 h-2 rounded-full shrink-0 mt-2"
          style={{ background: "#4f46e5" }}
        />
      )}
    </button>
  );
}
