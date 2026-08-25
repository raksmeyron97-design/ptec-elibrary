"use client";

import { AlertCircle, AlertTriangle, CheckCircle2, Info, type LucideIcon } from "lucide-react";

export type ReviewTone = "blocking" | "warning" | "recommendation";

export type ReviewFinding = {
  /** Stable key — a rule code, not the message, so wording can change freely. */
  id: string;
  message: string;
  /** Where the reader is sent to fix it. Omit for a finding with no single home. */
  onNavigate?: () => void;
  /** Short label for the destination, e.g. "Basic info". */
  navigateLabel?: string;
};

const TONE: Record<ReviewTone, {
  title: string;
  intro: string;
  icon: LucideIcon;
  ring: string;
  chipBg: string;
  countText: string;
  iconColor: string;
}> = {
  blocking: {
    title: "Blocking",
    intro: "Must be fixed before this can be published.",
    icon: AlertCircle,
    ring: "border-danger-line",
    chipBg: "bg-danger-soft",
    countText: "text-danger-text",
    iconColor: "text-danger",
  },
  warning: {
    title: "Warnings",
    intro: "Publishing is possible, but these look like mistakes.",
    icon: AlertTriangle,
    ring: "border-warning-line",
    chipBg: "bg-warning-soft",
    countText: "text-warning-text",
    iconColor: "text-warning",
  },
  recommendation: {
    title: "Recommendations",
    intro: "Optional improvements for discovery and readers.",
    icon: Info,
    ring: "border-info-line",
    chipBg: "bg-info-soft",
    countText: "text-info-text",
    iconColor: "text-info",
  },
};

const ORDER: ReviewTone[] = ["blocking", "warning", "recommendation"];

/**
 * Mission control for a Review tab: one verdict, three panels, every finding a
 * link to the field that resolves it.
 *
 * Shared across forms because the shape of the question is identical everywhere
 * — "can this go live, and if not, what exactly is in the way" — while the rules
 * behind it are per-resource. Callers pass findings already grouped; nothing here
 * knows what a publication or a thesis is.
 *
 * The verdict banner is the point. The old panel opened with three collapsed
 * groups and left the reader to add up whether they were clear to publish; the
 * one thing they came to this tab to learn was the one thing it did not say.
 */
export default function ReviewDashboard({
  findings,
  verdictReady,
  readyTitle,
  readyBody,
  blockedTitle,
  children,
}: {
  findings: Record<ReviewTone, ReviewFinding[]>;
  /** True when nothing blocks publishing. Server re-validates regardless. */
  verdictReady: boolean;
  readyTitle: string;
  readyBody: string;
  blockedTitle: string;
  /** Publish controls, rendered under the panels. */
  children?: React.ReactNode;
}) {
  const counts = ORDER.map((tone) => findings[tone].length);
  const [blocking] = counts;
  const total = counts.reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-5">
      {/* ── Verdict ─────────────────────────────────────────────────────── */}
      <div
        role="status"
        aria-live="polite"
        className={`flex flex-wrap items-start gap-3 rounded-xl border p-4 ${
          verdictReady ? "border-success-line bg-success-soft" : "border-danger-line bg-danger-soft"
        }`}
      >
        {verdictReady ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
        ) : (
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-bold ${verdictReady ? "text-success-text" : "text-danger-text"}`}>
            {verdictReady ? readyTitle : blockedTitle}
          </p>
          <p className={`mt-0.5 text-xs ${verdictReady ? "text-success-text/80" : "text-danger-text/80"}`}>
            {verdictReady
              ? readyBody
              : `${blocking} ${blocking === 1 ? "item" : "items"} must be resolved first.`}
          </p>
        </div>

        {/* Scoreboard. Present even at zero, so the three numbers stay in the
            same place run to run and the reader compares position, not labels. */}
        <div className="flex shrink-0 items-center gap-2">
          {ORDER.map((tone, i) => {
            const t = TONE[tone];
            return (
              <span
                key={tone}
                className={`inline-flex min-w-[3.25rem] flex-col items-center rounded-lg border px-2 py-1 ${t.ring} ${t.chipBg}`}
              >
                <span className={`text-base font-bold tabular-nums leading-none ${t.countText}`}>
                  {counts[i]}
                </span>
                <span className={`mt-0.5 text-[10px] font-semibold uppercase tracking-wide ${t.countText}/80`}>
                  {t.title}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      {/* ── Panels ──────────────────────────────────────────────────────── */}
      {total === 0 ? (
        <p className="rounded-xl border border-dashed border-divider px-4 py-8 text-center text-sm text-text-muted">
          Nothing outstanding. Every check passed.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 min-[1440px]:grid-cols-1">
          {ORDER.map((tone) => {
            const items = findings[tone];
            if (items.length === 0) return null;
            const t = TONE[tone];
            return (
              <section key={tone} className={`rounded-xl border ${t.ring} bg-bg-surface`}>
                <div className={`flex items-start gap-2 rounded-t-xl border-b px-4 py-2.5 ${t.ring} ${t.chipBg}`}>
                  <t.icon className={`mt-0.5 h-4 w-4 shrink-0 ${t.iconColor}`} aria-hidden="true" />
                  <div className="min-w-0">
                    <h3 className={`text-sm font-bold ${t.countText}`}>
                      {t.title} · {items.length}
                    </h3>
                    <p className={`text-xs ${t.countText}/80`}>{t.intro}</p>
                  </div>
                </div>
                <ul className="divide-y divide-divider">
                  {items.map((item) => (
                    <li key={item.id}>
                      {item.onNavigate ? (
                        <button
                          type="button"
                          onClick={item.onNavigate}
                          className="focus-field flex w-full items-start justify-between gap-3 px-4 py-2.5 text-left transition hover:bg-paper"
                        >
                          <span className="min-w-0 text-[13px] leading-[1.6] text-text-body">
                            {item.message}
                          </span>
                          {item.navigateLabel && (
                            <span className="shrink-0 whitespace-nowrap text-[11px] font-semibold text-admin-accent-text">
                              {item.navigateLabel} →
                            </span>
                          )}
                        </button>
                      ) : (
                        <p className="px-4 py-2.5 text-[13px] leading-[1.6] text-text-body">{item.message}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {children}
    </div>
  );
}
