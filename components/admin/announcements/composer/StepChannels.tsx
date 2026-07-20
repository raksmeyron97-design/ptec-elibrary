"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Bell, MessageSquare, MonitorSmartphone, Send, Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/components/admin/kit";
import { LIMITS } from "@/lib/admin/announcements/shared";
import type { AnnouncementInput, FieldErrors } from "@/lib/admin/announcements/validation";
import { sendTestAnnouncementPush } from "@/app/(admin)/admin/(protected)/announcements/actions";

const inputClass =
  "h-10 w-full rounded-lg border border-divider bg-bg-surface px-3 text-sm text-text-body placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand/30";
const labelClass = "mb-1.5 block text-xs font-semibold text-text-muted";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs font-medium text-danger" role="alert">{message}</p>;
}

export default function StepChannels({
  value,
  onChange,
  errors,
  canPush,
}: {
  value: AnnouncementInput;
  onChange: (patch: Partial<AnnouncementInput>) => void;
  errors: FieldErrors;
  canPush: boolean;
}) {
  const t = useTranslations("adminAnnouncements.composer.channels");
  const toast = useToast();
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  function toggle(channel: "inApp" | "banner" | "push", on: boolean) {
    onChange({ channels: { ...value.channels, [channel]: on } });
  }

  async function sendTest() {
    setTestBusy(true);
    setTestResult(null);
    try {
      const title = value.push.title.trim() || value.content.en.title.trim();
      const body = value.push.body.trim() || value.content.en.summary.trim() || value.content.en.title.trim();
      const url = value.push.url.trim() || value.ctaUrl?.trim() || "/";
      const res = await sendTestAnnouncementPush({ title, body, url });
      setTestResult(t("testSent", { count: res.sent }));
      toast.success(t("testSent", { count: res.sent }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("testFailed");
      setTestResult(msg);
      toast.error(msg);
    } finally {
      setTestBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">{t("intro")}</p>
      {errors.channels && <FieldError message={errors.channels} />}

      <ChannelCard
        icon={Bell}
        title={t("inAppTitle")}
        description={t("inAppDescription")}
        checked={value.channels.inApp}
        onToggle={(v) => toggle("inApp", v)}
      />

      <ChannelCard
        icon={MessageSquare}
        title={t("bannerTitle")}
        description={t("bannerDescription")}
        checked={value.channels.banner}
        onToggle={(v) => toggle("banner", v)}
      />

      <ChannelCard
        icon={MonitorSmartphone}
        title={t("pushTitle")}
        description={canPush ? t("pushDescription") : t("pushNoPermission")}
        checked={value.channels.push}
        onToggle={(v) => canPush && toggle("push", v)}
        disabled={!canPush}
      >
        {value.channels.push && (
          <div className="mt-3 space-y-3 border-t border-divider pt-3">
            <div>
              <label className={labelClass} htmlFor="push-title">{t("pushTitleField")}</label>
              <input id="push-title" value={value.push.title} onChange={(e) => onChange({ push: { ...value.push, title: e.target.value } })} placeholder={value.content.en.title || t("pushTitlePlaceholder")} maxLength={LIMITS.pushTitle} className={inputClass} />
              <FieldError message={errors["push.title"]} />
            </div>
            <div>
              <label className={labelClass} htmlFor="push-body">{t("pushBodyField")}</label>
              <textarea id="push-body" value={value.push.body} onChange={(e) => onChange({ push: { ...value.push, body: e.target.value } })} placeholder={value.content.en.summary || t("pushBodyPlaceholder")} maxLength={LIMITS.pushBody} rows={2} className="w-full resize-y rounded-lg border border-divider bg-bg-surface px-3 py-2 text-sm text-text-body focus:outline-none focus:ring-2 focus:ring-brand/30" />
              <FieldError message={errors["push.body"]} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} htmlFor="push-url">{t("pushUrlField")}</label>
                <input id="push-url" value={value.push.url} onChange={(e) => onChange({ push: { ...value.push, url: e.target.value } })} placeholder={value.ctaUrl || "/"} className={inputClass} />
                <FieldError message={errors["push.url"]} />
              </div>
              <div>
                <label className={labelClass} htmlFor="push-ttl">{t("pushTtlField")}</label>
                <input id="push-ttl" type="number" min={0} value={value.push.ttlSeconds ?? ""} onChange={(e) => onChange({ push: { ...value.push, ttlSeconds: e.target.value ? Number(e.target.value) : null } })} placeholder={t("pushTtlPlaceholder")} className={inputClass} />
              </div>
            </div>

            {/* Platform preview */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-divider bg-paper p-3">
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-text-muted">{t("previewDesktop")}</p>
                <div className="rounded-lg bg-bg-surface p-2.5 shadow-sm">
                  <p className="truncate text-[13px] font-semibold text-text-heading">{value.push.title.trim() || value.content.en.title.trim() || t("untitled")}</p>
                  <p className="line-clamp-2 text-xs text-text-muted">{value.push.body.trim() || value.content.en.summary.trim() || "—"}</p>
                </div>
              </div>
              <div className="rounded-xl border border-divider bg-paper p-3">
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-text-muted">{t("previewMobile")}</p>
                <div className="rounded-2xl bg-bg-surface p-2.5 shadow-sm">
                  <p className="truncate text-[12px] font-bold text-text-heading">PTEC Library</p>
                  <p className="truncate text-[12.5px] font-semibold text-text-body">{value.push.title.trim() || value.content.en.title.trim() || t("untitled")}</p>
                  <p className="line-clamp-1 text-[11.5px] text-text-muted">{value.push.body.trim() || value.content.en.summary.trim() || "—"}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button type="button" onClick={sendTest} disabled={testBusy} className="inline-flex items-center gap-1.5 rounded-lg border border-divider bg-bg-surface px-3.5 py-2 text-[13px] font-semibold text-text-body transition hover:bg-paper disabled:opacity-60">
                {testBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {t("sendTest")}
              </button>
              {testResult && (
                <span className="inline-flex items-center gap-1 text-xs text-text-muted" role="status">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" /> {testResult}
                </span>
              )}
            </div>
            <p className="text-xs text-text-muted">{t("testHint")}</p>
          </div>
        )}
      </ChannelCard>
    </div>
  );
}

function ChannelCard({
  icon: Icon,
  title,
  description,
  checked,
  onToggle,
  disabled,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  checked: boolean;
  onToggle: (v: boolean) => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border p-4 ${checked ? "border-brand/40 bg-brand/5" : "border-divider bg-bg-surface"} ${disabled ? "opacity-60" : ""}`}>
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onToggle(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 rounded border-divider text-brand focus:ring-focus-ring/30" />
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
        <span>
          <span className="block text-sm font-semibold text-text-heading">{title}</span>
          <span className="block text-xs text-text-muted">{description}</span>
        </span>
      </label>
      {children}
    </div>
  );
}
