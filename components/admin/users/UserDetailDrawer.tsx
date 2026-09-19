"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { X, Mail, Phone, Calendar, Clock, BookMarked, Star, UserCog, Ban, CircleCheck, ArrowUpRight } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import { fetchUserDetail } from "@/app/(admin)/admin/(protected)/users/actions";
import type { UserDetail } from "@/lib/admin/users";
import { formatDate, formatRelative, userLabel, type UserRow } from "@/lib/admin/users-shared";
import { RoleBadge, StatusBadge } from "@/components/admin/users/badges";
import type { UserActionIntent } from "@/components/admin/users/UserActionsMenu";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-divider px-5 py-4">
      <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-text-muted">{title}</h3>
      {children}
    </section>
  );
}

export default function UserDetailDrawer({
  user,
  canManage,
  onClose,
  onIntent,
}: {
  user: UserRow;
  canManage: boolean;
  onClose: () => void;
  onIntent: (intent: UserActionIntent) => void;
}) {
  const t = useTranslations("adminUsers.drawer");
  const tTable = useTranslations("adminUsers.table");
  const tTime = useTranslations("adminUsers.time");
  const tProfile = useTranslations("adminUsers.profile");
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab") return;
      // Keep Tab inside the dialog, and cycle at both ends.
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  // Remounted per user (key={user.id} at the call site), so `loading` starts
  // true and this effect only resolves the fetch — no setState in effect body.
  useEffect(() => {
    let alive = true;
    fetchUserDetail(user.id)
      .then((d) => { if (alive) setDetail(d); })
      .catch(() => { if (alive) setDetail(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [user.id]);

  const suspended = user.status === "disabled" || user.status === "blocked";
  const actionBtn = "inline-flex items-center justify-center gap-1.5 rounded-xl border border-divider bg-bg-surface px-3 py-2 text-[13px] font-semibold text-text-body shadow-sm transition hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="fixed inset-0 z-[100] flex justify-end" role="dialog" aria-modal="true" aria-label={t("detailsFor", { name: userLabel(user) })}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-bg-surface shadow-2xl outline-none sm:max-w-[420px]"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-divider bg-bg-surface px-5 py-4">
          <Avatar url={user.avatarUrl ?? null} name={user.fullName} email={user.email} size={52} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold leading-tight text-text-heading">{user.fullName ?? tTable("noName")}</h2>
            <p className="truncate text-sm text-text-muted">{user.email || "—"}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <RoleBadge role={user.role} isSuperAdmin={user.isSuperAdmin} />
              <StatusBadge status={user.status} />
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label={t("closeDetails")} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-paper hover:text-text-heading">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* The drawer answers "who is this?" in one glance. Everything it
            cannot hold — the access profile, the activity totals, the
            administrative history — is one link away rather than crammed into
            a 420px column. */}
        <div className="border-b border-divider px-5 py-3">
          <Link
            href={`/admin/users/${user.id}`}
            className="focus-field inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-brand-hover"
          >
            {tProfile("viewProfile")}
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-2 px-5 py-4">
          <button type="button" className={actionBtn} disabled={!canManage} onClick={() => onIntent("assignRole")}>
            <UserCog className="h-4 w-4" /> {t("assignRole")}
          </button>
          {suspended ? (
            <button type="button" className={actionBtn} disabled={!canManage} onClick={() => onIntent("activate")}>
              <CircleCheck className="h-4 w-4 text-success" aria-hidden="true" /> {t("reactivate")}
            </button>
          ) : (
            <button type="button" className={actionBtn} disabled={!canManage} onClick={() => onIntent("suspend")}>
              <Ban className="h-4 w-4 text-warning" aria-hidden="true" /> {t("suspend")}
            </button>
          )}
        </div>

        {/* Account */}
        <Section title={t("account")}>
          <dl className="space-y-2.5 text-sm">
            <Row icon={<Mail className="h-4 w-4" />} label={t("email")}>{user.email || <span className="text-text-muted">—</span>}</Row>
            <Row icon={<Phone className="h-4 w-4" />} label={t("phone")}>{user.phone ?? <span className="text-text-muted">—</span>}</Row>
            <Row icon={<Calendar className="h-4 w-4" />} label={tTable("joined")}>{formatDate(user.createdAt)}</Row>
            <Row icon={<Clock className="h-4 w-4" />} label={tTable("lastLogin")}>{formatRelative(user.lastLoginAt, tTime)}</Row>
          </dl>
        </Section>

        {/* Activity */}
        <Section title={t("recentActivity")}>
          {loading ? (
            <SkeletonLines n={3} />
          ) : (
            <>
              <div className="mb-3 flex gap-4 text-xs">
                <span className="inline-flex items-center gap-1.5 text-text-muted"><BookMarked className="h-3.5 w-3.5" /> {t("downloads", { count: detail?.downloadCount ?? 0 })}</span>
                <span className="inline-flex items-center gap-1.5 text-text-muted"><Star className="h-3.5 w-3.5" /> {t("reviews", { count: detail?.reviewCount ?? 0 })}</span>
              </div>
              {detail?.recentActivity && detail.recentActivity.length > 0 ? (
                <ul className="space-y-2">
                  {detail.recentActivity.map((a, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm">
                      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${a.kind === "download" ? "bg-info" : "bg-warning"}`} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-text-body">{a.label}</span>
                        <span className="text-[11px] text-text-muted">{formatRelative(a.at, tTime)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-text-muted">{t("noActivity")}</p>
              )}
            </>
          )}
        </Section>

        {/* Danger zone */}
        {canManage && (
          <div className="mt-auto flex items-center gap-2 border-t border-divider px-5 py-4">
            <button type="button" onClick={() => onIntent("resetPassword")} className={`${actionBtn} flex-1`}>
              {t("resetPassword")}
            </button>
            <button type="button" onClick={() => onIntent("delete")} className="focus-field inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-[13px] font-semibold text-danger-text transition hover:brightness-95">
              {t("deleteUser")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-text-muted" aria-hidden="true">{icon}</span>
      <span className="w-20 shrink-0 text-xs text-text-muted">{label}</span>
      <span className="min-w-0 flex-1 truncate text-text-body">{children}</span>
    </div>
  );
}

/** Shaped like the content it stands in for. The previous version put a
 *  spinner on every line, which reads as several requests in trouble rather
 *  than one section arriving. */
function SkeletonLines({ n }: { n: number }) {
  return (
    <div className="animate-pulse space-y-2" aria-hidden="true">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-divider" />
          <div className="h-3 rounded bg-paper" style={{ width: `${70 - i * 12}%` }} />
        </div>
      ))}
    </div>
  );
}
