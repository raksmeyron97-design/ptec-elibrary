"use client";

// Activity & Security Logs — resource-agnostic, filter-driven admin console.
//
// Filter state lives in the URL (?range&tab&resource&status&q&page); every
// change navigates so the SERVER re-runs lib/admin/activity-log.queryActivity —
// cards, tab badges, table and CSV all read the SAME range + filters, which is
// what fixes the old "cards say 0, tab says 13" inconsistency.
//
// This page is /admin (NOT locale-routed) so navigation uses plain
// next/navigation, never i18n/navigation (per CLAUDE.md).

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Avatar from "@/components/ui/Avatar";
import {
  type ActivityEvent,
  type ActivityTab,
  type EventStatus,
  type RangePreset,
  type ResourceType,
} from "@/lib/admin/activity-log-shared";
import type { ActivityResult } from "@/lib/admin/activity-log";
import { exportActivityLogs, revealReaderContact, type ExportFilterInput } from "./actions";

// ── shared style tokens (admin panel is light-mode only) ─────────────────────
const FONT = "'Inter Tight', 'Inter', system-ui, sans-serif";
const CARD = "#fff";
const BORDER = "#e9ebf0";
const INK = "#13151b";
const MUTED = "#6b7280";
const FAINT = "#9aa1ad";

type ClientFilters = {
  range: RangePreset;
  tab: ActivityTab;
  resourceType: ResourceType | "all";
  status: EventStatus | "all";
  search: string;
  customStart: string | null;
  customEnd: string | null;
};

const TZ = "Asia/Phnom_Penh";

// Semantic colors keyed to status/event (never color-only — always paired text).
const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  authorized: { bg: "#eef2ff", fg: "#4338ca" },
  success: { bg: "#f0f9f4", fg: "#15803d" },
  denied: { bg: "#fff7ed", fg: "#b45309" },
  failed: { bg: "#fef2f2", fg: "#b91c1c" },
};
const RESOURCE_STYLE: Record<string, { bg: string; fg: string }> = {
  book: { bg: "#eef2ff", fg: "#4338ca" },
  thesis: { bg: "#ecfeff", fg: "#0e7490" },
  publication: { bg: "#f5f3ff", fg: "#6d28d9" },
  post: { bg: "#f0fdf4", fg: "#15803d" },
  account: { bg: "#f3f4f6", fg: "#374151" },
  system: { bg: "#f3f4f6", fg: "#374151" },
};

