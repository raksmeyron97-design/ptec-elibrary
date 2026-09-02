"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import type { PreflightReport, PreflightTone } from "@/lib/books/upload-preflight";

/**
 * The "ready to upload" summary. Presentation only — every rule it displays is
 * decided by lib/books/upload-preflight.ts, which is unit-tested.
 *
 * It reads as a checklist rather than a score, because a librarian's next
 * action has to be obvious from it: a red line names the one thing preventing
 * the save, and an amber line names something they may knowingly accept.
 */

const TONE_ICON: Record<PreflightTone, typeof CheckCircle2> = {
  pass: CheckCircle2,
  warn: AlertTriangle,
  fail: XCircle,
  pending: Loader2,
};

const TONE_COLOR: Record<PreflightTone, string> = {
  pass: "text-success",
  warn: "text-warning",
  fail: "text-danger",
  pending: "text-text-muted",
};

export default function PreflightPanel({
  report,
  className = "",
}: {
  report: PreflightReport;
  className?: string;
}) {
  const t = useTranslations("adminUpload.preflight");

  const heading = report.blocked
    ? t("heading.blocked")
    : report.ready
      ? t("heading.ready")
      : t("heading.pending");

  return (
    <section
      aria-labelledby="upload-preflight-heading"
      className={`overflow-hidden rounded-2xl border border-divider bg-bg-surface ${className}`}
    >
      <div className="border-b border-divider bg-paper px-5 py-3.5">
        <h3 id="upload-preflight-heading" className="text-sm font-semibold text-text-heading">
          {heading}
        </h3>
        <p className="mt-0.5 text-xs text-text-muted">
          {report.warnings > 0 ? t("subWithWarnings", { count: report.warnings }) : t("sub")}
        </p>
      </div>

      <ul className="divide-y divide-divider">
        {report.checks.map((check) => {
          const Icon = check.tone === "pending" ? Loader2 : TONE_ICON[check.tone];
          return (
            <li key={`${check.id}-${check.messageKey}`} className="flex items-start gap-2.5 px-5 py-2.5">
              {check.tone === "pending" ? (
                <Loader2
                  className={`mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none ${TONE_COLOR.pending}`}
                  aria-hidden="true"
                />
              ) : (
                <Icon
                  className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${TONE_COLOR[check.tone]}`}
                  aria-hidden="true"
                />
              )}
              <span className="min-w-0 text-xs leading-5 text-text-body">
                {t(`check.${check.messageKey}` as "check.pdf.ready", check.values)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
