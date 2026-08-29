"use client";

// The operational heart of the page: one page of server-filtered, server-
// paginated events. The component receives rows and renders them — it never
// filters, sorts or counts, because doing any of that here would mean the
// visible list disagreed with the counts above it.
//
// Columns are chosen for SCANNING, not for completeness: when · who · what ·
// what to · outcome. Everything else (institution, locale, permission source,
// source table) lives in the drawer, one activation away.

import { useTranslations } from "next-intl";
import Avatar from "@/components/ui/Avatar";
import type { ActivityEvent } from "@/lib/admin/activity-log-shared";
import { INK, INK2, INK3, LINE, LINE_SUBTLE, ResourceBadge, StatusBadge, actionKey, btnSecondary, srOnly } from "./logs-ui";
import type { TimeParts } from "./time";

export type EmptyKind = "none" | "filtered" | "secure";

export default function ActivityTable({
  events, emptyKind, onOpen, onClearFilters, fmt, pending,
}: {
  events: ActivityEvent[];
  emptyKind: EmptyKind;
  onOpen: (event: ActivityEvent) => void;
  onClearFilters: () => void;
  fmt: (iso: string) => TimeParts;
  pending: boolean;
}) {
  const t = useTranslations("adminLogs");

  if (events.length === 0) {
    return <EmptyState kind={emptyKind} onClearFilters={onClearFilters} />;
  }

  // Pending rows dim rather than unmount: the layout must not collapse and
  // re-expand every time a filter changes, which is what makes a filter feel
  // like a page load instead of a refinement.
  const dim: React.CSSProperties = { opacity: pending ? 0.55 : 1, transition: "opacity .15s ease" };

  return (
    <div style={dim} aria-busy={pending}>
      <div className="logs-table-view" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
          <caption style={srOnly}>{t("table.caption")}</caption>
          <thead>
            <tr style={{ background: LINE_SUBTLE, borderBottom: `1px solid ${LINE}` }}>
              {(["time", "actor", "action", "resource", "status"] as const).map((h) => (
                <th key={h} scope="col" style={th}>{t(`table.${h}`)}</th>
              ))}
              <th scope="col" style={{ ...th, textAlign: "right" }}>{t("table.details")}</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <Row key={e.id} e={e} onOpen={onOpen} fmt={fmt} />
            ))}
          </tbody>
        </table>
      </div>

      <ul className="logs-list-view" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {events.map((e) => (
          <MobileRow key={e.id} e={e} onOpen={onOpen} fmt={fmt} />
        ))}
      </ul>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: "left", fontSize: 10.5, fontWeight: 700, color: INK3,
  letterSpacing: ".07em", textTransform: "uppercase", padding: "9px 16px", whiteSpace: "nowrap",
};
const td: React.CSSProperties = { padding: "11px 16px", verticalAlign: "middle" };

/** One sentence describing the whole row, for the activator's accessible name.
 *  A bare "View details" repeated 20 times names nothing. */
function rowLabel(e: ActivityEvent, t: ReturnType<typeof useTranslations>, exact: string): string {
  const who = e.isAnon ? t("anon") : (e.actorName ?? t("drawer.notAvailable"));
  const what = t(`action.${actionKey(e)}`);
  const on = e.resourceTitle ?? t("resource.unknown");
  return t("table.rowLabel", { action: what, actor: who, resource: on, time: exact });
}

function Row({ e, onOpen, fmt }: { e: ActivityEvent; onOpen: (e: ActivityEvent) => void; fmt: (iso: string) => TimeParts }) {
  const t = useTranslations("adminLogs");
  const time = fmt(e.occurredAt);

  return (
    <tr
      className="logs-row"
      style={{ borderBottom: `1px solid ${LINE_SUBTLE}`, cursor: "pointer" }}
      onClick={() => onOpen(e)}
    >
      <td style={{ ...td, whiteSpace: "nowrap" }}>
        <span title={time.exact} style={{ fontSize: 12.5, color: INK2, fontVariantNumeric: "tabular-nums" }}>{time.relative}</span>
        <span style={srOnly}>{time.exact}</span>
      </td>
      <td style={td}><ActorCell e={e} /></td>
      <td style={td}>
        <span style={{ fontSize: 13, fontWeight: 600, color: INK, whiteSpace: "nowrap" }}>{t(`action.${actionKey(e)}`)}</span>
      </td>
      <td style={td}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, maxWidth: 280 }}>
          <span style={{ fontSize: 13, color: INK }} className="dash-truncate">{e.resourceTitle ?? t("resource.unknown")}</span>
          <span><ResourceBadge type={e.resourceType} label={t(`resource.${e.resourceType}`)} /></span>
        </div>
      </td>
      <td style={td}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-start" }}>
          <StatusBadge status={e.eventStatus} label={t(`status.${e.eventStatus}`)} />
          {e.denialReason && <span style={{ fontSize: 11, color: INK3 }} className="dash-truncate">{t(`reason.${e.denialReason}`)}</span>}
        </div>
      </td>
      <td style={{ ...td, textAlign: "right" }}>
        <button
          type="button"
          onClick={(ev) => { ev.stopPropagation(); onOpen(e); }}
          aria-label={rowLabel(e, t, time.exact)}
          style={{ fontSize: 12.5, fontWeight: 600, color: "var(--dash-blue)", background: "transparent", border: "1px solid transparent", borderRadius: 7, cursor: "pointer", padding: "4px 8px", fontFamily: "inherit", whiteSpace: "nowrap" }}
        >
          {t("table.viewDetails")}
        </button>
      </td>
    </tr>
  );
}

