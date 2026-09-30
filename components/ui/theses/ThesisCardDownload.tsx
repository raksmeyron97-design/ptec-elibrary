"use client";

import { useCallback, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { Download, Loader2 } from "lucide-react";
import { downloadThesisPdf } from "@/lib/theses/download-client";

/**
 * Compact icon download control for thesis listing surfaces (grid card, list
 * row, summary list). Unlike the old naked `<a href="/file?download=1">`, this
 * does NOT navigate the top window straight into the gated `/download` route —
 * which, for a signed-out or ineligible visitor, rendered the raw
 * `{"error":"AUTHENTICATION_REQUIRED"}` JSON in the browser.
 *
 * Instead it runs the gated download on click (lib/theses/download-client.ts,
 * the same routine as the record page's access panel) and, on any denial,
 * routes the user gracefully — to sign-in for AUTHENTICATION_REQUIRED,
 * otherwise to the thesis detail page where the full explanation + proper
 * call-to-action live. The server-side permission
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
      const result = await downloadThesisPdf(reportId);
      if (result.ok) return;
      // Graceful routing instead of dumping the raw error page.
      if (result.reason === "AUTHENTICATION_REQUIRED") {
        window.location.href = `/auth/login?callbackUrl=${encodeURIComponent(detailPath)}`;
      } else {
        // PROFILE_INCOMPLETE / TOP_TEN_RESTRICTED / ADMIN_BLOCKED / a network
        // failure — the detail page renders the specific state + next step.
        window.location.href = detailPath;
      }
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
