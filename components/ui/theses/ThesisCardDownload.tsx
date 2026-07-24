"use client";

import { useCallback, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { Download, Loader2 } from "lucide-react";
import type { ThesisDownloadReason } from "@/lib/theses/download-permission";

/**
 * Compact icon download control for thesis listing surfaces (grid card, list
 * row, summary list). Unlike the old naked `<a href="/file?download=1">`, this
 * does NOT navigate the top window straight into the gated `/download` route —
 * which, for a signed-out or ineligible visitor, rendered the raw
 * `{"error":"AUTHENTICATION_REQUIRED"}` JSON in the browser.
 *
 * Instead it mirrors the detail page's ThesisDownloadButton: it runs the gated
 * download on click and, on any denial, routes the user gracefully — to sign-in
 * for AUTHENTICATION_REQUIRED, otherwise to the thesis detail page where the
 * full explanation + proper call-to-action live. The server-side permission
 * engine at `/download` remains the single enforcement point; this is purely UX.
 *
 * Done lazily on click (no upfront `/download-status` fetch) so a listing of
 * many cards does not fan out one request per card.
 */
export default function ThesisCardDownload({
  reportId,
  /** Unprefixed thesis detail path (e.g. `/theses/slug`); localized here. */
  thesisPath,
  label,
  className,
  iconClassName,
}: {
  reportId: string;
  thesisPath: string;
  label: string;
  className: string;
  iconClassName: string;
}) {
  const locale = useLocale();
  const [downloading, setDownloading] = useState(false);
  const inFlight = useRef(false);

  const detailPath = locale === "km" ? `/km${thesisPath}` : thesisPath;

  const onClick = useCallback(async () => {
    if (inFlight.current) return; // guard rapid double clicks
    inFlight.current = true;
    setDownloading(true);
    try {
      const res = await fetch(`/api/theses/${reportId}/download`, { cache: "no-store" });
      if (!res.ok) {
        let reason: ThesisDownloadReason = "FILE_UNAVAILABLE";
        try {
          const body = await res.json();
          reason = body?.reason ?? reason;
        } catch {
          /* non-JSON */
        }
        // Graceful routing instead of dumping the raw error page.
        if (reason === "AUTHENTICATION_REQUIRED") {
          window.location.href = `/auth/login?callbackUrl=${encodeURIComponent(detailPath)}`;
        } else {
          // PROFILE_INCOMPLETE / TOP_TEN_RESTRICTED / ADMIN_BLOCKED / etc. — the
          // detail page renders the specific state + next step.
          window.location.href = detailPath;
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
      // Network/unexpected failure — fall back to the detail page.
      window.location.href = detailPath;
    } finally {
      setDownloading(false);
      inFlight.current = false;
    }
  }, [reportId, detailPath]);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={downloading}
      aria-label={label}
      title={label}
      className={className}
    >
      {downloading ? (
        <Loader2 className={`${iconClassName} animate-spin`} aria-hidden />
      ) : (
        <Download className={iconClassName} aria-hidden />
      )}
    </button>
  );
}