function MobileRow({ e, onOpen, fmt }: { e: ActivityEvent; onOpen: (e: ActivityEvent) => void; fmt: (iso: string) => TimeParts }) {
  const t = useTranslations("adminLogs");
  const time = fmt(e.occurredAt);

  return (
    <li style={{ borderBottom: `1px solid ${LINE_SUBTLE}` }}>
      <button
        type="button"
        onClick={() => onOpen(e)}
        aria-label={rowLabel(e, t, time.exact)}
        className="logs-row"
        style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8, padding: "13px 15px", background: "transparent", border: "none", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}
      >
        <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>{t(`action.${actionKey(e)}`)}</span>
          <span style={{ fontSize: 11.5, color: INK3, whiteSpace: "nowrap" }}>{time.relative}</span>
        </span>
        <span style={{ display: "block", fontSize: 13, color: INK2, minWidth: 0 }} className="dash-truncate">
          {e.resourceTitle ?? t("resource.unknown")}
        </span>
        <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <ActorCell e={e} compact />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <ResourceBadge type={e.resourceType} label={t(`resource.${e.resourceType}`)} />
            <StatusBadge status={e.eventStatus} label={t(`status.${e.eventStatus}`)} size="sm" />
          </span>
        </span>
      </button>
    </li>
  );
}

/** Identity, at the privilege the SERVER decided. `actorEmail` is already
 *  masked upstream for admins without the reveal privilege — this component
 *  simply prints what it was given and never re-derives visibility. */
function ActorCell({ e, compact = false }: { e: ActivityEvent; compact?: boolean }) {
  const t = useTranslations("adminLogs");
  if (e.isAnon) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span aria-hidden style={{ width: 28, height: 28, borderRadius: 99, background: LINE_SUBTLE, border: `1px solid ${LINE}`, display: "grid", placeItems: "center", color: INK3, fontSize: 12, flex: "none" }}>?</span>
        <span style={{ fontSize: 12.5, color: INK3, fontStyle: "italic" }}>{t("anon")}</span>
      </span>
    );
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      <Avatar url={e.actorAvatar} name={e.actorName} email={e.actorEmail ?? ""} size={28} />
      <span style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: INK, maxWidth: compact ? 170 : 180 }} className="dash-truncate">
          {e.actorName ?? t("drawer.notAvailable")}
        </span>
        {e.actorEmail && (
          <span style={{ fontSize: 11.5, color: INK3, maxWidth: compact ? 170 : 180 }} className="dash-truncate">{e.actorEmail}</span>
        )}
      </span>
    </span>
  );
}

/**
 * Three different nothings, three different messages. "No activity found" when
 * the library was genuinely quiet is a fact; the same words when a filter is
 * hiding everything is a dead end.
 */
function EmptyState({ kind, onClearFilters }: { kind: EmptyKind; onClearFilters: () => void }) {
  const t = useTranslations("adminLogs");
  const key = kind === "secure" ? "secure" : kind === "filtered" ? "filtered" : "none";
  return (
    <div style={{ padding: "56px 24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <p style={{ fontSize: 14.5, fontWeight: 700, color: INK }}>{t(`empty.${key}Title`)}</p>
      <p style={{ fontSize: 13, color: INK2, maxWidth: 420, lineHeight: 1.6 }}>{t(`empty.${key}Body`)}</p>
      {kind === "filtered" && (
        <button type="button" onClick={onClearFilters} style={{ ...btnSecondary, marginTop: 6 }}>{t("empty.clear")}</button>
      )}
    </div>
  );
}
