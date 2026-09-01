"use client";

import { Fragment } from "react";
import { Check } from "lucide-react";
import type { UploadProgress as Transfer } from "@/lib/upload-progress";

/**
 * The progress panel for a multi-step admin upload (PDF → cover → save).
 *
 * It replaces two hand-rolled copies of the same stepper — one in the book
 * upload form, one in the book edit form — which differed only in tone and in
 * which of them used an icon for the tick. Both showed named steps and a
 * spinner whose label repeated the active step's label verbatim, so the busiest
 * row on the page said "Uploading PDF…" twice and answered nothing about *how
 * far in* the upload was. That is the question a librarian watching a 40 MB
 * file actually has, and `XMLHttpRequest` can answer it (see
 * `lib/upload-progress.ts`).
 *
 * Three signals, each carrying something the others do not:
 *
 *   the rail   — which of the named steps we are on, and which are behind us.
 *   the bar    — how much of the CURRENT step is done, determinate while bytes
 *                are moving and indeterminate while the server works, because
 *                a determinate bar parked at 99% reads as a hang.
 *   the readout— which file, how many megabytes of how many. Users upload the
 *                wrong file far more often than an upload fails.
 *
 * The rail's connectors fill from the same fraction as the bar, so the whole
 * panel moves as one thing rather than as a static diagram beside a bar.
 *
 * Motion is decorative here without exception: every state is legible with
 * `prefers-reduced-motion: reduce` collapsing all of it (`app/admin.css`).
 */

export type UploadStepDef = {
  /** Matches the caller's phase value. */
  id: string;
  label: string;
};

export type UploadProgressProps = {
  steps: readonly UploadStepDef[];
  /** The phase in flight, or null when nothing is. Null renders nothing. */
  currentId: string | null;
  /** Byte progress for the current step. Absent ⇒ indeterminate. */
  transfer?: Transfer | null;
  /** Name of the file being sent, shown beside the megabytes. */
  fileName?: string | null;
  /** Shown while the server is working on bytes it already has. */
  processingLabel: string;
  /** "{done} of {total}" — a function so the caller owns the translation. */
  transferredLabel?: (done: string, total: string) => string;
  /** "Step {current} of {total}: {label}" — the only thing announced aloud. */
  announceLabel?: (current: number, total: number, label: string) => string;
  /**
   * `accent` is the admin indigo (upload form); `info` matches the edit form's
   * existing panel surface. Both are token-driven — see `.upl` in admin.css.
   */
  tone?: "accent" | "info";
  className?: string;
};

function formatMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function UploadProgress({
  steps,
  currentId,
  transfer,
  fileName,
  processingLabel,
  transferredLabel = (done, total) => `${done} of ${total}`,
  announceLabel = (current, total, label) => `Step ${current} of ${total}: ${label}`,
  tone = "accent",
  className = "",
}: UploadProgressProps) {
  const index = currentId ? steps.findIndex((s) => s.id === currentId) : -1;
  if (index < 0) return null;

  /* Determinate only while bytes are actually moving and the browser told us
     how many there are. Everything else — the save step, a stalled length,
     server-side processing — is honestly unknown. */
  const measured =
    transfer != null && transfer.stage === "sending" && transfer.total > 0;
  const fraction = measured ? Math.min(1, Math.max(0, transfer.fraction)) : 0;
  const percent = Math.round(fraction * 100);

  return (
    <div
      data-tone={tone}
      className={`upl rounded-xl border border-[var(--upl-line)] bg-[var(--upl-soft)] px-4 py-3.5 ${className}`}
    >
      {/* The ONLY live region. Wrapping the whole panel — which is what both
          predecessors did — would make a screen reader read a new percentage
          several times a second. Step changes are three announcements total. */}
      <p className="sr-only" role="status" aria-live="polite">
        {announceLabel(index + 1, steps.length, steps[index].label)}
      </p>

      {/* ── Rail ── */}
      <div className="flex items-center gap-2">
        {steps.map((step, i) => {
          const done = i < index;
          const active = i === index;
          /* The connector before step i belongs to step i-1's transition, so
             it fills from that step's progress — not from this one's. */
          const previous = i - 1;
          const linkFill =
            previous < index ? 1 : previous === index ? fraction : 0;

          return (
            <Fragment key={step.id}>
              {i > 0 && (
                <span
                  className="relative h-[3px] min-w-4 flex-1 overflow-hidden rounded-full bg-[var(--upl-line)]"
                  aria-hidden="true"
                >
                  <span
                    className={`upl-link-fill absolute inset-y-0 left-0 rounded-full ${
                      previous < index ? "bg-success" : "bg-[var(--upl-accent)]"
                    } ${previous === index ? "upl-sheen" : ""}`}
                    style={{ width: `${linkFill * 100}%` }}
                  />
                </span>
              )}
              <span className="flex shrink-0 items-center gap-1.5">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold transition-colors duration-300 ${
                    done
                      ? "bg-success text-white"
                      : active
                        ? "upl-dot--active bg-[var(--upl-accent)] text-white"
                        : "bg-bg-surface text-text-muted ring-1 ring-inset ring-[var(--upl-line)]"
                  }`}
                  aria-hidden="true"
                >
                  {done ? <Check className="upl-check h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
                </span>
                <span
                  className={`text-xs font-semibold transition-colors duration-300 ${
                    active ? "text-[var(--upl-text)]" : done ? "text-success-text" : "text-text-muted"
                  }`}
                >
                  {step.label}
                </span>
              </span>
            </Fragment>
          );
        })}
      </div>

      {/* ── Bar ── */}
      <div
        role="progressbar"
        aria-label={steps[index].label}
        {...(measured
          ? { "aria-valuenow": percent, "aria-valuemin": 0, "aria-valuemax": 100 }
          : {})}
        className={`upl-bar mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--upl-line)] ${
          measured ? "" : "upl-bar--indeterminate"
        }`}
      >
        <span
          /* Keyed on the step: a new step starts its fill at its own width
             rather than animating backwards from the previous step's 100%. */
          key={currentId}
          className={`upl-fill relative block h-full rounded-full bg-[var(--upl-accent)] ${
            measured ? "upl-sheen" : ""
          }`}
          style={measured ? { width: `${fraction * 100}%` } : undefined}
        />
      </div>

      {/* ── Readout ── */}
      <div className="mt-2 flex items-baseline justify-between gap-3 text-[11px] font-medium text-text-muted">
        <span className="min-w-0 truncate">
          {fileName && <span className="text-text-body">{fileName}</span>}
          {fileName && measured && <span aria-hidden="true"> · </span>}
          {measured && transferredLabel(formatMb(transfer!.loaded), formatMb(transfer!.total))}
        </span>
        <span className="shrink-0 tabular-nums text-[var(--upl-text)]">
          {measured ? `${percent}%` : processingLabel}
        </span>
      </div>
    </div>
  );
}
