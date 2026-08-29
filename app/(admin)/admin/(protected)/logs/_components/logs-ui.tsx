"use client";

// Shared presentational primitives for /admin/logs.
//
// Every colour here is a TOKEN, never a literal. The page used to carry its own
// private palette (#eef2ff / #b45309 / #e9ebf0 …) which is why it never quite
// looked like the rest of the admin panel: the dashboard next door draws from
// app/admin.css (`--dash-*`) and globals.css (`--ptec-{status}-*`). Same source
// now, so a palette change reaches this page too.

import type { ActivityEvent, EventStatus, ResourceType } from "@/lib/admin/activity-log-shared";

export const FONT = "'Inter Tight', 'Inter', system-ui, sans-serif";
export const INK = "var(--dash-ink)";
export const INK2 = "var(--dash-ink-2)";
export const INK3 = "var(--dash-ink-3)";
export const DECOR = "var(--dash-ink-decorative)";
export const LINE = "var(--dash-line)";
export const LINE_SUBTLE = "var(--dash-line-subtle)";
export const SURFACE = "var(--dash-surface)";

export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

/** Soft surface / hairline / readable text / solid mark, per semantic tone.
 *  `mark` is the only value used for non-text marks (dots, bars, lines). */
export const TONE: Record<Tone, { soft: string; line: string; text: string; mark: string }> = {
  success: { soft: "var(--ptec-success-soft)", line: "var(--ptec-success-line)", text: "var(--ptec-success-text)", mark: "var(--ptec-success)" },
  warning: { soft: "var(--ptec-warning-soft)", line: "var(--ptec-warning-line)", text: "var(--ptec-warning-text)", mark: "var(--ptec-warning)" },
  danger: { soft: "var(--ptec-danger-soft)", line: "var(--ptec-danger-line)", text: "var(--ptec-danger-text)", mark: "var(--ptec-danger)" },
  info: { soft: "var(--ptec-info-soft)", line: "var(--ptec-info-line)", text: "var(--ptec-info-text)", mark: "var(--ptec-info)" },
  neutral: { soft: LINE_SUBTLE, line: LINE, text: INK2, mark: INK3 },
};

/**
 * Status → tone. `authorized` is INFO, not success, and that is deliberate:
 * the system knows the request was authorized and delivery started, not that a
 * file arrived. Painting it green would say "completed" in colour while the
 * label says "authorized" — the honest reading is "decided, in your favour".
 */
export const STATUS_TONE: Record<EventStatus, Tone> = {
  authorized: "info",
  success: "success",
  denied: "warning",
  failed: "danger",
};

/** The three charted measures. Series colours come from the dashboard's
 *  validated categorical palette; security borrows the semantic danger token
 *  because it is a state, not a category. */
export const SERIES = {
  views: "var(--ptec-series-views)",
  downloads: "var(--ptec-series-downloads)",
  security: "var(--ptec-danger)",
} as const;

export const SERIES_INK = {
  views: "var(--ptec-series-views-ink)",
  downloads: "var(--ptec-series-downloads-ink)",
  security: "var(--ptec-danger)",
} as const;

/**
 * Human verb for a row, derived from the (type, status) pair rather than shown
 * as the raw `eventType`. "Download / denied" across two columns makes an
 * administrator assemble the sentence; "Blocked" states it.
 */
export function actionKey(e: Pick<ActivityEvent, "eventType" | "eventStatus">): string {
  if (e.eventType === "download") {
    if (e.eventStatus === "denied") return "blocked";
    if (e.eventStatus === "failed") return "failed";
    return "downloaded";
  }
  if (e.eventType === "view") return "viewed";
  if (e.eventType === "admin") return "admin";
  if (e.eventType === "security") return "security";
  return "account";
}

// ── badges ───────────────────────────────────────────────────────────────────

/** Status pill. The dot is a redundant mark, never the message: the label is
 *  always present, so the badge survives greyscale and forced-colors. */
export function StatusBadge({ status, label, size = "md" }: { status: EventStatus; label: string; size?: "sm" | "md" }) {
  const tone = TONE[STATUS_TONE[status] ?? "neutral"];
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
        fontSize: size === "sm" ? 11 : 11.5, fontWeight: 600, lineHeight: 1.45,
        padding: size === "sm" ? "2px 7px" : "3px 9px", borderRadius: 6,
        background: tone.soft, color: tone.text, border: `1px solid ${tone.line}`,
      }}
    >
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: 99, background: tone.mark, flex: "none" }} />
      {label}
    </span>
  );
}

