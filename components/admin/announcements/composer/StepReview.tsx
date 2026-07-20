"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Bell, MessageSquare, MonitorSmartphone, Send, Loader2, Save, CalendarClock } from "lucide-react";
import { checkDestinationUrl } from "@/lib/admin/announcements/url-safety";
import { truncatePreview } from "@/lib/admin/announcements/shared";
import type { AnnouncementInput } from "@/lib/admin/announcements/validation";
import type { AudienceEstimate } from "./AnnouncementComposer";

export default function StepReview({
  value,
  estimate,
  estimating,
  canPush,
  saving,
  onSaveDraft,
  onSchedule,
  onPublishNow,
}: {
  value: AnnouncementInput;
  estimate: AudienceEstimate | null;
  estimating: boolean;
  canPush: boolean;
  saving: "draft" | "schedule" | "publish" | null;
  onSaveDraft: () => void;
  onSchedule: () => void;
  onPublishNow: () => void;
}) {
  const t = useTranslations("adminAnnouncements.composer.review");
  const tAudience = useTranslations("adminAnnouncements.filters.audience");
  const tPriority = useTranslations("adminAnnouncements.filters.priority");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const warnings: string[] = [];
  if (!value.content.km.title.trim()) warnings.push(t("warnMissingKm"));
  const enTitleT = truncatePreview(value.content.en.title, 60);
  if (enTitleT.truncated) warnings.push(t("warnTitleTruncated"));
  if (value.ctaUrl && !checkDestinationUrl(value.ctaUrl).ok) warnings.push(t("warnBadLink"));
  if ((value.content.en.ctaLabel.trim() || value.content.km.ctaLabel.trim()) && !value.ctaUrl?.trim()) warnings.push(t("warnCtaNoLink"));
  if (!value.imageUrl) warnings.push(t("warnNoImage"));
  if (value.channels.banner && value.audience.type !== "all_active") warnings.push(t("warnBannerRestrictedAudience"));

  const isUrgentOrLarge = value.priority === "urgent" || (estimate?.deviceCount ?? 0) > 500;
  const requiresTypedConfirm = value.channels.push && isUrgentOrLarge;

  function openConfirm() {
    if (value.channels.push) {
      setConfirmOpen(true);
      setConfirmText("");
    } else {
      onPublishNow();
    }
  }

  function confirmPublish() {
    setConfirmOpen(false);
    onPublishNow();
  }

  const busy = saving !== null;

  return (
    <div className="space-y-5">
      {warnings.length > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-warning"><AlertTriangle className="h-3.5 w-3.5" /> {t("warningsHeading")}</p>
          <ul className="list-inside list-disc space-y-0.5 text-xs text-text-body">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {/* Preview panels */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {value.channels.inApp && (
          <PreviewCard icon={Bell} label={t("previewInApp")}>
            <p className="text-sm font-semibold text-text-heading">{value.content.en.title || t("untitled")}</p>
            <p className="mt-0.5 line-clamp-2 text-xs text-text-muted">{value.content.en.summary || value.content.en.body || "—"}</p>
          </PreviewCard>
        )}
        {value.channels.banner && (
          <PreviewCard icon={MessageSquare} label={t("previewBanner")}>
            <div className="rounded-lg bg-brand px-3 py-2 text-white">
              <p className="truncate text-xs font-semibold">{value.content.en.title || t("untitled")}</p>
            </div>
          </PreviewCard>
        )}
        {value.channels.push && (
          <>
            <PreviewCard icon={MonitorSmartphone} label={t("previewDesktopPush")}>
              <p className="truncate text-sm font-semibold text-text-heading">{value.push.title.trim() || value.content.en.title || t("untitled")}</p>
              <p className="line-clamp-2 text-xs text-text-muted">{value.push.body.trim() || value.content.en.summary || "—"}</p>
            </PreviewCard>
            <PreviewCard icon={MonitorSmartphone} label={t("previewMobilePush")}>
              <p className="truncate text-xs font-bold text-text-heading">PTEC Library</p>
              <p className="truncate text-[12.5px] font-semibold text-text-body">{value.push.title.trim() || value.content.en.title || t("untitled")}</p>
            </PreviewCard>
          </>
        )}
      </div>

      {/* Summary */}
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-xl border border-divider bg-paper p-4 text-sm sm:grid-cols-2">
        <SummaryRow label={t("summaryPriority")} value={tPriority(value.priority)} />
        <SummaryRow label={t("summaryChannels")} value={[value.channels.inApp && t("channelInApp"), value.channels.banner && t("channelBanner"), value.channels.push && t("channelPush")].filter(Boolean).join(", ") || "—"} />
        <SummaryRow
          label={t("summaryAudience")}
          value={value.audience.type === "role" && value.audience.roles.length > 0 ? value.audience.roles.join(", ") : tAudience(value.audience.type)}
        />
        <SummaryRow label={t("summaryMode")} value={value.schedule.mode === "schedule" ? t("summaryScheduled") : t("summaryImmediate")} />
        {value.schedule.mode === "schedule" && value.schedule.scheduledAt && (
          <SummaryRow label={t("summaryScheduledAt")} value={new Date(value.schedule.scheduledAt).toLocaleString()} />
        )}
        {value.schedule.expiresAt && <SummaryRow label={t("summaryExpiresAt")} value={new Date(value.schedule.expiresAt).toLocaleString()} />}
        <SummaryRow
          label={t("summaryEstimate")}
          value={estimating ? t("estimating") : estimate ? t("summaryEstimateValue", { users: estimate.recipientCount, devices: estimate.deviceCount }) : "—"}
        />
      </dl>

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-3 border-t border-divider pt-4">
        <button type="button" onClick={onSaveDraft} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl border border-divider bg-bg-surface px-4 py-2.5 text-sm font-semibold text-text-body transition hover:bg-paper disabled:opacity-60">
          {saving === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {t("saveDraft")}
        </button>

        {value.schedule.mode === "schedule" ? (
          <button type="button" onClick={onSchedule} disabled={busy} className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-hover disabled:opacity-60">
            {saving === "schedule" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />} {t("scheduleAction")}
          </button>
        ) : (
          <button
            type="button"
            onClick={openConfirm}
            disabled={busy || (value.channels.push && !canPush)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-hover disabled:opacity-60"
          >
            {saving === "publish" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {t("publishAction")}
          </button>
        )}
      </div>
      {value.channels.push && !canPush && <p className="text-right text-xs text-warning">{t("noPushPermissionWarning")}</p>}

      {confirmOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="publish-confirm-title">
          <div className="w-full max-w-md rounded-2xl bg-bg-surface p-6 shadow-2xl">
            <h2 id="publish-confirm-title" className="text-lg font-bold text-text-heading">{t("confirmTitle")}</h2>
            <p className="mt-2 text-sm text-text-body">
              {t("confirmBody", { devices: estimate?.deviceCount ?? 0 })}
            </p>
            <p className="mt-2 text-xs text-text-muted">{t("confirmIrreversible")}</p>

            {requiresTypedConfirm && (
              <div className="mt-4">
                <label className="mb-1 block text-xs font-semibold text-text-muted" htmlFor="confirm-type-send">{t("confirmTypeSend")}</label>
                <input
                  id="confirm-type-send"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="h-10 w-full rounded-lg border border-divider bg-paper px-3 text-sm text-text-body focus:outline-none focus:ring-2 focus:ring-brand/30"
                  placeholder="SEND"
                />
              </div>
            )}

            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setConfirmOpen(false)} className="rounded-lg border border-divider px-4 py-2 text-sm font-semibold text-text-body transition hover:bg-paper">
                {t("confirmBack")}
              </button>
              <button
                type="button"
                onClick={confirmPublish}
                disabled={requiresTypedConfirm && confirmText.trim().toUpperCase() !== "SEND"}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("confirmSend")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewCard({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-divider bg-bg-surface p-3">
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-text-muted"><Icon className="h-3 w-3" /> {label}</p>
      {children}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="font-semibold text-text-muted">{label}</dt>
      <dd className="text-text-body">{value}</dd>
    </>
  );
}