export default function SecurityLogsClient({
  result,
  filters,
  canSeePersonal,
}: {
  result: ActivityResult;
  filters: ClientFilters;
  canSeePersonal: boolean;
}) {
  const t = useTranslations("adminLogs");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState(filters.search);
  const [selected, setSelected] = useState<ActivityEvent | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [exportState, setExportState] = useState<"idle" | "busy" | "done" | "empty" | "error">("idle");

  // Stamp the "updated" clock each time fresh server data arrives. This is a
  // display-only sync of an external signal (a new server response) into state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setLastRefreshed(new Date()), [result]);

  // ── URL param helpers (server-driven filtering) ────────────────────────────
  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v == null || v === "" || v === "all") next.delete(k);
        else next.set(k, v);
      }
      if (!("page" in updates)) next.delete("page"); // any filter change resets page
      startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
    },
    [router, pathname, searchParams],
  );

  // Debounced search → URL.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearchChange = (v: string) => {
    setSearch(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setParams({ q: v || null }), 400);
  };

  const clearAll = () => {
    setSearch("");
    startTransition(() => router.push(pathname, { scroll: false }));
  };

  const refresh = () => startTransition(() => router.refresh());

  const exportInput: ExportFilterInput = useMemo(
    () => ({
      range: filters.range,
      tab: filters.tab,
      resourceType: filters.resourceType,
      status: filters.status,
      search: filters.search,
      customStart: filters.customStart,
      customEnd: filters.customEnd,
    }),
    [filters],
  );

  const doExport = () => {
    setExportState("busy");
    startTransition(async () => {
      try {
        const res = await exportActivityLogs(exportInput);
        if (!res.ok) {
          setExportState(res.error === "empty" ? "empty" : "error");
          return;
        }
        const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = res.filename;
        a.click();
        URL.revokeObjectURL(url);
        setExportState("done");
        setTimeout(() => setExportState("idle"), 2500);
      } catch {
        setExportState("error");
      }
    });
  };

  const rangeKey = filters.range === "24h" ? "last24h" : filters.range === "7d" ? "last7d" : filters.range === "30d" ? "last30d" : filters.range === "90d" ? "last90d" : "custom";
  const rangeLabel = t(`range.${rangeKey}`);

  // ── Summary cards (selected range) ─────────────────────────────────────────
  const cards = [
    { key: "authorizedDownloads", sr: "srAuthorizedDownloads", value: result.summary.authorizedDownloads, style: STATUS_STYLE.authorized, icon: <DownloadIcon /> },
    { key: "pageViews", sr: "srPageViews", value: result.summary.pageViews, style: RESOURCE_STYLE.book, icon: <EyeIcon /> },
    { key: "activeReaders", sr: "srActiveReaders", value: result.summary.activeUsers, style: RESOURCE_STYLE.post, icon: <UsersIcon /> },
    { key: "securityAlerts", sr: "srSecurityAlerts", value: result.summary.securityAlerts, style: result.summary.securityAlerts > 0 ? STATUS_STYLE.failed : RESOURCE_STYLE.account, icon: <ShieldIcon alert={result.summary.securityAlerts > 0} /> },
  ] as const;

  const TABS: ActivityTab[] = ["all", "downloads", "views", "security"];
  if (result.tabCounts.account > 0) TABS.push("account");
  if (result.tabCounts.admin > 0) TABS.push("admin");

  const hasActiveFilters = filters.range !== "24h" || filters.resourceType !== "all" || filters.status !== "all" || !!filters.search || filters.tab !== "all";

  return (
    <div style={{ fontFamily: FONT, color: INK, display: "flex", flexDirection: "column", gap: 22 }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 240 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-.02em", color: INK }}>{t("title")}</h1>
            <span aria-live="polite" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", background: "#f3f4f6", border: `1px solid ${BORDER}`, borderRadius: 99, fontSize: 11.5, fontWeight: 600, color: MUTED }}>
              <span style={{ width: 6, height: 6, borderRadius: 99, background: isPending ? "#f59e0b" : "#22c55e", display: "inline-block" }} />
              {t("autoRefresh")}
            </span>
          </div>
          <p style={{ fontSize: 13.5, color: MUTED, maxWidth: 640 }}>{t("subtitle")}</p>
          <p style={{ fontSize: 12.5, color: FAINT }}>
            {t("showingRange", { range: rangeLabel })}{lastRefreshed ? ` · ${t("updated", { time: lastRefreshed.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ }) })}` : ""}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button onClick={refresh} disabled={isPending} style={btnSecondary}>
            <RefreshIcon /> {t("refresh")}
          </button>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
            <button onClick={doExport} disabled={exportState === "busy" || isPending} style={btnPrimary}>
              <ExportIcon /> {exportState === "busy" ? t("exporting") : t("exportCsv")}
            </button>
            {exportState === "done" && <span style={{ fontSize: 11, color: "#15803d" }}>{t("exportDone")}</span>}
            {exportState === "empty" && <span style={{ fontSize: 11, color: "#b45309" }}>{t("exportEmpty")}</span>}
            {exportState === "error" && <span style={{ fontSize: 11, color: "#b91c1c" }}>{t("exportError")}</span>}
          </div>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "12px 14px" }}>
        <Select label={t("range.label")} value={filters.range} onChange={(v) => setParams({ range: v })}
          options={[["24h", t("range.last24h")], ["7d", t("range.last7d")], ["30d", t("range.last30d")], ["90d", t("range.last90d")]]} />
        <Select label={t("filters.resourceType")} value={filters.resourceType} onChange={(v) => setParams({ resource: v })}
          options={[["all", t("filters.allResources")], ["book", t("resource.book")], ["thesis", t("resource.thesis")], ["publication", t("resource.publication")], ["post", t("resource.post")]]} />
        <Select label={t("filters.status")} value={filters.status} onChange={(v) => setParams({ status: v })}
          options={[["all", t("filters.allStatuses")], ["authorized", t("status.authorized")], ["denied", t("status.denied")], ["failed", t("status.failed")], ["success", t("status.success")]]} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 12px", background: "#f7f8fa", border: `1px solid ${BORDER}`, borderRadius: 9, flex: "1 1 240px", minWidth: 200 }}>
          <SearchIcon />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("filters.searchPlaceholder")}
            aria-label={t("filters.search")}
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: 13.5, color: INK, minWidth: 0 }}
          />
        </div>
        {hasActiveFilters && (
          <button onClick={clearAll} style={{ ...btnSecondary, height: 36 }}>{t("filters.clear")}</button>
        )}
      </div>

      {/* ── Summary cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
        {cards.map((c) => (
          <div key={c.key} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10, boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12.5, fontWeight: 500, color: MUTED }}>{t(`cards.${c.key}`)}</span>
              <span style={{ width: 30, height: 30, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", background: c.style.bg, color: c.style.fg }}>{c.icon}</span>
            </div>
            <span style={{ position: "relative", fontSize: 28, fontWeight: 700, letterSpacing: "-.02em", color: INK, lineHeight: 1 }}>
              {c.value.toLocaleString()}
              <span style={srOnly}>{t(`cards.${c.sr}`, { count: c.value })}</span>
            </span>
          </div>
        ))}
      </div>

      {/* ── Activity panel ── */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}>
        {/* Tabs */}
        <div role="tablist" aria-label={t("title")} style={{ display: "flex", gap: 4, padding: "12px 14px", borderBottom: `1px solid #eef0f4`, overflowX: "auto", background: "#f3f4f7" }}>
          {TABS.map((tab) => {
            const active = filters.tab === tab;
            const count = tab === "all" ? result.tabCounts.all : result.tabCounts[tab as Exclude<ActivityTab, "all">];
            return (
              <button key={tab} role="tab" aria-selected={active} onClick={() => setParams({ tab: tab === "all" ? null : tab })}
                style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 32, padding: "0 13px", border: "none", borderRadius: 8, fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", background: active ? "#fff" : "transparent", color: active ? INK : MUTED, boxShadow: active ? "0 1px 2px rgba(16,24,40,.10)" : "none" }}>
                {t(`tabs.${tab}`)}
                <span style={{ fontSize: 11, fontWeight: 600, padding: "1px 7px", borderRadius: 99, background: active ? INK : "#e3e5ea", color: active ? "#fff" : MUTED }}>{count.toLocaleString()}</span>
              </button>
            );
          })}
        </div>

        {/* Table */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <caption style={srOnly}>{t("table.caption")}</caption>
            <thead>
              <tr style={{ background: "#fafbfc", borderBottom: `1px solid #eef0f4` }}>
                {["event", "reader", "resource", "institution", "status", "time", "actions"].map((h) => (
                  <th key={h} scope="col" style={{ textAlign: h === "time" || h === "actions" ? "right" : "left", fontSize: 11, fontWeight: 600, color: FAINT, letterSpacing: ".06em", textTransform: "uppercase", padding: "10px 16px" }}>{t(`table.${h}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.events.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: "56px 20px", textAlign: "center" }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: INK, marginBottom: 6 }}>{t("empty.title")}</div>
                    <div style={{ fontSize: 13, color: MUTED, maxWidth: 420, margin: "0 auto 14px" }}>{t("empty.body")}</div>
                    <button onClick={clearAll} style={btnSecondary}>{t("empty.clear")}</button>
                  </td>
                </tr>
              ) : (
                result.events.map((e) => (
                  <Row key={e.id} e={e} t={t} onOpen={() => setSelected(e)} />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {result.pagination.totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 16px", borderTop: `1px solid #eef0f4` }}>
            <span style={{ fontSize: 12.5, color: MUTED }}>{t("pagination.summary", { page: result.pagination.page + 1, pages: result.pagination.totalPages, total: result.pagination.total })}</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button disabled={result.pagination.page <= 0} onClick={() => setParams({ page: String(result.pagination.page - 1) })} style={{ ...btnSecondary, opacity: result.pagination.page <= 0 ? 0.5 : 1 }}>{t("pagination.prev")}</button>
              <button disabled={result.pagination.page + 1 >= result.pagination.totalPages} onClick={() => setParams({ page: String(result.pagination.page + 1) })} style={{ ...btnSecondary, opacity: result.pagination.page + 1 >= result.pagination.totalPages ? 0.5 : 1 }}>{t("pagination.next")}</button>
            </div>
          </div>
        )}
      </div>

      {selected && <EventDrawer e={selected} t={t} canSeePersonal={canSeePersonal} onClose={() => setSelected(null)} />}
    </div>
  );
}

// ── Table row ────────────────────────────────────────────────────────────────
function Row({ e, t, onOpen }: { e: ActivityEvent; t: ReturnType<typeof useTranslations>; onOpen: () => void }) {
  const rs = RESOURCE_STYLE[e.resourceType] ?? RESOURCE_STYLE.system;
  const ss = STATUS_STYLE[e.eventStatus] ?? STATUS_STYLE.success;
  const time = fmtTime(e.occurredAt);
  const rowLabel = e.isAnon
    ? `${t(`event.${e.eventType}`)} · ${t("anon")} · ${e.resourceTitle ?? t("resource.unknown")} · ${time.rel}`
    : `${t(`event.${e.eventType}`)} ${t(`status.${e.eventStatus}`)} · ${e.actorName ?? ""} · ${e.resourceTitle ?? t("resource.unknown")} · ${time.rel}`;
  return (
    <tr style={{ borderBottom: `1px solid #f1f2f5` }}>
      <td style={td}>
        <EventBadge type={e.eventType} status={e.eventStatus} label={t(`event.${e.eventType}`)} />
      </td>
      <td style={td}>
        {e.isAnon ? (
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ width: 30, height: 30, borderRadius: 99, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", color: FAINT, fontSize: 12 }} aria-hidden>?</span>
            <span style={{ fontSize: 13, color: MUTED, fontStyle: "italic" }}>{t("anon")}</span>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
            <Avatar url={e.actorAvatar} name={e.actorName} email={e.actorEmail ?? ""} size={30} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }}>{e.actorName ?? t("resource.unknown")}</div>
              <div style={{ fontSize: 11.5, color: FAINT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }}>{e.actorEmail ?? ""}</div>
            </div>
          </div>
        )}
      </td>
      <td style={td}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <span style={{ fontSize: 13, color: INK, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", maxWidth: 260 }}>{e.resourceTitle ?? t("resource.unknown")}</span>
          <span style={{ alignSelf: "flex-start", fontSize: 10.5, fontWeight: 600, padding: "1px 7px", borderRadius: 5, background: rs.bg, color: rs.fg }}>{t(`resource.${e.resourceType}`)}</span>
        </div>
      </td>
      <td style={td}>
        <span style={{ fontSize: 12.5, color: e.institutionType ? MUTED : FAINT }}>{e.institutionType ?? t("notProvided")}</span>
      </td>
      <td style={td}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, padding: "3px 9px", borderRadius: 6, background: ss.bg, color: ss.fg }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: ss.fg }} aria-hidden />
          {t(`status.${e.eventStatus}`)}
        </span>
      </td>
      <td style={{ ...td, textAlign: "right" }}>
        <span title={time.exact} style={{ fontSize: 12.5, color: MUTED }}>{time.rel}</span>
      </td>
      <td style={{ ...td, textAlign: "right" }}>
        <button onClick={onOpen} aria-label={`${t("table.viewDetails")}: ${rowLabel}`} style={{ fontSize: 12.5, fontWeight: 600, color: "#4338ca", background: "transparent", border: "none", cursor: "pointer", padding: "4px 6px" }}>
          {t("table.viewDetails")}
        </button>
      </td>
    </tr>
  );
}

