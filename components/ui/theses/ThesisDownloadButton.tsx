"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Download, Lock, ShieldAlert, UserPlus, Loader2, FileX2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { downloadProfileSettingsPath } from "@/lib/security/return-to";
import type { ThesisDownloadReason } from "@/lib/theses/download-permission";

type StatusResponse = {
  allowed: boolean;
  reason: ThesisDownloadReason;
  rank: number | null;
  isTopTen: boolean;
  authenticated: boolean;
};

/**
 * Gated thesis download control. The public page HTML never contains the
 * per-user decision (it is publicly cacheable) — this client component fetches
 * the private `/download-status` endpoint (no-store) and renders one of five
 * states. The Download action re-triggers server authorization at
 * `/download`; hiding a button is never the enforcement point.
 */
export default function ThesisDownloadButton({
  reportId,
  hasFile,
  variant = "full",
  thesisPath,
}: {
  reportId: string;
  hasFile: boolean;
  variant?: "full" | "compact";
  /** Localized internal path to this thesis, for returnTo + login callbacks. */
  thesisPath: string;
}) {
  const t = useTranslations("thesisDownload");
  const locale = useLocale();
  const compact = variant === "compact";
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/theses/${reportId}/download-status`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("status"))))
      .then((data: StatusResponse) => {
        if (alive) setStatus(data);
      })
      .catch(() => {
        // Fail closed to a safe non-destructive state: treat as sign-in needed.
        if (alive) setStatus({ allowed: false, reason: "AUTHENTICATION_REQUIRED", rank: null, isTopTen: false, authenticated: false });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [reportId]);

  const startDownload = useCallback(async () => {
    if (inFlight.current) return; // guard rapid double clicks
    inFlight.current = true;
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(`/api/theses/${reportId}/download`, { cache: "no-store" });
      if (!res.ok) {
        // Re-check status so the button reflects a policy that changed under us.
        let reason: ThesisDownloadReason = "FILE_UNAVAILABLE";
        try {
          const body = await res.json();
          reason = body?.reason ?? reason;
        } catch { /* non-JSON */ }
        setError(t(`error.${reason}`, {}) || t("error.generic"));
        if (reason === "PROFILE_INCOMPLETE" || reason === "AUTHENTICATION_REQUIRED" || reason === "TOP_TEN_RESTRICTED" || reason === "ADMIN_BLOCKED") {
          setStatus((s) => (s ? { ...s, allowed: false, reason } : s));
        }
        return;
      }
      // Stream the blob and trigger a save without exposing a storage URL.
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const disposition = res.headers.get("content-disposition") || "";
      const match = /filename\*?=(?:UTF-8'')?"?([^;"]+)"?/i.exec(disposition);
      const filename = match ? decodeURIComponent(match[1]) : "thesis.pdf";
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      setError(t("error.generic"));
    } finally {
      setDownloading(false);
      inFlight.current = false;
    }
  }, [reportId, t]);

  const fullBtn = "btn-brand-gradient inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[14px] font-bold text-white transition-transform duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";
  const sizeCls = compact ? "w-full px-4 py-2.5 text-[13.5px]" : "px-6 py-2.5 text-[15px]";
  const lockedCls = `inline-flex min-h-[44px] cursor-not-allowed items-center justify-center gap-2 rounded-[14px] border border-dashed border-divider text-text-muted ${compact ? "w-full px-4 py-2.5 text-[13.5px]" : "px-6 py-2.5 text-[15px]"}`;
  const linkCls = `inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[14px] border border-brand/30 bg-brand/5 font-bold text-brand transition-colors hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 ${sizeCls}`;
  const iconSize = compact ? "h-4 w-4" : "h-[18px] w-[18px]";

  if (!hasFile) {
    return (
      <span className={lockedCls} title={t("state.unavailable")}>
        <FileX2 className={iconSize} />
        {t("state.unavailable")}
      </span>
    );
  }

  if (loading || !status) {
    return (
      <span className={`${fullBtn} ${sizeCls} opacity-60`} aria-hidden="true">
        <Loader2 className={`${iconSize} animate-spin`} />
        {t("state.checking")}
      </span>
    );
  }

  const note = (text: string) => (
    <p className="mt-1.5 text-[12px] leading-snug text-text-muted">{text}</p>
  );

  // State E — allowed
  if (status.allowed) {
    return (
      <div className={compact ? "" : "space-y-1"}>
        <button
          type="button"
          onClick={startDownload}
          disabled={downloading}
          className={`${fullBtn} ${sizeCls} disabled:opacity-70`}
          aria-label={t("state.download")}
        >
          {downloading ? <Loader2 className={`${iconSize} animate-spin`} /> : <Download className={iconSize} />}
          {downloading ? t("state.preparing") : t("state.download")}
        </button>
        {error && <p role="alert" className="mt-1.5 text-[12px] text-red-600">{error}</p>}
      </div>
    );
  }

  // State A — not authenticated
  if (status.reason === "AUTHENTICATION_REQUIRED") {
    const callback = `${locale === "km" ? "" : ""}${thesisPath}`;
    return (
      <div className={compact ? "" : "space-y-1"}>
        <a href={`/auth/login?callbackUrl=${encodeURIComponent(callback)}`} className={linkCls}>
          <UserPlus className={iconSize} />
          {t("state.signIn")}
        </a>
        {!compact && note(t("note.signIn"))}
      </div>
    );
  }

  // State B — authenticated but profile incomplete
  if (status.reason === "PROFILE_INCOMPLETE") {
    const href = downloadProfileSettingsPath(thesisPath, locale);
    return (
      <div className={compact ? "" : "space-y-1"}>
        <a href={href} className={linkCls}>
          <UserPlus className={iconSize} />
          {t("state.completeProfile")}
        </a>
        {!compact && note(t("note.completeProfile"))}
      </div>
    );
  }

  // State C — Top 10 protected
  if (status.reason === "TOP_TEN_RESTRICTED") {
    return (
      <div className={compact ? "" : "space-y-1"}>
        <span className={lockedCls}>
          <Lock className={iconSize} />
          {t("state.protected")}
        </span>
        {!compact && note(status.rank ? t("note.protectedRank", { rank: status.rank }) : t("note.protected"))}
      </div>
    );
  }

  // State D — admin blocked
  if (status.reason === "ADMIN_BLOCKED") {
    return (
      <div className={compact ? "" : "space-y-1"}>
        <span className={lockedCls}>
          <ShieldAlert className={iconSize} />
          {t("state.disabled")}
        </span>
        {!compact && (
          <p className="mt-1.5 text-[12px] leading-snug text-text-muted">
            {t("note.disabled")}{" "}
            <Link href="/contact" className="text-brand underline underline-offset-2">{t("note.contact")}</Link>
          </p>
        )}
      </div>
    );
  }

  // FILE_UNAVAILABLE / THESIS_UNPUBLISHED fallback
  return (
    <span className={lockedCls}>
      <FileX2 className={iconSize} />
      {t("state.unavailable")}
    </span>
  );
}
