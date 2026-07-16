"use client";

import {
  AlertTriangle,
  BellPlus,
  BellRing,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  Send,
  ShieldAlert,
  Smartphone,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { usePushNotifications } from "@/lib/hooks/usePushNotifications";

function StatusBadge({ tone, children }: { tone: "neutral" | "success" | "warning" | "danger"; children: React.ReactNode }) {
  const classes = {
    neutral: "border-divider bg-paper text-text-body",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    danger: "border-red-200 bg-red-50 text-red-700",
  }[tone];

  return (
    <span className={`inline-flex min-h-7 items-center rounded-full border px-3 text-[12px] font-bold ${classes}`}>
      {children}
    </span>
  );
}

function PrimaryButton({
  onClick,
  busy,
  disabled,
  children,
  icon,
}: {
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-[13px] font-bold text-brand-contrast transition hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand/30 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

function SecondaryButton({
  onClick,
  busy,
  disabled,
  children,
  icon,
  danger,
}: {
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  icon: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] font-bold transition focus:outline-none focus:ring-2 focus:ring-brand/25 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
        danger
          ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
          : "border-divider bg-paper text-text-body hover:border-brand/50 hover:text-brand"
      }`}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

function browserHelp(): string {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return " In Edge, open Site permissions for this site and allow notifications.";
  if (/Chrome\//.test(ua)) return " In Chrome, open Site settings for this site and allow notifications.";
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return " In Safari, open Websites settings and allow notifications for this site.";
  return "";
}

export default function PushSubscribeButton() {
  const t = useTranslations("pushNotifications");
  const { status, loading, busyAction, messageKey, errorCode, enable, repair, disable, test } = usePushNotifications({ autoRepair: true });
  const help = useMemo(() => browserHelp(), []);
  const busy = busyAction !== null;

  const state = status.kind;
  const icon = state === "enabled"
    ? <CheckCircle2 className="h-5 w-5" />
    : state === "denied" || state === "error"
      ? <ShieldAlert className="h-5 w-5" />
      : state === "ios-not-installed"
        ? <Smartphone className="h-5 w-5" />
        : <BellRing className="h-5 w-5" />;

  const badge =
    state === "enabled" ? <StatusBadge tone="success">{t("badgeEnabled")}</StatusBadge> :
    state === "needs-repair" ? <StatusBadge tone="warning">{t("badgeNeedsRepair")}</StatusBadge> :
    state === "denied" ? <StatusBadge tone="danger">{t("badgeBlocked")}</StatusBadge> :
    state === "error" ? <StatusBadge tone="danger">{t("badgeError")}</StatusBadge> :
    state === "dev-disabled" ? <StatusBadge tone="neutral">{t("notAvailable")}</StatusBadge> :
    <StatusBadge tone="neutral">{t("badgeNotEnabled")}</StatusBadge>;

  const title =
    state === "unsupported" ? t("unsupportedTitle") :
    state === "ios-not-installed" ? t("iosInstallTitle") :
    t("settingsTitle");

  const description =
    state === "unsupported" ? t("unsupportedMessage") :
    state === "dev-disabled" ? (status.error ?? t("unsupportedMessage")) :
    state === "ios-not-installed" ? t("iosInstallMessage") :
    state === "enabled" ? t("enabledMessage") :
    state === "needs-repair" ? t("needsRepairMessage") :
    state === "denied" ? `${t("deniedMessage")}${help}` :
    state === "error" ? (status.error ?? t("errorMessage")) :
    t("settingsDescription");

  return (
    <section className="rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm" aria-labelledby="push-settings-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-brand/15 bg-brand/10 text-brand">
            {icon}
          </span>
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 id="push-settings-title" className="text-[15px] font-bold text-text-heading">{title}</h2>
              {badge}
            </div>
            <p className="max-w-2xl text-[12.5px] leading-6 text-text-muted">{description}</p>
            {state === "ios-not-installed" && (
              <ol className="mt-3 list-decimal space-y-1 pl-4 text-[12.5px] leading-6 text-text-body">
                <li>{t("iosStepShare")}</li>
                <li>{t("iosStepAdd")}</li>
                <li>{t("iosStepOpen")}</li>
              </ol>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {loading ? (
          <span className="inline-flex min-h-11 items-center gap-2 text-[13px] font-semibold text-text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("checking")}
          </span>
        ) : state === "unsupported" || state === "dev-disabled" ? (
          <SecondaryButton onClick={() => undefined} disabled icon={<AlertTriangle className="h-4 w-4" />}>
            {t("notAvailable")}
          </SecondaryButton>
        ) : state === "ios-not-installed" ? (
          <SecondaryButton onClick={() => undefined} disabled icon={<Download className="h-4 w-4" />}>
            {t("installFirst")}
          </SecondaryButton>
        ) : state === "enabled" ? (
          <>
            <SecondaryButton onClick={test} busy={busyAction === "test"} disabled={busy && busyAction !== "test"} icon={<Send className="h-4 w-4" />}>
              {t("sendTest")}
            </SecondaryButton>
            <SecondaryButton onClick={disable} busy={busyAction === "disable"} disabled={busy && busyAction !== "disable"} danger icon={<ShieldAlert className="h-4 w-4" />}>
              {t("disable")}
            </SecondaryButton>
          </>
        ) : state === "needs-repair" ? (
          <PrimaryButton onClick={repair} busy={busyAction === "repair"} disabled={busy && busyAction !== "repair"} icon={<RefreshCw className="h-4 w-4" />}>
            {busyAction === "repair" ? t("repairing") : t("repair")}
          </PrimaryButton>
        ) : state === "denied" ? (
          <SecondaryButton onClick={() => undefined} disabled icon={<ShieldAlert className="h-4 w-4" />}>
            {t("blocked")}
          </SecondaryButton>
        ) : (
          <PrimaryButton onClick={enable} busy={busyAction === "enable"} disabled={busy && busyAction !== "enable"} icon={<BellPlus className="h-4 w-4" />}>
            {busyAction === "enable" ? t("enabling") : t("enable")}
          </PrimaryButton>
        )}
      </div>

      <div aria-live="polite" className="mt-4 min-h-5 text-[12.5px]">
        {messageKey && <p className="text-emerald-700">{t(messageKey)}</p>}
        {errorCode && (
          <p className="text-red-700">
            {t("diagnosticCode")}: <span className="font-mono">{errorCode}</span>
          </p>
        )}
      </div>
    </section>
  );
}
