"use client";

// The four measures, each stated with its MEANING and its SCOPE.
//
// There is deliberately no "+12.4%" here. The query service resolves one date
// window and never fetches a comparison period, so any trend figure on this
// page would be invented. The honest context is the range the number was
// counted over, which is what the third line says.
//
// "Authorized downloads" is likewise not softened to "Downloads": the system
// knows delivery was authorized and started, not that a file completed.

import { useTranslations } from "next-intl";
import type { ActivitySummary } from "@/lib/admin/activity-log";
import { INK, INK2, INK3, TONE, DownloadIcon, EyeIcon, ShieldIcon, UsersIcon } from "./logs-ui";

export default function LogsKpiGrid({
  summary,
  rangeLabel,
  onSecurityDrill,
}: {
  summary: ActivitySummary;
  rangeLabel: string;
  onSecurityDrill: () => void;
}) {
  const t = useTranslations("adminLogs");
  const alerts = summary.securityAlerts;

  const cards = [
    { key: "authorizedDownloads", value: summary.authorizedDownloads, meaning: t("kpi.downloadsMeaning"), accent: "dash-kpi--downloads", tile: "dash-ico--downloads", icon: <DownloadIcon size={16} /> },
    { key: "pageViews", value: summary.pageViews, meaning: t("kpi.viewsMeaning"), accent: "dash-kpi--views", tile: "dash-ico--views", icon: <EyeIcon size={16} /> },
    { key: "activeReaders", value: summary.activeUsers, meaning: t("kpi.readersMeaning"), accent: "dash-kpi--visitors", tile: "dash-ico--visitors", icon: <UsersIcon size={16} /> },
  ] as const;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14 }}>
      {cards.map((c) => (
        <article key={c.key} className={`dash-card dash-kpi ${c.accent}`} style={cardStyle}>
          <Head label={t(`cards.${c.key}`)} tile={c.tile} icon={c.icon} />
          <Value value={c.value} sr={t(`cards.sr${c.key[0].toUpperCase()}${c.key.slice(1)}`, { count: c.value })} />
          <Foot meaning={c.meaning} scope={t("kpi.contextRange", { range: rangeLabel })} />
        </article>
      ))}

      {/* Security is a control: the number is the entry point to the
          investigation, so selecting the card filters the list below to it. */}
      <button
        type="button"
        onClick={onSecurityDrill}
        disabled={alerts === 0}
        className={`dash-card dash-kpi ${alerts > 0 ? "dash-kpi--crit" : "dash-kpi--ok"} ${alerts > 0 ? "dash-card--interactive" : ""}`}
        style={{ ...cardStyle, textAlign: "left", fontFamily: "inherit", cursor: alerts > 0 ? "pointer" : "default" }}
        aria-label={t("cards.srSecurityAlerts", { count: alerts })}
      >
        <Head label={t("cards.securityAlerts")} tile={alerts > 0 ? "dash-ico--gold" : "dash-ico--emerald"} icon={<ShieldIcon size={16} alert={alerts > 0} />} />
        <Value value={alerts} />
        <Foot
          meaning={t("kpi.securityMeaning")}
          scope={alerts > 0 ? t("kpi.needsReview") : t("kpi.allClear")}
          scopeTone={alerts > 0 ? TONE.warning.text : TONE.success.text}
        />
      </button>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  padding: "16px 16px 14px",
  display: "flex",
  flexDirection: "column",
  gap: 9,
  minWidth: 0,
};

function Head({ label, tile, icon }: { label: string; tile: string; icon: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: INK2, minWidth: 0 }} className="dash-truncate">{label}</span>
      <span className={`dash-ico dash-ico--sm ${tile}`}>{icon}</span>
    </div>
  );
}

function Value({ value, sr }: { value: number; sr?: string }) {
  return (
    <span style={{ position: "relative", fontSize: 30, fontWeight: 700, letterSpacing: "-.025em", color: INK, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
      {value.toLocaleString()}
      {sr ? <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>{sr}</span> : null}
    </span>
  );
}

function Foot({ meaning, scope, scopeTone }: { meaning: string; scope: string; scopeTone?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 1 }}>
      <span style={{ fontSize: 12, color: INK2, lineHeight: 1.5 }}>{meaning}</span>
      <span style={{ fontSize: 11.5, color: scopeTone ?? INK3, fontWeight: scopeTone ? 600 : 400, lineHeight: 1.5 }}>{scope}</span>
    </div>
  );
}
