"use client";

/**
 * `/admin/users/[id]` — one reader, in full.
 *
 * Layout: an identity aside that never scrolls out of relevance, and a tabbed
 * main column. Tabs are CLIENT state synced to the URL with `replaceState`, not
 * links: the whole profile arrived in one server pass, so a tab change is a
 * re-render, while the URL stays shareable and `?tab=access` still opens on the
 * right panel from a cold load. Pushing a history entry per tab would put four
 * stops between the reader and the Back button.
 *
 * Every mutation is the SAME Server Action the directory calls, so the two
 * surfaces cannot drift — and each one re-checks `users: write` on the server
 * regardless of what this page drew.
 */

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft, Ban, Calendar, CheckCircle2, ChevronRight, CircleCheck, Clock, Copy,
  KeyRound, Mail, MailCheck, MailWarning, Phone, Trash2, UserCog,
} from "lucide-react";

import Avatar from "@/components/ui/Avatar";
import { PageHeader, useToast, Badge } from "@/components/admin/kit";
import { RoleBadge, StatusBadge } from "@/components/admin/users/badges";
import { ConfirmDialog, RoleDialog } from "@/components/admin/users/dialogs";
import { formatDate, formatRelative, userLabel, type UserRow } from "@/lib/admin/users-shared";
import { PROFILE_TABS, type ProfileTab, type UserProfile } from "@/lib/admin/user-profile-shared";
import { computeDownloadProfileStatus } from "@/lib/profile/download-profile-shared";
import {
  assignRole, deleteUser, sendPasswordReset, setUserStatus, type ActionResult,
} from "../../actions";
import { AccessPanel, ActivityPanel, OverviewPanel, TrailPanel } from "./ProfilePanels";
import { Card } from "./profile-ui";
import type { AppRole } from "@/lib/types/roles";

type Pending = "suspend" | "reset" | "delete" | null;

