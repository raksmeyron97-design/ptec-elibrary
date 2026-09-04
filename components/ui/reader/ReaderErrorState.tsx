"use client";

import { AlertTriangle, FileWarning, Lock, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { errorActions, type PdfErrorKind } from "@/lib/reader/errors";
import type { ReaderTheme } from "./reader-config";

/* Friendly, actionable errors — one screen per failure kind, each with only
   the actions that can help. */
export default function ReaderErrorState({
  kind,
  offline,
  theme,
  onRetry,
  retrying,
  reportHref,
  onReport,
  backHref,
}: {
  kind: PdfErrorKind;
  offline: boolean;
  theme: ReaderTheme;
  onRetry: () => void;
  retrying: boolean;
  reportHref: string | null;
  onReport: () => void;
  backHref?: string;
}) {
  const t = useTranslations("reader");
  const actions = errorActions(kind, offline);
  const dark = theme === "dark";
  const copy = offline
    ? { title: t("offlineError"), body: t("errorNetworkBody"), Icon: WifiOff }
    : kind === "missing"
      ? { title: t("errorMissingTitle"), body: t("errorMissingBody"), Icon: FileWarning }
      : kind === "permission"
        ? { title: t("errorPermissionTitle"), body: t("errorPermissionBody"), Icon: Lock }
        : kind === "invalid"
          ? { title: t("errorInvalidTitle"), body: t("errorInvalidBody"), Icon: FileWarning }
          : kind === "network"
            ? { title: t("errorNetworkTitle"), body: t("errorNetworkBody"), Icon: WifiOff }
            : { title: t("errorUnknownTitle"), body: t("errorUnknownBody"), Icon: AlertTriangle };
  const { Icon } = copy;
  const secondary = `reader-btn reader-btn--outline px-4 ${dark ? "" : "!text-text-heading !border-divider hover:!bg-black/5"}`;
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center px-6 py-10 text-center">
      <span className={`flex h-14 w-14 items-center justify-center rounded-full ${dark ? "bg-white/10 text-white" : "bg-black/5 text-text-heading"}`}>
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <h3 className={`mt-4 text-[16px] font-bold leading-6 ${dark ? "text-white" : "text-text-heading"}`}>{copy.title}</h3>
      <p className={`mt-1.5 text-[13.5px] leading-6 ${dark ? "text-white/70" : "text-text-body"}`}>{copy.body}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {actions.retry && (
          <button type="button" onClick={onRetry} disabled={retrying} className="reader-btn reader-btn--primary px-5">
            {retrying ? t("retrying") : t("retry")}
          </button>
        )}
        {actions.report && reportHref && (
          <a href={reportHref} onClick={onReport} className={secondary}>
            {t("reportBrokenFile")}
          </a>
        )}
        {actions.back && backHref && (
          <a href={backHref} className={secondary}>
            {t("backToBook")}
          </a>
        )}
      </div>
    </div>
  );
}
