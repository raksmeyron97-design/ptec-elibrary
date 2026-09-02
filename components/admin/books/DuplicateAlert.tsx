"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  HelpCircle,
  Info,
  Loader2,
  Search,
} from "lucide-react";
import { EBOOKS_DUPLICATES_PATH } from "@/lib/admin/ebooks-url";
import type { DuplicateMatch } from "@/lib/books/duplicate-detection/signals";
import type { DuplicateCheckSnapshot } from "./use-duplicate-check";

/**
 * What the librarian is told about the collection, before anything is uploaded.
 *
 * THREE STATES, THREE MEANINGS. The panel is deliberately not one warning with
 * a variable colour:
 *
 *   * BLOCKED — an identifier says this is the same object. The save is
 *     refused server-side regardless of what this component renders, so the
 *     panel's job is to explain and to offer the existing record.
 *   * STRONG — the same work, on the balance of title/author/year evidence.
 *     Actionable, never blocking, and "this is a different edition" is a real
 *     answer the form carries through to the save.
 *   * POSSIBLE — worth a glance. One line, no ceremony.
 *
 * It also renders the two states most duplicate UIs forget: "we are still
 * looking" and "we could not look". A silent panel after a failed check reads
 * as a clean result, which is the one lie a duplicate gate must not tell.
 *
 * No string in this file is hard-coded English — every label comes through
 * next-intl, and the detector emits reason CODES precisely so this is possible.
 */

export type DuplicateOverride = { acknowledgedBookId: string; reason: string } | null;

const CONFIDENCE_ICON = {
  exact: AlertOctagon,
  high: AlertTriangle,
  medium: Info,
  low: Info,
} as const;