// ── Event details drawer ─────────────────────────────────────────────────────
function EventDrawer({ e, t, canSeePersonal, onClose }: { e: ActivityEvent; t: ReturnType<typeof useTranslations>; canSeePersonal: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState<Awaited<ReturnType<typeof revealReaderContact>> | null>(null);
  const [revealing, setRevealing] = useState(false);
  const time = fmtTime(e.occurredAt);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => { document.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [onClose]);

  const copyId = () => { navigator.clipboard?.writeText(e.id); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const doReveal = async () => {
    if (!e.userId) return;
    setRevealing(true);
    try { setRevealed(await revealReaderContact(e.userId)); } finally { setRevealing(false); }
  };
  const rev = revealed && revealed.ok ? revealed : null;

  return (
    <div role="dialog" aria-modal="true" aria-label={t("drawer.title")} style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(16,24,40,.35)" }} />
      <div ref={ref} tabIndex={-1} style={{ position: "relative", width: "min(460px, 100%)", height: "100%", background: "#fff", boxShadow: "-8px 0 30px rgba(16,24,40,.18)", overflowY: "auto", outline: "none", display: "flex", flexDirection: "column" }}>
        <div style={{ position: "sticky", top: 0, background: "#fff", borderBottom: `1px solid ${BORDER}`, padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <EventBadge type={e.eventType} status={e.eventStatus} label={t(`event.${e.eventType}`)} />
            <span style={{ fontSize: 15, fontWeight: 700, color: INK }}>{t("drawer.title")}</span>
          </div>
          <button onClick={onClose} aria-label={t("drawer.close")} style={{ border: "none", background: "#f3f4f6", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 16, color: MUTED }}>×</button>
        </div>

        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 18 }}>
          <Section title={t("drawer.eventSummary")}>
            <Field label={t("drawer.eventType")} value={t(`event.${e.eventType}`)} />
            <Field label={t("drawer.statusLabel")} value={t(`status.${e.eventStatus}`)} />
            <Field label={t("drawer.dateTime")} value={`${time.exact} (${TZ})`} />
            <Field label={t("drawer.eventId")} value={
              <button onClick={copyId} style={{ fontFamily: "monospace", fontSize: 11.5, color: MUTED, background: "#f7f8fa", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "2px 8px", cursor: "pointer" }}>
                {copied ? t("drawer.copied") : `${e.id.slice(0, 26)}…`}
              </button>
            } />
            {e.permissionSource && <Field label={t("drawer.permissionSource")} value={e.permissionSource} />}
          </Section>

          {!e.isAnon && (
            <Section title={t("drawer.readerInfo")}>
              <Field label={t("drawer.fullName")} value={rev?.fullName ?? e.actorName ?? t("drawer.notAvailable")} />
              <Field label={t("drawer.verifiedEmail")} value={rev?.email ?? e.actorEmail ?? t("drawer.notAvailable")} />
              <Field label={t("drawer.phone")} value={rev ? (rev.phone ?? t("drawer.notAvailable")) : (canSeePersonal ? "•••" : t("drawer.masked"))} />
              {rev && <Field label={t("drawer.gender")} value={rev.gender ?? t("drawer.notAvailable")} />}
              {rev?.faculty && <Field label={t("drawer.faculty")} value={rev.faculty} />}
              <Field label={t("drawer.country")} value={rev?.country ?? t("drawer.notAvailable")} />
              {canSeePersonal && e.userId && (
                <button onClick={doReveal} disabled={revealing || !!rev} style={{ ...btnSecondary, height: 32, marginTop: 4 }}>
                  {rev ? t("drawer.hide") : revealing ? "…" : t("drawer.reveal")}
                </button>
              )}
              {!canSeePersonal && <p style={{ fontSize: 11.5, color: FAINT }}>{t("drawer.revealHint")}</p>}
            </Section>
          )}

          {(e.institutionType || e.role) && (
            <Section title={t("drawer.institutionInfo")}>
              <Field label={t("drawer.institutionType")} value={e.institutionType ?? t("notProvided")} />
              <Field label={t("drawer.role")} value={e.role ?? t("notProvided")} />
            </Section>
          )}

          <Section title={t("drawer.resourceInfo")}>
            <Field label={t("drawer.resourceTitle")} value={e.resourceTitle ?? t("resource.unknown")} />
            <Field label={t("drawer.resourceType")} value={t(`resource.${e.resourceType}`)} />
          </Section>

          {e.eventType === "download" && (
            <Section title={t("drawer.downloadDecision")}>
              <Field label={t("drawer.statusLabel")} value={t(`status.${e.eventStatus}`)} />
              {e.permissionSource && <Field label={t("drawer.permissionSource")} value={e.permissionSource} />}
              {e.denialReason && <Field label={t("drawer.permissionReason")} value={t(`reason.${e.denialReason}`)} />}
              {e.rankAtEvent != null && <Field label={t("drawer.rankAtEvent")} value={`#${e.rankAtEvent}`} />}
            </Section>
          )}

          {e.purpose && (
            <Section title={t("drawer.intendedUse")}>
              <Field label={t("drawer.purpose")} value={e.purpose} />
            </Section>
          )}

          {e.locale && (
            <Section title={t("drawer.technical")}>
              <Field label={t("drawer.locale")} value={e.locale} />
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

// ── small presentational helpers ─────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 style={{ fontSize: 11, fontWeight: 700, color: FAINT, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 8 }}>{title}</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>{children}</div>
    </div>
  );
}
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
      <span style={{ fontSize: 12.5, color: MUTED, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: INK, textAlign: "right", wordBreak: "break-word" }}>{value}</span>
    </div>
  );
}
function EventBadge({ type, status, label }: { type: string; status: string; label: string }) {
  const s = type === "download" ? (STATUS_STYLE[status] ?? STATUS_STYLE.authorized) : type === "view" ? RESOURCE_STYLE.book : RESOURCE_STYLE.account;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, padding: "3px 9px", borderRadius: 6, background: s.bg, color: s.fg }}>{type === "download" ? <DownloadIcon size={12} /> : type === "view" ? <EyeIcon size={12} /> : <ShieldIcon size={12} />}{label}</span>;
}
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: MUTED }}>
      <span style={{ whiteSpace: "nowrap" }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ height: 36, padding: "0 26px 0 10px", background: "#f7f8fa", border: `1px solid ${BORDER}`, borderRadius: 9, fontFamily: FONT, fontSize: 13, color: INK, cursor: "pointer" }}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

