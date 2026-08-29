"use client";

// Where engagement is concentrated. A ranked list rather than a pie: the
// question is "which collection is busiest, and by how much" — a length
// comparison answers it, an angle comparison does not.
//
// Bars are proportional to the busiest row, and every bar is accompanied by its
// number, so the encoding is never the only channel.

import { useTranslations } from "next-intl";
import type { ActivityResourceRow } from "@/lib/admin/activity-log";
import type { ResourceType } from "@/lib/admin/activity-log-shared";
import { INK, INK2, INK3, LINE_SUBTLE, SERIES, sectionTitle, BarsIcon } from "./logs-ui";

export default function ResourceActivity({
  rows,
  onDrill,
}: {
  rows: ActivityResourceRow[];
  onDrill: (resourceType: ResourceType) => void;
}) {
  const t = useTranslations("adminLogs");
  const max = Math.max(1, ...rows.map((r) => r.total));

  return (
    <section className="dash-card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="dash-ico dash-ico--sm dash-ico--views"><BarsIcon size={15} /></span>
        <div style={{ minWidth: 0 }}>
          <h2 style={sectionTitle}>{t("resources.title")}</h2>
          <p style={{ fontSize: 12, color: INK3, marginTop: 2 }}>{t("resources.subtitle")}</p>
        </div>
      </header>

      {rows.length === 0 ? (
        <p style={{ fontSize: 12.5, color: INK3, lineHeight: 1.6, padding: "8px 0 4px" }}>{t("resources.empty")}</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          {rows.map((row) => (
            <li key={row.resourceType}>
              <button
                type="button"
                onClick={() => onDrill(row.resourceType)}
                aria-label={t("resources.drillLabel", {
                  resource: t(`resource.${row.resourceType}`),
                  total: row.total,
                  views: row.views,
                  downloads: row.downloads,
                })}
                style={{
                  width: "100%", display: "flex", flexDirection: "column", gap: 5,
                  padding: "8px 10px", borderRadius: 9, border: "1px solid transparent",
                  background: "transparent", cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                }}
              >
                <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: INK2, minWidth: 0 }} className="dash-truncate">
                    {t(`resource.${row.resourceType}`)}
                  </span>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: INK, fontVariantNumeric: "tabular-nums", flex: "none" }}>
                    {row.total.toLocaleString()}
                  </span>
                </span>
                <span aria-hidden style={{ display: "flex", height: 6, borderRadius: 99, background: LINE_SUBTLE, overflow: "hidden" }}>
                  <span style={{ width: `${(row.views / max) * 100}%`, background: SERIES.views }} />
                  <span style={{ width: `${(row.downloads / max) * 100}%`, background: SERIES.downloads }} />
                  <span style={{ width: `${(row.security / max) * 100}%`, background: SERIES.security }} />
                </span>
                <span style={{ fontSize: 11.5, color: INK3 }}>
                  {t("resources.split", { views: row.views, downloads: row.downloads })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
