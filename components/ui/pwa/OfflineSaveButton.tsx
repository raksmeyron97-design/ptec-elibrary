"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Icon from "@/components/ui/core/Icon";
import {
  downloadOfflineBook,
  formatBytes,
  isOfflineBookAvailable,
  isOfflineStorageSupported,
  getOfflineBook,
  removeOfflineBook,
  OfflineSaveError,
  type OfflineSaveErrorCode,
  type OfflineSaveProgress,
  type OfflineSaveStatus,
} from "@/lib/offline";

type Props = {
  bookId: string;
  bookSlug: string;
  title: string;
  author: string;
  coverUrl: string | null;
  coverColor: string | undefined;
  pdfUrl: string;
  isLoggedIn: boolean;
  /** Profile id of the signed-in reader — stamped on the record so a second
   *  account on this device cannot open, or silently inherit, the download. */
  userId?: string | null;
};

export default function OfflineSaveButton({
  bookId, bookSlug, title, author, coverUrl, coverColor, pdfUrl, isLoggedIn, userId,
}: Props) {
  const t = useTranslations("offline");
  const [status, setStatus] = useState<OfflineSaveStatus>("idle");
  const [progress, setProgress] = useState<OfflineSaveProgress | null>(null);
  const [errorCode, setErrorCode] = useState<OfflineSaveErrorCode | null>(null);
  const [supported, setSupported] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // The record alone is not proof (it can outlive an eviction), so the initial
  // state is decided by a real Cache Storage probe.
  useEffect(() => {
    if (!isOfflineStorageSupported()) return;
    setSupported(true);
    let active = true;
    const record = getOfflineBook(bookId);
    if (!record) return;
    isOfflineBookAvailable(record).then((available) => {
      if (active) setStatus(available ? "saved" : "idle");
    });
    return () => {
      active = false;
    };
  }, [bookId]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const save = useCallback(async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setErrorCode(null);
    setProgress({ status: "preparing", receivedBytes: 0, totalBytes: null });
    setStatus("preparing");
    try {
      await downloadOfflineBook(
        { id: bookId, slug: bookSlug, title, author, coverUrl, coverColor, pdfUrl, ownerKey: userId ?? null },
        {
          signal: controller.signal,
          onProgress: (p) => {
            setProgress(p);
            setStatus(p.status);
          },
        },
      );
      setStatus("saved");
      setProgress(null);
    } catch (error) {
      const code = error instanceof OfflineSaveError ? error.code : "storage";
      if (code === "aborted") {
        setStatus("idle");
        setProgress(null);
        return;
      }
      console.error("Offline save failed:", error);
      setErrorCode(code);
      setStatus("error");
      setProgress(null);
    } finally {
      abortRef.current = null;
    }
  }, [bookId, bookSlug, title, author, coverUrl, coverColor, pdfUrl, userId]);

  if (!supported) return null;

  const busy =
    status === "preparing" || status === "downloading" ||
    status === "saving" || status === "verifying";

  const handleClick = async () => {
    if (busy) return;
    if (!isLoggedIn) {
      window.location.assign(`/auth/login?callbackUrl=${encodeURIComponent(`/books/${bookSlug}`)}`);
      return;
    }
    if (status === "saved") {
      if (!window.confirm(t("removeConfirm"))) return;
      await removeOfflineBook(bookId);
      setStatus("idle");
      return;
    }
    await save();
  };

  const pct =
    progress?.totalBytes && progress.totalBytes > 0
      ? Math.min(100, Math.round((progress.receivedBytes / progress.totalBytes) * 100))
      : null;

  const busyLabel =
    status === "preparing" ? t("statusPreparing")
    : status === "downloading"
      // Only a real Content-Length earns a percentage. Without one the honest
      // report is how much has actually arrived.
      ? pct !== null ? `${t("statusDownloading")} ${pct}%`
        : progress?.receivedBytes ? `${t("statusDownloading")} ${formatBytes(progress.receivedBytes)}`
          : t("statusDownloading")
    : status === "saving" ? t("statusSaving")
    : t("statusVerifying");

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        aria-busy={busy}
        aria-label={status === "saved" ? t("removeAction") : t("saveAction")}
        className="focus-field inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[14px] border border-divider bg-paper px-6 py-3.5 text-sm font-semibold text-text-body transition hover:border-brand hover:text-brand disabled:opacity-60"
      >
        {busy ? (
          <>
            <Icon name="spinner" className="text-[20px] animate-spin" />
            {busyLabel}
          </>
        ) : status === "saved" ? (
          <>
            <Icon name="check" className="text-[20px]" />
            {t("savedOffline")}
          </>
        ) : (
          <>
            <Icon name="download" className="text-[20px]" />
            {t("saveOffline")}
          </>
        )}
      </button>

      {/* Progress is rendered only when it is real. */}
      {busy && pct !== null && (
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t("statusDownloading")}
          className="h-1.5 w-full overflow-hidden rounded-full bg-divider"
        >
          <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      )}

      {status === "error" && errorCode && (
        <p role="alert" className="text-[13px] leading-5 text-danger">
          {errorCode === "quota" || errorCode === "limit"
            ? t("errorStorage")
            : errorCode === "unsupported"
              ? t("errorUnsupported")
              : t("errorGeneric")}{" "}
          <button type="button" onClick={save} className="focus-field font-semibold underline underline-offset-2">
            {t("retry")}
          </button>
        </p>
      )}
    </div>
  );
}