const srOnly: React.CSSProperties = { position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 };
const td: React.CSSProperties = { padding: "11px 16px", verticalAlign: "middle" };
const btnBase: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, height: 38, padding: "0 15px", borderRadius: 9, fontFamily: FONT, fontSize: 13.5, fontWeight: 600, cursor: "pointer" };
const btnSecondary: React.CSSProperties = { ...btnBase, background: "#fff", border: `1px solid #e1e4ea`, color: "#374151" };
const btnPrimary: React.CSSProperties = { ...btnBase, background: INK, border: `1px solid ${INK}`, color: "#fff" };

// ── time formatting (Asia/Phnom_Penh presentation) ───────────────────────────
function fmtTime(iso: string): { rel: string; exact: string } {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  let rel: string;
  if (diff < 60) rel = "just now";
  else if (diff < 3600) rel = `${Math.floor(diff / 60)} min ago`;
  else if (diff < 86400) rel = `${Math.floor(diff / 3600)} hr ago`;
  else rel = `${Math.floor(diff / 86400)} d ago`;
  const exact = d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "medium", timeZone: TZ });
  return { rel, exact };
}

// ── icons ────────────────────────────────────────────────────────────────────
function DownloadIcon({ size = 14 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>; }
function EyeIcon({ size = 14 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>; }
function UsersIcon({ size = 14 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></svg>; }
function ShieldIcon({ size = 14, alert = false }: { size?: number; alert?: boolean }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />{alert ? <path d="M12 8v4M12 16h.01" /> : <path d="m9 12 2 2 4-4" />}</svg>; }
function RefreshIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></svg>; }
function ExportIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="m8 11 4 4 4-4" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>; }
function SearchIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>; }
