"use client";

// The filter bar. Every control writes to the URL and nothing else — there is
// no local mirror of a filter's value, so a shared link and a back button
// reproduce the exact screen.
//
// There is deliberately no "Event type" dropdown next to these: the tab row
// below already selects the event family, and it does it better (it carries
// live counts). Adding a second control for the same parameter is how two
// competing filter states get born.

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { RESOURCE_TYPES, type EventStatus, type RangePreset, type ResourceType } from "@/lib/admin/activity-log-shared";
import { INK, INK2, INK3, LINE, LINE_SUBTLE, SURFACE, btnPrimary, btnSecondary, srOnly, CalendarIcon, CloseIcon, SearchIcon } from "./logs-ui";

const PRESETS: Exclude<RangePreset, "custom">[] = ["24h", "7d", "30d", "90d"];
const RANGE_KEY: Record<RangePreset, string> = { "24h": "last24h", "7d": "last7d", "30d": "last30d", "90d": "last90d", custom: "custom" };
/** Resource types a reader can actually generate content events for. */
const FILTERABLE: ResourceType[] = RESOURCE_TYPES.filter((r) => r !== "account" && r !== "system");

export type FilterChip = { key: string; label: string; clear: Record<string, string | null> };

export default function LogsFilters({
  range, resourceType, status, search, customStart, customEnd,
  chips, onParams, onClearAll, onSearchInput, pending,
}: {
  range: RangePreset;
  resourceType: ResourceType | "all";
  status: EventStatus | "all";
  search: string;
  customStart: string | null;
  customEnd: string | null;
  chips: FilterChip[];
  onParams: (updates: Record<string, string | null>) => void;
  onClearAll: () => void;
  onSearchInput: (value: string) => void;
  pending: boolean;
}) {
  const t = useTranslations("adminLogs");
  const [customOpen, setCustomOpen] = useState(false);

  return (
    <div className="dash-card" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 11 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {/* Range — a segmented control, because the presets are one mutually
            exclusive choice a reader should be able to see all of at once. */}
        <div className="dash-seg" role="group" aria-label={t("range.label")}>
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className="dash-seg-btn"
              aria-pressed={range === preset}
              onClick={() => onParams({ range: preset, start: null, end: null })}
            >
              {t(`range.${RANGE_KEY[preset]}`)}
            </button>
          ))}
          <CustomRangeButton
            active={range === "custom"}
            open={customOpen}
            setOpen={setCustomOpen}
            start={customStart}
            end={customEnd}
            onApply={(s, e) => { onParams({ range: "custom", start: s, end: e }); setCustomOpen(false); }}
          />
        </div>

        <Select
          label={t("filters.resourceType")}
          value={resourceType}
          onChange={(v) => onParams({ resource: v })}
          options={[["all", t("filters.allResources")], ...FILTERABLE.map((r) => [r, t(`resource.${r}`)] as [string, string])]}
        />
        <Select
          label={t("filters.status")}
          value={status}
          onChange={(v) => onParams({ status: v })}
          options={[
            ["all", t("filters.allStatuses")],
            ["authorized", t("status.authorized")],
            ["success", t("status.success")],
            ["denied", t("status.denied")],
            ["failed", t("status.failed")],
          ]}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 12px", background: LINE_SUBTLE, border: `1px solid ${LINE}`, borderRadius: 10, flex: "1 1 220px", minWidth: 180 }}>
          <span style={{ color: INK3, display: "flex" }}><SearchIcon /></span>
          <input
            type="search"
            defaultValue={search}
            onChange={(e) => onSearchInput(e.target.value)}
            placeholder={t("filters.searchPlaceholder")}
            aria-label={t("filters.search")}
            aria-describedby="logs-search-hint"
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: 13.5, color: INK, minWidth: 0 }}
          />
        </div>
        <p id="logs-search-hint" style={srOnly}>{t("filters.searchHint")}</p>
      </div>

      {chips.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", borderTop: `1px solid ${LINE_SUBTLE}`, paddingTop: 10 }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: INK3 }} aria-live="polite">
            {t("filters.activeCount", { count: chips.length })}
          </span>
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => onParams(chip.clear)}
              aria-label={t("filters.remove", { label: chip.label })}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, height: 26, padding: "0 6px 0 10px",
                borderRadius: 99, border: `1px solid ${LINE}`, background: SURFACE,
                fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: INK2, cursor: "pointer",
              }}
            >
              <span className="dash-truncate" style={{ maxWidth: 180 }}>{chip.label}</span>
              <span aria-hidden style={{ display: "flex", color: INK3 }}><CloseIcon size={12} /></span>
            </button>
          ))}
          <button type="button" onClick={onClearAll} disabled={pending} style={{ ...btnSecondary, height: 26, padding: "0 10px", fontSize: 12, borderRadius: 99 }}>
            {t("filters.clearAll")}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Custom range. The two dates are day boundaries in ADMIN_TZ (UTC+7), not UTC:
 * an administrator picking "1 Aug" means the Cambodian first of August, and a
 * bare `2026-08-01` would silently start the window at 07:00 local.
 */
