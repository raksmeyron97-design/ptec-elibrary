"use client";

// Page header + the two page-level actions.
//
// The status pill used to read "Auto-refresh on". Nothing on this page polls,
// revalidates on an interval, or subscribes to anything — data arrives when the
// server component re-runs, i.e. when you change a filter or press Refresh. The
// pill now says what actually happened ("Updated 20:14") and what is happening
// ("Updating…"), which is the only claim the implementation supports.

import { useTranslations } from "next-intl";
import { INK, INK2, INK3, LINE, SURFACE, TONE, btnPrimary, btnSecondary, eyebrow, srOnly, ExportIcon, RefreshIcon } from "./logs-ui";

export type ExportState = "idle" | "busy" | "done" | "empty" | "error";

export default function LogsHeader({
  rangeLabel, updatedAt, pending, exportState, onRefresh, onExport,
}: {
  rangeLabel: string;
  updatedAt: string | null;
  pending: boolean;
  exportState: ExportState;
  onRefresh: () => void;
  onExport: () => void;
}) {
  const t = useTranslations("adminLogs");

  const feedback =
    exportState === "done" ? { text: t("exportDone"), tone: TONE.success.text }
    : exportState === "empty" ? { text: t("exportEmpty"), tone: TONE.warning.text }
    : exportState === "error" ? { text: t("exportError"), tone: TONE.danger.text }
    : null;

  return (
    <header className="dash-header" style={{ padding: "18px 20px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 240, flex: "1 1 320px" }}>
        <span style={eyebrow}>{t("eyebrow")}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-.025em", color: INK, lineHeight: 1.2 }}>{t("title")}</h1>
          <span
            aria-live="polite"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px",
              background: SURFACE, border: `1px solid ${LINE}`, borderRadius: 99,
              fontSize: 11.5, fontWeight: 600, color: INK2, whiteSpace: "nowrap",
            }}
          >
            <span aria-hidden style={{ width: 6, height: 6, borderRadius: 99, flex: "none", background: pending ? TONE.warning.mark : TONE.success.mark }} />
            {pending ? t("state.updating") : updatedAt ? t("state.updated", { time: updatedAt }) : t("state.manual")}
          </span>
        </div>
        <p style={{ fontSize: 13.5, color: INK2, maxWidth: 620, lineHeight: 1.6 }}>{t("subtitle")}</p>
        <p style={{ fontSize: 12.5, color: INK3 }}>{t("showingRange", { range: rangeLabel })}</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={onRefresh} disabled={pending} style={{ ...btnSecondary, opacity: pending ? 0.6 : 1 }}>
            <span className={pending ? "logs-spin" : undefined} style={{ display: "flex" }}><RefreshIcon /></span>
            {pending ? t("refreshing") : t("refresh")}
          </button>
          <button type="button" onClick={onExport} disabled={exportState === "busy"} style={{ ...btnPrimary, opacity: exportState === "busy" ? 0.7 : 1 }}>
            <ExportIcon />
            {exportState === "busy" ? t("exporting") : t("exportCsv")}
          </button>
        </div>
        {/* Announced, not just tinted — an export result the reader misses is
            indistinguishable from an export that never ran. */}
        <p role="status" aria-live="polite" style={{ fontSize: 11.5, fontWeight: 600, minHeight: 16, color: feedback?.tone ?? "transparent" }}>
          {feedback?.text ?? ""}
          {exportState === "error" ? <button type="button" onClick={onExport} style={{ marginInlineStart: 6, background: "none", border: "none", padding: 0, font: "inherit", color: TONE.danger.text, textDecoration: "underline", cursor: "pointer" }}>{t("exportRetry")}</button> : null}
        </p>
        <span style={srOnly}>{t("exportScopeHint")}</span>
      </div>
    </header>
  );
}