function MatchRow({ match, showReasons }: { match: DuplicateMatch; showReasons: boolean }) {
  const t = useTranslations("adminUpload.duplicates");
  const statusKey =
    match.status === "pending_review"
      ? "pending"
      : match.status === "archived"
        ? "archived"
        : match.isPublished
          ? "published"
          : "draft";

  return (
    <li className="rounded-lg border border-divider bg-bg-surface p-3">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text-heading" title={match.title}>
            {match.title}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            {[match.author, match.year ? String(match.year) : null, match.isbn]
              .filter(Boolean)
              .join(" · ") || t("noMetadata")}
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-divider px-2 py-0.5 text-xs font-medium text-text-body">
          {t(`status.${statusKey}` as "status.published")}
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{t("similarity", { score: match.score })}</span>
        </span>
      </div>

      {showReasons && match.reasons.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {match.reasons.map((reason) => {
            const against = reason.startsWith("different");
            return (
              <li key={reason}>
                <span
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${
                    against
                      ? "border-info-line bg-info-soft text-info-text"
                      : "border-divider bg-paper text-text-body"
                  }`}
                >
                  {against ? (
                    <HelpCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3 shrink-0 text-success" aria-hidden="true" />
                  )}
                  {t(`reason.${reason}` as "reason.sameIsbn")}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Link
          href={`/admin/edit/${match.bookId}`}
          className="focus-field inline-flex items-center gap-1 rounded text-xs font-semibold text-brand transition-colors hover:text-brand-hover"
        >
          {t("openRecord")}
        </Link>
        {match.slug && match.isPublished && (
          <a
            href={`/books/${match.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="focus-field inline-flex items-center gap-1 rounded text-xs font-semibold text-text-muted transition-colors hover:text-text-body"
          >
            {t("viewPublic")}
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        )}
      </div>
    </li>
  );
}

export default function DuplicateAlert({
  snapshot,
  override,
  onOverrideChange,
  className = "",
}: {
  snapshot: DuplicateCheckSnapshot;
  /** The acknowledgement carried to the server, when the librarian says the
   *  blocking match is a different edition. */
  override: DuplicateOverride;
  onOverrideChange: (next: DuplicateOverride) => void;
  className?: string;
}) {
  const t = useTranslations("adminUpload.duplicates");
  const [expanded, setExpanded] = useState(false);

  if (snapshot.state === "idle") return null;

  if (snapshot.state === "checking") {
    return (
      <p
        role="status"
        className={`flex items-center gap-2 text-xs font-medium text-text-muted ${className}`}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        {t("checking")}
      </p>
    );
  }

  if (snapshot.state === "error" || !snapshot.result) {
    return (
      <div
        role="alert"
        className={`flex items-start gap-3 rounded-xl border border-warning-line bg-warning-soft px-4 py-3 ${className}`}
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-warning-text">{t("unavailable.title")}</p>
          <p className="mt-0.5 text-xs text-text-body">{t("unavailable.body")}</p>
          {snapshot.error && <p className="mt-1 text-xs text-text-muted">{snapshot.error}</p>}
        </div>
      </div>
    );
  }

  const { matches, top, blocked } = snapshot.result;

  if (!top) {
    return (
      <p
        role="status"
        className={`flex items-center gap-2 text-xs font-medium text-success-text ${className}`}
      >
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {t("clean")}
      </p>
    );
  }

  const tone = blocked ? "danger" : top.confidence === "high" ? "warning" : "info";
  const Icon = CONFIDENCE_ICON[top.confidence];
  const overridable = blocked && !top.signals.includes("content_hash");
  const overrideActive = Boolean(override && override.acknowledgedBookId === top.bookId);

  const shell =
    tone === "danger"
      ? "border-danger-line bg-danger-soft"
      : tone === "warning"
        ? "border-warning-line bg-warning-soft"
        : "border-info-line bg-info-soft";
  const heading =
    tone === "danger" ? "text-danger-text" : tone === "warning" ? "text-warning-text" : "text-info-text";
  const iconColor = tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-info";

  const headline = blocked
    ? top.signals.includes("content_hash")
      ? t("blocked.file")
      : t("blocked.isbn")
    : top.confidence === "high"
      ? t("strong.lead")
      : t("possible.lead");

  const title = blocked
    ? t("blocked.title")
    : top.confidence === "high"
      ? t("strong.title")
      : t("possible.title");

  return (
    <section
      // A block is an assertive interruption; a warning is not. Announcing
      // every debounced "possible duplicate" over a screen reader while the
      // librarian is still typing the title would make the form unusable.
      role={blocked ? "alert" : "status"}
      aria-live={blocked ? "assertive" : "polite"}
      className={`rounded-xl border ${shell} ${className}`}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${heading}`}>{title}</p>
          <p className="mt-0.5 text-sm text-text-body">{headline}</p>

          {!blocked && (
            <p className="mt-1 text-xs text-text-muted">
              {t("matchCount", { count: matches.length })} · {t("similarity", { score: top.score })}
            </p>
          )}

          {/* Same title is not the same book. Said once, where the decision is
              made, rather than left for the librarian to remember. */}
          {!blocked && top.reasons.some((r) => r.startsWith("different")) && (
            <p className="mt-1.5 text-xs text-text-body">{t("editionNote")}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
              className="focus-field inline-flex items-center gap-1 rounded text-xs font-semibold text-text-body transition-colors hover:text-text-heading"
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
              {expanded ? t("collapse") : t("expand", { count: matches.length })}
            </button>

            <Link
              href={EBOOKS_DUPLICATES_PATH}
              className="focus-field inline-flex items-center gap-1 rounded text-xs font-semibold text-text-muted transition-colors hover:text-text-body"
            >
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              {t("reviewQueue")}
            </Link>
          </div>

          {expanded && (
            <ul className="mt-3 space-y-2">
              {matches.map((match) => (
                <MatchRow key={match.bookId} match={match} showReasons />
              ))}
            </ul>
          )}

          {!expanded && (
            <ul className="mt-3 space-y-2">
              <MatchRow match={top} showReasons={blocked || top.confidence === "high"} />
            </ul>
          )}

          {/* The override. Only ever offered for an ISBN collision: a
              byte-identical PDF has no second record to make, and the server
              refuses that one whatever this component renders. */}
          {overridable && (
            <div className="mt-3 rounded-lg border border-divider bg-bg-surface p-3">
              <label className="focus-shell flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={overrideActive}
                  onChange={(event) =>
                    onOverrideChange(
                      event.target.checked
                        ? { acknowledgedBookId: top.bookId, reason: "different_edition" }
                        : null,
                    )
                  }
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--ptec-brand)]"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-text-heading">
                    {t("override.label")}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-text-muted">
                    {t("override.hint")}
                  </span>
                </span>
              </label>
            </div>
          )}

          {overrideActive && (
            <p className="mt-2 text-xs font-medium text-warning-text">{t("override.active")}</p>
          )}
        </div>
      </div>
    </section>
  );
}
