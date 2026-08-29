"use client";

// Security health for the selected range. Every number is a real decomposition
// of the SAME set the Security tab is drawn from — denied + failed + other
// always sums to tabCounts.security, so the panel can never disagree with the
// tab badge beside it.
//
// Each row is a control, not a caption: selecting one filters the activity list
// below to exactly the events the number counted. That is what makes this a
// dashboard rather than three widgets that happen to share a page.

import { useTranslations } from "next-intl";
import type { ActivitySecurityBreakdown } from "@/lib/admin/activity-log";
import { INK, INK2, INK3, LINE, LINE_SUBTLE, TONE, sectionTitle, ShieldIcon } from "./logs-ui";

export type SecurityDrill = { tab: "security"; status?: "denied" | "failed" | null };

export default function SecurityOverview({
  security,
  onDrill,
}: {
  security: ActivitySecurityBreakdown;
  onDrill: (drill: SecurityDrill) => void;
}) {
  const t = useTranslations("adminLogs");
  const clear = security.total === 0;

  const rows: Array<{ key: string; label: string; count: number; tone: keyof typeof TONE; drill: SecurityDrill }> = [
    { key: "denied", label: t("security.denied"), count: security.deniedDownloads, tone: "warning", drill: { tab: "security", status: "denied" } },
    { key: "failed", label: t("security.failed"), count: security.failedDownloads, tone: "danger", drill: { tab: "security", status: "failed" } },
    { key: "other", label: t("security.other"), count: security.otherSecurity, tone: "neutral", drill: { tab: "security", status: null } },
  ];

  return (
    <section className="dash-card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className={`dash-ico dash-ico--sm ${clear ? "dash-ico--emerald" : "dash-ico--gold"}`}>
          <ShieldIcon size={15} alert={!clear} />
        </span>
        <div style={{ minWidth: 0 }}>
          <h2 style={sectionTitle}>{t("security.title")}</h2>
          <p style={{ fontSize: 12, color: INK3, marginTop: 2 }}>
            {clear ? t("security.allClear") : t("security.totalAlerts", { count: security.total })}
          </p>
        </div>
      </header>

      {clear ? (
        <p style={{ fontSize: 12.5, color: INK3, lineHeight: 1.6, padding: "8px 0 4px" }}>{t("security.emptyBody")}</p>
      ) : (
        <>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            {rows.map((row) => {
              const tone = TONE[row.tone];
              const disabled = row.count === 0;
              return (
                <li key={row.key}>
                  <button
                    type="button"
                    onClick={() => onDrill(row.drill)}
                    disabled={disabled}
                    aria-label={t("security.drillLabel", { label: row.label, count: row.count })}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 10px", borderRadius: 9, border: "1px solid transparent",
                      background: disabled ? "transparent" : LINE_SUBTLE,
                      cursor: disabled ? "default" : "pointer", textAlign: "left",
                      opacity: disabled ? 0.55 : 1, fontFamily: "inherit",
                    }}
                  >
                    <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: tone.mark, flex: "none" }} />
                    <span style={{ flex: 1, fontSize: 13, color: INK2, minWidth: 0 }} className="dash-truncate">{row.label}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: INK, fontVariantNumeric: "tabular-nums" }}>
                      {row.count.toLocaleString()}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {(security.reasons.length > 0 || security.unspecified > 0) && (
            <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 12 }}>
              <h3 style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: INK3, marginBottom: 8 }}>
                {t("security.reasons")}
              </h3>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {security.reasons.map((r) => (
                  <li key={r.reason} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, fontSize: 12.5 }}>
                    <span style={{ color: INK2, minWidth: 0 }} className="dash-truncate">{t(`reason.${r.reason}`)}</span>
                    <span style={{ color: INK, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{r.count.toLocaleString()}</span>
                  </li>
                ))}
                {security.unspecified > 0 && (
                  <li style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, fontSize: 12.5 }}>
                    <span style={{ color: INK3, fontStyle: "italic", minWidth: 0 }} className="dash-truncate">{t("security.unspecified")}</span>
                    <span style={{ color: INK2, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{security.unspecified.toLocaleString()}</span>
                  </li>
                )}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
