"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  getNotifications,
  getUnreadCount,
  markAllAsRead,
} from "@/app/actions/notifications";
import NotificationItem from "./NotificationItem";
import type { Notification } from "@/app/actions/notifications";

type Props = {
  userId: string;
  userRole: "reader" | "admin";
};

const POLL_MS = 60_000;

export default function NotificationBell({ userRole }: Props) {
  const t = useTranslations("notifications");
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Lightweight count poll
  const fetchCount = useCallback(async () => {
    const count = await getUnreadCount();
    setUnreadCount(count);
  }, []);

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, POLL_MS);
    return () => clearInterval(interval);
  }, [fetchCount]);

  // Full list — only when dropdown opens
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getNotifications().then(({ data }) => {
      setNotifications(data);
      setLoading(false);
    });
  }, [open]);

  // Outside-click close
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Escape key close
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  async function handleMarkAll() {
    await markAllAsRead();
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  function handleItemRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={t("bellLabel")}
        aria-expanded={open}
        className="relative text-text-muted transition-colors hover:text-brand focus:outline-none rounded-lg p-1"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      <div
        className={`absolute right-0 top-[calc(100%+10px)] w-80 origin-top-right rounded-xl border border-divider bg-bg-surface shadow-xl ring-1 ring-black/5 transition-all duration-200 z-50 ${
          open
            ? "pointer-events-auto translate-y-0 opacity-100 scale-100"
            : "pointer-events-none -translate-y-2 opacity-0 scale-95"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-divider px-4 py-3">
          <span className="text-sm font-semibold text-text-heading">{t("title")}</span>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAll}
              className="text-xs text-brand hover:underline"
            >
              {t("markAllRead")}
            </button>
          )}
        </div>

        {/* Notification list */}
        <div className="max-h-[360px] overflow-y-auto divide-y divide-divider">
          {loading ? (
            <p className="py-8 text-center text-sm text-text-muted">{t("loading")}</p>
          ) : notifications.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-muted">{t("empty")}</p>
          ) : (
            notifications.map((n) => (
              <NotificationItem
                key={n.id}
                notification={n}
                onRead={handleItemRead}
                onClose={() => setOpen(false)}
              />
            ))
          )}
        </div>

        {/* Admin footer link */}
        {userRole === "admin" && (
          <div className="border-t border-divider px-4 py-2.5">
            <a
              href="/admin/announcements"
              className="text-xs text-brand hover:underline"
              onClick={() => setOpen(false)}
            >
              {t("manageAnnouncements")}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
