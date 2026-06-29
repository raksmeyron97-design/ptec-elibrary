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
  const [markingAll, setMarkingAll] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchCount = useCallback(async () => {
    const count = await getUnreadCount();
    setUnreadCount(count);
  }, []);

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, POLL_MS);
    return () => clearInterval(interval);
  }, [fetchCount]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getNotifications().then(({ data }) => {
      setNotifications(data);
      setLoading(false);
    });
  }, [open]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  async function handleMarkAll() {
    if (markingAll) return;
    setMarkingAll(true);
    await markAllAsRead();
    setUnreadCount(0);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setMarkingAll(false);
  }

  function handleItemRead(id: string) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(c => Math.max(0, c - 1));
  }

  const badge = Math.min(unreadCount, 99);

  return (
    <div className="relative" ref={dropdownRef}>

      {/* ── Bell button ── */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label={t("bellLabel")}
        aria-expanded={open}
        className="relative text-text-muted transition-colors hover:text-brand focus:outline-none rounded-lg p-1 cursor-pointer"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-white font-bold ring-2 ring-white leading-none"
            style={{ fontSize: "10px", background: "#EF4444", padding: "0 3px" }}
          >
            {badge}
          </span>
        )}
      </button>

      {/* ── Dropdown panel ── */}
      <div
        className={`absolute right-0 top-[calc(100%+10px)] w-[340px] origin-top-right rounded-2xl border border-divider bg-bg-surface shadow-2xl z-[100] flex flex-col overflow-hidden transition-all duration-200 ${
          open
            ? "pointer-events-auto translate-y-0 opacity-100 scale-100"
            : "pointer-events-none -translate-y-2 opacity-0 scale-95"
        }`}
        style={{ boxShadow: "0 16px 48px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)" }}
      >

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-divider shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-text-heading">{t("title")}</span>
            {unreadCount > 0 && (
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold text-white leading-none"
                style={{ background: "#EF4444" }}
              >
                {badge}
              </span>
            )}
          </div>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAll}
              disabled={markingAll}
              className="flex items-center gap-1.5 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
              style={{ color: "#4f46e5" }}
            >
              {markingAll ? (
                <span className="w-3.5 h-3.5 rounded-full border-2 border-indigo-300 border-t-indigo-600 animate-spin" />
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                  <path d="m4 12 5 5L20 6" />
                </svg>
              )}
              {t("markAllRead")}
            </button>
          )}
        </div>

        {/* Notification list */}
        <div className="flex-1 overflow-y-auto" style={{ maxHeight: "380px" }}>
          {loading ? (
            <div className="flex items-center justify-center py-14">
              <div className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-indigo-500 animate-spin" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 gap-2">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: "rgba(79,70,229,0.08)" }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-text-heading mt-1">{t("empty")}</p>
              <p className="text-xs text-slate-400">You&apos;re all caught up</p>
            </div>
          ) : (
            notifications.map(n => (
              <NotificationItem
                key={n.id}
                notification={n}
                onRead={handleItemRead}
                onClose={() => setOpen(false)}
              />
            ))
          )}
        </div>

        {/* Footer */}
        {userRole === "admin" && (
          <div className="border-t border-divider px-4 py-2.5 shrink-0 flex items-center justify-between">
            <a
              href="/admin/announcements"
              className="text-xs font-semibold transition-colors hover:underline cursor-pointer"
              style={{ color: "#4f46e5" }}
              onClick={() => setOpen(false)}
            >
              {t("manageAnnouncements")}
            </a>
            <a
              href="/admin/logs"
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              onClick={() => setOpen(false)}
            >
              View logs →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