export default function UserProfileClient({
  profile,
  tab: initialTab,
  isSelf,
  canManage,
  callerCanAssignAdmin,
  heading,
}: {
  profile: UserProfile;
  tab: ProfileTab;
  isSelf: boolean;
  canManage: boolean;
  callerCanAssignAdmin: boolean;
  heading: string;
}) {
  const t = useTranslations("adminUsers.profile");
  const tUsers = useTranslations("adminUsers");
  const tTime = useTranslations("adminUsers.time");
  const tTable = useTranslations("adminUsers.table");
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();

  const [tab, setTab] = useState<ProfileTab>(initialTab);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [roleOpen, setRoleOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const { identity } = profile;
  const suspended = identity.status === "disabled" || identity.status === "blocked";
  /* Same verdict the download route enforces — the aside must not say "ready"
     over a refusal. See ProfilePanels.AccessPanel. */
  const downloadStatus = computeDownloadProfileStatus(profile.accessProfile);

  // The dialogs were built for the directory's row type; the profile carries
  // the same person, so it is adapted rather than duplicated.
  const asRow: UserRow = {
    id: identity.id,
    fullName: identity.fullName,
    email: identity.email,
    phone: profile.accessProfile?.phone ?? null,
    avatarUrl: identity.avatarUrl,
    role: identity.role,
    isSuperAdmin: identity.isSuperAdmin,
    status: identity.status,
    createdAt: identity.createdAt,
    lastLoginAt: identity.lastLoginAt,
    emailConfirmed: identity.emailConfirmed,
  };

  const selectTab = useCallback((next: ProfileTab) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url.toString());
  }, []);

  const copyId = useCallback(async () => {
    try {
      await navigator.clipboard?.writeText(identity.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* Clipboard blocked — the id is still on screen and selectable. */
    }
  }, [identity.id]);

  async function run(fn: () => Promise<ActionResult>, successMsg: string, after?: () => void) {
    setBusy(true);
    try {
      const r = await fn();
      if (!r.success) toast.error(r.error ?? tUsers("toasts.failed"));
      else {
        toast.success(successMsg);
        if (after) after();
        else startTransition(() => router.refresh());
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tUsers("toasts.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmPending() {
    const kind = pending;
    setPending(null);
    if (kind === "reset") return run(() => sendPasswordReset(identity.id), tUsers("toasts.resetSent"));
    if (kind === "suspend") return run(() => setUserStatus(identity.id, "suspend"), tUsers("toasts.suspended"));
    if (kind === "delete") {
      // The record is about to stop existing — staying on its page would leave
      // the administrator looking at a row the next refresh 404s.
      return run(() => deleteUser(identity.id), tUsers("toasts.deleted"), () =>
        startTransition(() => router.push("/admin/users")),
      );
    }
  }

  /* There is deliberately NO effect syncing `tab` back from `initialTab`.
     A cold load seeds the state from the URL, and every later change goes
     through `selectTab`, which writes the URL with `replaceState`. A
     `router.refresh()` after a mutation re-renders the server component
     against the router's own idea of the URL, which `replaceState` does not
     update — so re-adopting the prop there would silently throw the reader
     back to Overview every time they suspended someone from the Access tab. */

  const quietBtn =
    "focus-field inline-flex items-center justify-center gap-1.5 rounded-lg border border-divider bg-bg-surface px-3 py-2 text-[13px] font-semibold text-text-body transition hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="w-full pb-10">
      <PageHeader
        breadcrumb={
          <nav aria-label={t("breadcrumb")} className="flex items-center gap-1 text-[12.5px] text-text-muted">
            <Link href="/admin/users" className="focus-field rounded font-medium hover:text-brand hover:underline">
              {tUsers("title")}
            </Link>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="truncate text-text-body">{userLabel(identity)}</span>
          </nav>
        }
        title={heading}
        description={t("pageDescription")}
        actions={
          <Link href="/admin/users" className={quietBtn}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("backToDirectory")}
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        {/* ── Identity aside ────────────────────────────────────────────── */}
        <aside className="space-y-4">
          <section className="rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <Avatar url={identity.avatarUrl} name={identity.fullName} email={identity.email} size={56} />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-semibold leading-tight text-text-heading">
                  {identity.fullName ?? <span className="italic text-text-muted">{tTable("noName")}</span>}
                </h2>
                <p className="mt-0.5 truncate text-[13px] text-text-muted">{identity.email || "—"}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <RoleBadge role={identity.role} isSuperAdmin={identity.isSuperAdmin} />
                  <StatusBadge status={identity.status} />
                  {isSelf && <Badge tone="brand">{t("thisIsYou")}</Badge>}
                </div>
              </div>
            </div>

            <dl className="mt-4 space-y-2 border-t border-divider pt-4 text-[13px]">
              <Fact icon={<Mail className="h-3.5 w-3.5" />} label={tUsers("drawer.email")}>
                {identity.email ? (
                  <a href={`mailto:${identity.email}`} className="focus-field rounded hover:text-brand hover:underline">
                    {identity.email}
                  </a>
                ) : "—"}
              </Fact>
              <Fact icon={identity.emailConfirmed ? <MailCheck className="h-3.5 w-3.5" /> : <MailWarning className="h-3.5 w-3.5" />} label={t("emailStatus")}>
                {identity.emailConfirmed ? t("emailConfirmed") : t("emailUnconfirmed")}
              </Fact>
              <Fact icon={<Phone className="h-3.5 w-3.5" />} label={tUsers("drawer.phone")}>
                {profile.accessProfile?.phone ?? "—"}
              </Fact>
              <Fact icon={<Calendar className="h-3.5 w-3.5" />} label={tTable("joined")}>
                {formatDate(identity.createdAt)}
              </Fact>
              <Fact icon={<Clock className="h-3.5 w-3.5" />} label={tTable("lastLogin")}>
                {formatRelative(identity.lastLoginAt, tTime)}
              </Fact>
            </dl>

            <div className="mt-4 border-t border-divider pt-3">
              <button
                type="button"
                onClick={copyId}
                className="focus-field flex w-full items-center justify-between gap-2 rounded-lg bg-paper px-2.5 py-1.5 text-left transition hover:bg-divider/40"
              >
                <span className="text-[11px] text-text-muted">{t("accountId")}</span>
                <span className="flex items-center gap-1.5 truncate font-mono text-[11px] text-text-body">
                  {copied ? t("copied") : identity.id}
                  {copied ? (
                    <CheckCircle2 className="h-3 w-3 shrink-0 text-success" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3 w-3 shrink-0" aria-hidden="true" />
                  )}
                </span>
              </button>
              <span role="status" aria-live="polite" className="sr-only">{copied ? t("copied") : ""}</span>
            </div>
          </section>

          {/* Access readiness, at a glance: the one thing a librarian looks up
              a reader for. It links INTO the tab rather than repeating it. */}
          <Card title={t("accessReadiness")}>
            <p className="text-[13px] text-text-body">
              {profile.accessProfileState === "unavailable"
                ? t("sectionUnavailable")
                : downloadStatus.complete
                  ? t("readyForRestricted")
                  : t("notReadyForRestricted", { count: downloadStatus.missingFields.length })}
            </p>
            <button
              type="button"
              onClick={() => selectTab("access")}
              className="focus-field mt-2 rounded text-[12.5px] font-semibold text-brand hover:underline"
            >
              {t("viewAccessProfile")}
            </button>
          </Card>

          {/* Mutations. Present only when the server would allow them — the
              registry's answer, not a level comparison (CLAUDE.md). */}
          {canManage && (
            <Card title={t("manageAccount")}>
              <div className="space-y-2">
                <button type="button" className={`${quietBtn} w-full`} disabled={busy} onClick={() => setRoleOpen(true)}>
                  <UserCog className="h-4 w-4" aria-hidden="true" /> {tUsers("drawer.assignRole")}
                </button>
                {suspended ? (
                  <button
                    type="button"
                    className={`${quietBtn} w-full`}
                    disabled={busy}
                    onClick={() => run(() => setUserStatus(identity.id, "activate"), tUsers("toasts.reactivated"))}
                  >
                    <CircleCheck className="h-4 w-4 text-success" aria-hidden="true" /> {tUsers("drawer.reactivate")}
                  </button>
                ) : (
                  <button type="button" className={`${quietBtn} w-full`} disabled={busy} onClick={() => setPending("suspend")}>
                    <Ban className="h-4 w-4 text-warning" aria-hidden="true" /> {tUsers("drawer.suspend")}
                  </button>
                )}
                <button type="button" className={`${quietBtn} w-full`} disabled={busy} onClick={() => setPending("reset")}>
                  <KeyRound className="h-4 w-4" aria-hidden="true" /> {tUsers("drawer.resetPassword")}
                </button>
              </div>

              {/* Deletion is irreversible and cascades every reader-owned row,
                  so it sits behind its own rule and its own label — never in
                  the same cluster as a password reset, which undoes nothing. */}
              <div className="mt-4 border-t border-divider pt-3">
                <p className="mb-2 text-[11.5px] leading-relaxed text-text-muted">{t("deleteWarning")}</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPending("delete")}
                  className="focus-field inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-[13px] font-semibold text-danger-text transition hover:brightness-95 disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" /> {tUsers("drawer.deleteUser")}
                </button>
              </div>
            </Card>
          )}
        </aside>

        {/* ── Tabbed main column ────────────────────────────────────────── */}
        <div className="min-w-0">
          <div className="mb-4 overflow-x-auto">
            <div role="tablist" aria-label={t("sections")} className="inline-flex gap-1 rounded-xl border border-divider bg-bg-surface p-1">
              {PROFILE_TABS.map((id) => {
                const active = tab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    id={`profile-tab-${id}`}
                    aria-selected={active}
                    aria-controls={`profile-panel-${id}`}
                    onClick={() => selectTab(id)}
                    className={`focus-field whitespace-nowrap rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition ${
                      active ? "bg-brand text-white" : "text-text-body hover:bg-paper"
                    }`}
                  >
                    {t(`tabs.${id}`)}
                  </button>
                );
              })}
            </div>
          </div>

          <div role="tabpanel" id={`profile-panel-${tab}`} aria-labelledby={`profile-tab-${tab}`} tabIndex={-1}>
            {tab === "overview" && <OverviewPanel profile={profile} />}
            {tab === "access" && <AccessPanel profile={profile} />}
            {tab === "activity" && <ActivityPanel profile={profile} />}
            {tab === "trail" && <TrailPanel profile={profile} />}
          </div>
        </div>
      </div>

      {roleOpen && (
        <RoleDialog
          user={asRow}
          canAssignAdmin={callerCanAssignAdmin}
          busy={busy}
          onCancel={() => setRoleOpen(false)}
          onConfirm={async (role: AppRole) => {
            setRoleOpen(false);
            await run(() => assignRole(identity.id, role), tUsers("toasts.roleUpdated"));
          }}
        />
      )}

      {pending && (
        <ConfirmDialog
          busy={busy}
          danger={pending === "delete"}
          title={
            pending === "reset" ? tUsers("confirm.resetTitle")
            : pending === "suspend" ? tUsers("confirm.suspendTitle")
            : tUsers("confirm.deleteTitle")
          }
          body={
            pending === "reset" ? tUsers("confirm.resetBody", { email: identity.email })
            : pending === "suspend" ? tUsers("confirm.suspendBody")
            : tUsers("confirm.deleteBody", { name: userLabel(identity) })
          }
          confirmLabel={
            pending === "reset" ? tUsers("confirm.sendEmail")
            : pending === "suspend" ? tUsers("confirm.suspend")
            : tUsers("confirm.delete")
          }
          onCancel={() => setPending(null)}
          onConfirm={confirmPending}
        />
      )}
    </div>
  );
}

function Fact({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="shrink-0 text-text-muted" aria-hidden="true">{icon}</span>
      <dt className="w-20 shrink-0 text-[11.5px] text-text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 truncate text-text-body">{children}</dd>
    </div>
  );
}