/**
 * Resource type marker. Deliberately monochrome: status already spends colour,
 * and a second coloured badge per row turns the table into confetti. Type is
 * carried by the word, which is what a reader scans for anyway.
 */
export function ResourceBadge({ label }: { type?: ResourceType; label: string }) {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", whiteSpace: "nowrap",
        fontSize: 10, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase",
        padding: "2px 6px", borderRadius: 5, background: LINE_SUBTLE, color: INK3,
        border: `1px solid ${LINE}`,
      }}
    >
      {label}
    </span>
  );
}

// ── shared inline styles ─────────────────────────────────────────────────────

export const srOnly: React.CSSProperties = {
  position: "absolute", width: 1, height: 1, padding: 0, margin: -1,
  overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0,
};

const btnBase: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
  height: 38, padding: "0 15px", borderRadius: 10, fontFamily: FONT,
  fontSize: 13.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
  transition: "background-color .15s ease, border-color .15s ease, opacity .15s ease",
};
export const btnSecondary: React.CSSProperties = {
  ...btnBase, background: SURFACE, border: `1px solid ${LINE}`, color: INK2,
};
export const btnPrimary: React.CSSProperties = {
  ...btnBase, background: "var(--dash-blue)", border: "1px solid var(--dash-blue)", color: "#fff",
};
export const btnGhost: React.CSSProperties = {
  ...btnBase, height: 32, padding: "0 10px", background: "transparent",
  border: "1px solid transparent", color: INK2, fontSize: 12.5,
};

export const eyebrow: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, letterSpacing: ".11em",
  textTransform: "uppercase", color: "var(--dash-gold-ink)",
};

export const sectionTitle: React.CSSProperties = {
  fontSize: 15, fontWeight: 700, letterSpacing: "-.01em", color: INK,
};

// ── icons (stroke-only, inherit currentColor) ────────────────────────────────

type IconProps = { size?: number };
const svg = (size: number) => ({
  width: size, height: size, viewBox: "0 0 24 24", fill: "none",
  stroke: "currentColor", strokeWidth: 2,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  "aria-hidden": true, focusable: false as const,
});

export function DownloadIcon({ size = 14 }: IconProps) { return <svg {...svg(size)}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>; }
export function EyeIcon({ size = 14 }: IconProps) { return <svg {...svg(size)}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>; }
export function UsersIcon({ size = 14 }: IconProps) { return <svg {...svg(size)}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></svg>; }
export function ShieldIcon({ size = 14, alert = false }: IconProps & { alert?: boolean }) { return <svg {...svg(size)}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />{alert ? <path d="M12 8v4M12 16h.01" /> : <path d="m9 12 2 2 4-4" />}</svg>; }
export function RefreshIcon({ size = 15 }: IconProps) { return <svg {...svg(size)}><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></svg>; }
export function ExportIcon({ size = 15 }: IconProps) { return <svg {...svg(size)}><path d="M12 3v12" /><path d="m8 11 4 4 4-4" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>; }
export function SearchIcon({ size = 15 }: IconProps) { return <svg {...svg(size)}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>; }
export function CalendarIcon({ size = 15 }: IconProps) { return <svg {...svg(size)}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 11h18" /></svg>; }
export function CloseIcon({ size = 15 }: IconProps) { return <svg {...svg(size)}><path d="M18 6 6 18M6 6l12 12" /></svg>; }
export function ChevronIcon({ size = 15, dir = "right" }: IconProps & { dir?: "left" | "right" }) { return <svg {...svg(size)} style={{ transform: dir === "left" ? "rotate(180deg)" : undefined }}><path d="m9 18 6-6-6-6" /></svg>; }
export function BarsIcon({ size = 14 }: IconProps) { return <svg {...svg(size)}><path d="M3 21h18" /><path d="M7 21V9M12 21V4M17 21v-7" /></svg>; }
export function ActivityIcon({ size = 14 }: IconProps) { return <svg {...svg(size)}><path d="M3 12h4l3 8 4-16 3 8h4" /></svg>; }