function CustomRangeButton({
  active, open, setOpen, start, end, onApply,
}: {
  active: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  start: string | null;
  end: string | null;
  onApply: (start: string, end: string) => void;
}) {
  const t = useTranslations("adminLogs");
  const id = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const [from, setFrom] = useState(() => toDateInput(start));
  const [to, setTo] = useState(() => toDateInput(end));
  const invalid = !!from && !!to && from > to;

  useEffect(() => {
    if (!open) return;
    firstFieldRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    const onDown = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey, true); document.removeEventListener("mousedown", onDown); };
  }, [open, setOpen]);

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        className="dash-seg-btn"
        aria-pressed={active}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
        style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
      >
        <CalendarIcon size={12} />
        {t("range.custom")}
      </button>

      {open && (
        <div id={id} role="dialog" aria-label={t("range.customTitle")} className="dash-popover"
          style={{ position: "absolute", top: "calc(100% + 8px)", insetInlineStart: 0, padding: 14, width: 268, display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: INK }}>{t("range.customTitle")}</p>
          <DateField ref={firstFieldRef} label={t("range.start")} value={from} onChange={setFrom} max={to || undefined} />
          <DateField label={t("range.end")} value={to} onChange={setTo} min={from || undefined} />
          <p aria-live="polite" style={{ fontSize: 11.5, color: "var(--ptec-danger)", minHeight: invalid ? undefined : 0 }}>
            {invalid ? t("range.invalid") : ""}
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" onClick={() => setOpen(false)} style={{ ...btnSecondary, height: 32, fontSize: 12.5 }}>{t("range.cancel")}</button>
            <button
              type="button"
              disabled={!from || !to || invalid}
              onClick={() => onApply(dayStartIso(from), dayEndIso(to))}
              style={{ ...btnPrimary, height: 32, fontSize: 12.5, opacity: !from || !to || invalid ? 0.5 : 1 }}
            >
              {t("range.apply")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DateField({ ref, label, value, onChange, min, max }: {
  ref?: React.Ref<HTMLInputElement>;
  label: string; value: string; onChange: (v: string) => void; min?: string; max?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: INK2 }}>
      {label}
      <input
        ref={ref}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        style={{ height: 34, padding: "0 9px", borderRadius: 8, border: `1px solid ${LINE}`, background: SURFACE, fontFamily: "inherit", fontSize: 13, color: INK }}
      />
    </label>
  );
}

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][];
}) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: INK3 }}>
      <span style={{ whiteSpace: "nowrap" }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ height: 36, padding: "0 26px 0 10px", background: LINE_SUBTLE, border: `1px solid ${LINE}`, borderRadius: 10, fontFamily: "inherit", fontSize: 13, color: INK, cursor: "pointer", maxWidth: 190 }}
      >
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

// ── ADMIN_TZ day boundaries ──────────────────────────────────────────────────
const TZ_SUFFIX = "+07:00";
function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Phnom_Penh", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function dayStartIso(date: string): string { return `${date}T00:00:00.000${TZ_SUFFIX}`; }
function dayEndIso(date: string): string { return `${date}T23:59:59.999${TZ_SUFFIX}`; }
