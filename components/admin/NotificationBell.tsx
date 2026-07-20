"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { Bell, X, CheckCheck, BookOpen, Users, FileText, Megaphone, ExternalLink } from "lucide-react";
import { getNotifications, getUnreadCount, markAsRead, markAllAsRead } from "@/app/actions/notifications";
import type { Notification } from "@/app/actions/notifications";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

const TYPE_META = {
  new_user:     { icon: Users,     bg: "rgba(79,70,229,0.10)",  color: "#4f46e5" },
  new_book:     { icon: BookOpen,  bg: "rgba(16,185,129,0.10)", color: "#059669" },
  new_report:   { icon: FileText,  bg: "rgba(245,158,11,0.10)", color: "#D97706" },
  announcement: { icon: Megaphone, bg: "rgba(239,68,68,0.10)",  color: "#DC2626" },
} as const;

type BellT = (key: string, values?: Record<string, string | number>) => string;

function timeAgo(dateStr: string, t: BellT): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return t("justNow");
  if (mins < 60) return t("minutesAgo", { count: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t("hoursAgo", { count: hrs });
  return t("daysAgo", { count: Math.floor(hrs / 24) });
}

export default function NotificationBell() {
  const router = useRouter();
  const t = useTranslations("adminShell.bell");
  const locale = useLocale();
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();

  // Poll unread count every 60 s
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const count = await getUnreadCount();
      if (!cancelled) setUnreadCount(count);
    };
    poll();
    const id = setInterval(poll, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Fetch full list when panel opens
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getNotifications().then(({ data }) => {
      setNotifications(data);
      setLoading(false);
    });
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  function handleMarkAll() {
    startTransition(async () => {
      await markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    });
  }

  function handleClick(n: Notification) {
    if (!n.is_read) {
      startTransition(async () => {
        await markAsRead(n.id);
        setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x));
        setUnreadCount(prev => Math.max(0, prev - 1));
      });
    }
    if (n.link) { router.push(n.link); setOpen(false); }
  }

  const badge = Math.min(unreadCount, 99);

  return (
    <div ref={panelRef} className="relative">
      {/* ── Bell button ── */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label={unreadCount > 0 ? t("unreadLabel", { count: unreadCount }) : t("label")}
        aria-expanded={open}
        className="relative w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-200 hover:bg-slate-100"
        style={{ color: "#64748B" }}
      >
        <Bell style={{ width: "18px", height: "18px" }} />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-white ring-2 ring-white font-bold leading-none"
            style={{ fontSize: "10px", background: "#EF4444", padding: "0 3px" }}
          >
            {badge}
          </span>
        )}
      </button>

      {/* ── Panel ── */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div
            className="fixed right-4 z-50 w-[360px] rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
            style={{
              top: "72px",
              maxHeight: "calc(100vh - 90px)",
              background: "var(--color-bg-surface, #fff)",
              borderColor: "var(--color-divider, #E2E8F0)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-divider shrink-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-text-heading">{t("label")}</h2>
                {unreadCount > 0 && (
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                    style={{ background: "#EF4444" }}
                  >
                    {badge}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAll}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors hover:bg-slate-100"
                    style={{ color: "#4f46e5" }}
                  >
                    <CheckCheck style={{ width: "13px", height: "13px" }} />
                    {t("markAllRead")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-colors hover:bg-slate-100"
                  style={{ color: "#94A3B8" }}
                  aria-label={t("close")}
                >
                  <X style={{ width: "15px", height: "15px" }} />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-14">
                  <div className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-indigo-500 animate-spin" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 gap-2">
                  <Bell style={{ width: "32px", height: "32px", color: "#CBD5E1" }} />
                  <p className="text-sm font-semibold text-slate-400">{t("caughtUp")}</p>
                  <p className="text-xs text-slate-300">{t("empty")}</p>
                </div>
              ) : (
                notifications.map(n => {
                  const meta = TYPE_META[n.type] ?? TYPE_META.announcement;
                  const Icon = meta.icon;
                  const title = locale === "km" && n.title_km ? n.title_km : n.title_en;
                  const body = locale === "km" && n.body_km ? n.body_km : n.body_en;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => handleClick(n)}
                      className="w-full flex items-start gap-3 px-4 py-3.5 text-left cursor-pointer border-b border-divider last:border-0 transition-colors"
                      style={{ background: n.is_read ? undefined : "rgba(79,70,229,0.03)" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.035)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = n.is_read ? "" : "rgba(79,70,229,0.03)"; }}
                    >
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                        style={{ background: meta.bg }}
                      >
                        <Icon style={{ width: "16px", height: "16px", color: meta.color }} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm leading-snug truncate ${n.is_read ? "font-medium text-text-body" : "font-semibold text-text-heading"}`}>
                            {title}
                          </p>
                          {!n.is_read && (
                            <span className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ background: "#4f46e5" }} />
                          )}
                        </div>
                        {body && (
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">{body}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[10px] text-slate-400">{timeAgo(n.created_at, t)}</span>
                          {n.link && (
                            <span className="flex items-center gap-0.5 text-[10px] font-semibold" style={{ color: "#4f46e5" }}>
                              <ExternalLink style={{ width: "10px", height: "10px" }} />
                              {t("view")}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="shrink-0 border-t border-divider px-4 py-2.5 text-center">
                <button
                  type="button"
                  onClick={() => { router.push("/admin/logs"); setOpen(false); }}
                  className="text-xs font-semibold cursor-pointer hover:underline"
                  style={{ color: "#4f46e5" }}
                >
                  {t("viewLogs")}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
