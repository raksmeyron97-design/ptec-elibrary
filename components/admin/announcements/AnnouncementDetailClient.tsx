"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowLeft, Pencil, Copy, ThumbsUp, ThumbsDown, CalendarX, PauseCircle, Archive, RotateCcw, Loader2,
} from "lucide-react";
import { useToast, ConfirmDialog, StatusBadge } from "@/components/admin/kit";
import { STATUS_TONES, PRIORITY_TONES, normalizeStatus, normalizePriority } from "@/lib/admin/announcements/shared";
import { availableActions } from "@/lib/admin/announcements/state-machine";
import type { AnnouncementDetail } from "@/lib/admin/announcements/query";
import {
  approveAnnouncement,
  rejectAnnouncement,
  cancelScheduledAnnouncement,
  pauseAnnouncement,
  archiveAnnouncement,
  duplicateAnnouncement,
  resendFailedDeliveriesAction,
} from "@/app/(admin)/admin/(protected)/announcements/actions";

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AnnouncementDetailClient({ detail, canWrite, canPush }: { detail: AnnouncementDetail; canWrite: boolean; canPush: boolean }) {
  const t = useTranslations("adminAnnouncements.detail");
  const tStatus = useTranslations("adminAnnouncements.status");
  const tType = useTranslations("adminAnnouncements.type");
  const tPriority = useTranslations("adminAnnouncements.filters.priority");
  const tAudience = useTranslations("adminAnnouncements.filters.audience");
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [locale, setLocale] = useState<"en" | "km">("en");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);

  const row = detail.row;
  const status = normalizeStatus(row.status);
  const priority = normalizePriority(row.priority);
  const actions = availableActions(status);

  async function run(fn: () => Promise<unknown>, successKey = "toasts.updated") {
    setBusy(true);
    try {
      await fn();
      toast.success(t(successKey));
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toasts.failed"));
    } finally {
      setBusy(false);
    }
  }

  const jobs = detail.jobs;
  const latestJob = jobs[0] ?? null;
  const deliveryRate = latestJob && latestJob.total_targets > 0 ? Math.round((latestJob.sent / latestJob.total_targets) * 100) : null;

  return (
    <div className="space-y-5">
      <Link href="/admin/announcements" className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-brand">
        <ArrowLeft className="h-4 w-4" /> {t("back")}
      </Link>

      {/* Header */}
      <div className="rounded-xl border border-divider bg-bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-text-heading">{row.title_en}</h1>
              <StatusBadge tone={STATUS_TONES[status]}>{tStatus(status)}</StatusBadge>
              <StatusBadge tone={PRIORITY_TONES[priority]}>{tPriority(priority)}</StatusBadge>
            </div>
            <p className="mt-1 text-sm text-text-muted">{row.internal_name} · {tType(row.type)}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canWrite && actions.includes("edit") && (
              <Link href={`/admin/announcements/${row.id}/edit`} className="inline-flex items-center gap-1.5 rounded-xl border border-divider bg-bg-surface px-3.5 py-2 text-[13px] font-semibold text-text-body transition hover:bg-paper">
                <Pencil className="h-3.5 w-3.5" /> {t("edit")}
              </Link>
            )}
            {canWrite && (
              <button disabled={busy} onClick={() => run(async () => { const { id } = await duplicateAnnouncement(row.id); router.push(`/admin/announcements/${id}/edit`); })} className="inline-flex items-center gap-1.5 rounded-xl border border-divider bg-bg-surface px-3.5 py-2 text-[13px] font-semibold text-text-body transition hover:bg-paper disabled:opacity-60">
                <Copy className="h-3.5 w-3.5" /> {t("duplicate")}
              </button>
            )}
            {canWrite && actions.includes("approve") && (
              <button disabled={busy} onClick={() => run(() => approveAnnouncement(row.id), "toasts.approved")} className="inline-flex items-center gap-1.5 rounded-xl bg-success px-3.5 py-2 text-[13px] font-bold text-white transition hover:opacity-90 disabled:opacity-60">
                <ThumbsUp className="h-3.5 w-3.5" /> {t("approve")}
              </button>
            )}
            {canWrite && actions.includes("reject") && (
              <button disabled={busy} onClick={() => { setRejectOpen(true); setRejectReason(""); }} className="inline-flex items-center gap-1.5 rounded-xl border border-danger/30 bg-bg-surface px-3.5 py-2 text-[13px] font-semibold text-danger transition hover:bg-danger/5 disabled:opacity-60">
                <ThumbsDown className="h-3.5 w-3.5" /> {t("reject")}
              </button>
            )}
            {canWrite && actions.includes("cancelSchedule") && (
              <button disabled={busy} onClick={() => run(() => cancelScheduledAnnouncement(row.id), "toasts.cancelled")} className="inline-flex items-center gap-1.5 rounded-xl border border-divider bg-bg-surface px-3.5 py-2 text-[13px] font-semibold text-text-body transition hover:bg-paper disabled:opacity-60">
                <CalendarX className="h-3.5 w-3.5" /> {t("cancelSchedule")}
              </button>
            )}
            {canWrite && actions.includes("pause") && (
              <button disabled={busy} onClick={() => run(() => pauseAnnouncement(row.id), "toasts.paused")} className="inline-flex items-center gap-1.5 rounded-xl border border-divider bg-bg-surface px-3.5 py-2 text-[13px] font-semibold text-text-body transition hover:bg-paper disabled:opacity-60">
                <PauseCircle className="h-3.5 w-3.5" /> {t("pause")}
              </button>
            )}
            {canPush && actions.includes("resendFailed") && (latestJob?.failed ?? 0) > 0 && (
              <button disabled={busy} onClick={() => run(async () => { const r = await resendFailedDeliveriesAction(row.id); toast.info(t("toasts.retryQueued", { count: r.queued })); }, "toasts.retryQueued")} className="inline-flex items-center gap-1.5 rounded-xl border border-divider bg-bg-surface px-3.5 py-2 text-[13px] font-semibold text-text-body transition hover:bg-paper disabled:opacity-60">
                <RotateCcw className="h-3.5 w-3.5" /> {t("resendFailed")}
              </button>
            )}
            {canWrite && actions.includes("archive") && (
              <button disabled={busy} onClick={() => setArchiveConfirmOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-divider bg-bg-surface px-3.5 py-2 text-[13px] font-semibold text-text-body transition hover:bg-paper disabled:opacity-60">
                <Archive className="h-3.5 w-3.5" /> {t("archive")}
              </button>
            )}
            {busy && <Loader2 className="h-4 w-4 animate-spin text-text-muted" />}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Content */}
          <section className="rounded-xl border border-divider bg-bg-surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-text-heading">{t("contentHeading")}</h2>
              <div className="inline-flex rounded-lg border border-divider bg-paper p-0.5">
                <button onClick={() => setLocale("en")} className={`rounded-md px-3 py-1 text-xs font-semibold ${locale === "en" ? "bg-brand text-white" : "text-text-muted"}`}>EN</button>
                <button onClick={() => setLocale("km")} className={`rounded-md px-3 py-1 text-xs font-semibold ${locale === "km" ? "bg-brand text-white" : "text-text-muted"}`}>KM</button>
              </div>
            </div>
            {locale === "en" ? (
              <div className="space-y-2">
                <p className="font-semibold text-text-heading">{row.title_en}</p>
                {row.summary_en && <p className="text-sm text-text-body">{row.summary_en}</p>}
                {row.body_en && <p className="whitespace-pre-wrap text-sm text-text-muted">{row.body_en}</p>}
              </div>
            ) : row.title_km ? (
              <div className="space-y-2 font-khmer">
                <p className="font-semibold text-text-heading">{row.title_km}</p>
                {row.summary_km && <p className="text-sm text-text-body">{row.summary_km}</p>}
                {row.body_km && <p className="whitespace-pre-wrap text-sm text-text-muted">{row.body_km}</p>}
              </div>
            ) : (
              <p className="text-sm text-warning">{t("noKhmerContent")}</p>
            )}
            {row.cta_url && (
              <p className="mt-3 text-xs text-text-muted">{t("ctaLabel")}: <span className="font-semibold text-text-body">{row.cta_label_en || row.cta_label_km || "—"}</span> → <span className="text-brand">{row.cta_url}</span></p>
            )}
          </section>

          {/* Delivery report */}
          {row.channel_push && (
            <section className="rounded-xl border border-divider bg-bg-surface p-5">
              <h2 className="mb-3 text-sm font-bold text-text-heading">{t("deliveryHeading")}</h2>
              {jobs.length === 0 ? (
                <p className="text-sm text-text-muted">{t("noDeliveryJobs")}</p>
              ) : (
                <div className="space-y-3">
                  {latestJob && (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <Stat label={t("estimatedRecipients")} value={row.estimated_recipients ?? "—"} />
                      <Stat label={t("targetedDevices")} value={latestJob.total_targets} />
                      <Stat label={t("sent")} value={latestJob.sent} tone="success" />
                      <Stat label={t("failed")} value={latestJob.failed} tone={latestJob.failed > 0 ? "danger" : undefined} />
                      <Stat label={t("expired")} value={latestJob.expired} />
                      <Stat label={t("deliveryRate")} value={deliveryRate !== null ? `${deliveryRate}%` : "—"} />
                      <Stat label={t("jobStatus")} value={latestJob.status} />
                    </div>
                  )}
                  <p className="text-xs text-text-muted">{t("deliveryHonestyNote")}</p>
                </div>
              )}
            </section>
          )}

          {/* Status timeline */}
          <section className="rounded-xl border border-divider bg-bg-surface p-5">
            <h2 className="mb-3 text-sm font-bold text-text-heading">{t("timelineHeading")}</h2>
            {detail.history.length === 0 ? (
              <p className="text-sm text-text-muted">{t("noHistory")}</p>
            ) : (
              <ol className="space-y-3 border-l-2 border-divider pl-4">
                {detail.history.map((h) => (
                  <li key={h.id} className="relative">
                    <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand" aria-hidden="true" />
                    <p className="text-sm text-text-body">
                      <span className="font-semibold">{h.from_status ? `${tStatus(h.from_status)} → ` : ""}{tStatus(h.to_status)}</span>
                      {h.actorName && <span className="text-text-muted"> · {h.actorName}</span>}
                    </p>
                    {h.reason && <p className="text-xs text-text-muted">{h.reason}</p>}
                    <p className="text-xs text-text-muted">{fmt(h.created_at)}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        {/* Sidebar: config summary */}
        <aside className="space-y-5">
          <section className="rounded-xl border border-divider bg-bg-surface p-5">
            <h2 className="mb-3 text-sm font-bold text-text-heading">{t("configHeading")}</h2>
            <dl className="space-y-2 text-sm">
              <Row label={t("channels")} value={[row.channel_in_app && t("channelInApp"), row.channel_banner && t("channelBanner"), row.channel_push && t("channelPush")].filter(Boolean).join(", ") || "—"} />
              <Row label={t("audience")} value={row.audience_type === "role" && row.audience_roles?.length ? row.audience_roles.join(", ") : tAudience(row.audience_type)} />
              <Row label={t("pinned")} value={row.pinned ? t("yes") : t("no")} />
              <Row label={t("dismissible")} value={row.dismissible ? t("yes") : t("no")} />
              <Row label={t("scheduledAt")} value={fmt(row.scheduled_at)} />
              <Row label={t("publishedAt")} value={fmt(row.published_at)} />
              <Row label={t("expiresAt")} value={fmt(row.expires_at)} />
              <Row label={t("creator")} value={detail.createdByName ?? "—"} />
              <Row label={t("approvedBy")} value={detail.approvedByName ?? "—"} />
            </dl>
          </section>
        </aside>
      </div>

      {rejectOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="reject-title">
          <div className="w-full max-w-md rounded-2xl bg-bg-surface p-6 shadow-2xl">
            <h2 id="reject-title" className="text-lg font-bold text-text-heading">{t("rejectTitle")}</h2>
            <label className="mt-3 block text-xs font-semibold text-text-muted" htmlFor="reject-reason">{t("rejectReasonLabel")}</label>
            <textarea id="reject-reason" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-divider bg-paper px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30" />
            <div className="mt-4 flex justify-end gap-3">
              <button onClick={() => setRejectOpen(false)} className="rounded-lg border border-divider px-4 py-2 text-sm font-semibold text-text-body hover:bg-paper">{t("cancel")}</button>
              <button
                onClick={() => { setRejectOpen(false); run(() => rejectAnnouncement(row.id, rejectReason), "toasts.rejected"); }}
                className="rounded-lg bg-danger px-4 py-2 text-sm font-bold text-white hover:opacity-90"
              >
                {t("rejectConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={archiveConfirmOpen}
        tone="brand"
        title={t("archiveConfirmTitle")}
        description={t("archiveConfirmDescription")}
        confirmLabel={t("archive")}
        busy={busy}
        onCancel={() => setArchiveConfirmOpen(false)}
        onConfirm={() => { setArchiveConfirmOpen(false); run(() => archiveAnnouncement(row.id), "toasts.archived"); }}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-right font-medium text-text-body">{value}</dd>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "success" | "danger" }) {
  return (
    <div className="rounded-lg border border-divider bg-paper p-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-text-heading"}`}>{value}</p>
    </div>
  );
}
