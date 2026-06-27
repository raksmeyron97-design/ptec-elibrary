"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/ui/Avatar";

type LogType = "download" | "view";

export interface LogRow {
  id: string;
  type: LogType;
  name: string;
  email: string;
  book: string;
  time: string;
  isAnon: boolean;
  avatarUrl?: string | null;
}

export interface LogStats {
  downloads24h: number;
  views24h: number;
  activeUsers: number;
}

type Tab = "all" | "download" | "view";

const PAGE_SIZE = 10;

function spark(seed: number): number[] {
  const out: number[] = [];
  let v = seed;
  for (let i = 0; i < 12; i++) {
    v = (v * 9301 + 49297) % 233280;
    out.push(28 + Math.round((v / 233280) * 72));
  }
  return out;
}

function formatTime(iso: string): { rel: string; clock: string } {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  let rel: string;
  if (diff < 60) rel = "just now";
  else if (diff < 3600) rel = `${Math.floor(diff / 60)} min ago`;
  else if (diff < 86400) rel = `${Math.floor(diff / 3600)} hr ago`;
  else rel = `${Math.floor(diff / 86400)} d ago`;
  const clock = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return { rel, clock };
}

function getInitials(name: string): string {
  if (!name || name === "Anonymous" || name === "Unknown") return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function strHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffffff;
  return Math.abs(h);
}

const PALETTES: [string, string][] = [
  ["#4f46e5", "#c7d0fb"],
  ["#059669", "#aee6cf"],
  ["#ea7a18", "#fcd9aa"],
  ["#0891b2", "#a5e4ef"],
  ["#7c3aed", "#d6c4fb"],
  ["#db2777", "#f6c0d9"],
];

const BOOK_HUES = [248, 18, 160, 200, 42, 280, 340, 120, 30, 218];

function DownloadIcon({ color = "#4f46e5", size = 13 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

function EyeIcon({ color = "#059669", size = 13 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9aa1ad" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export default function SecurityLogsClient({
  logs,
  stats,
}: {
  logs: LogRow[];
  stats: LogStats;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const dlCount = logs.filter((r) => r.type === "download").length;
  const vwCount = logs.filter((r) => r.type === "view").length;

  const filtered = logs
    .filter((r) => tab === "all" || r.type === tab)
    .filter((r) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (r.name + " " + r.email + " " + r.book).toLowerCase().includes(q);
    });

  const totalCount = filtered.length;
  const shownRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const hasPrev = page > 0;
  const hasNext = (page + 1) * PAGE_SIZE < totalCount;

  const handleTabChange = useCallback(
    (t: Tab) => {
      setTab(t);
      setPage(0);
    },
    []
  );

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setPage(0);
  }, []);

  function exportCSV() {
    const header = "Event,Name,Email,Book,Time\n";
    const rows = filtered
      .map(
        (r) =>
          `${r.type},${JSON.stringify(r.name)},${JSON.stringify(r.email)},${JSON.stringify(r.book)},${new Date(r.time).toISOString()}`
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "security-logs.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const statCards = [
    {
      label: "Downloads (24h)",
      value: stats.downloads24h.toLocaleString(),
      iconBg: "#eef2ff",
      barColor: "#c7d0fb",
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>,
      spark: spark(11 + stats.downloads24h),
    },
    {
      label: "Page views (24h)",
      value: stats.views24h.toLocaleString(),
      iconBg: "#ecfdf5",
      barColor: "#aee6cf",
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>,
      spark: spark(7 + stats.views24h),
    },
    {
      label: "Active users",
      value: stats.activeUsers.toLocaleString(),
      iconBg: "#fff7ed",
      barColor: "#fcd9aa",
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ea7a18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>,
      spark: spark(23 + stats.activeUsers),
    },
    {
      label: "Total events",
      value: logs.length.toLocaleString(),
      iconBg: "#fef2f2",
      barColor: "#f6c4c4",
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 17h.01"/></svg>,
      spark: spark(3 + logs.length),
    },
  ];

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "all", label: "All activity", count: logs.length },
    { key: "download", label: "Downloads", count: dlCount },
    { key: "view", label: "Views", count: vwCount },
  ];

  return (
    <div style={{ fontFamily: "'Inter Tight', 'Inter', system-ui, sans-serif", color: "#1a1d24", display: "flex", flexDirection: "column", gap: "26px" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "24px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
            <h1 style={{ fontSize: "27px", fontWeight: 700, letterSpacing: "-.02em", color: "#13151b" }}>Security Logs</h1>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 10px 4px 8px", background: "#ecfdf3", border: "1px solid #c5ecd2", borderRadius: "99px" }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "99px", background: "#22c55e", display: "inline-block", animation: "pulse-dot 1.8s ease-in-out infinite" }} />
              <span style={{ fontSize: "11.5px", fontWeight: 600, color: "#15803d", letterSpacing: ".01em" }}>Live</span>
            </div>
          </div>
          <p style={{ fontSize: "14px", color: "#6b7280" }}>Monitor book views, downloads and account activity across the platform.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            onClick={() => router.refresh()}
            style={{ display: "flex", alignItems: "center", gap: "8px", height: "38px", padding: "0 15px", background: "#fff", border: "1px solid #e1e4ea", borderRadius: "10px", fontFamily: "inherit", fontSize: "13.5px", fontWeight: 500, color: "#374151", cursor: "pointer" }}
          >
            <RefreshIcon />
            Refresh
          </button>
          <button
            onClick={exportCSV}
            style={{ display: "flex", alignItems: "center", gap: "8px", height: "38px", padding: "0 16px", background: "#13151b", border: "1px solid #13151b", borderRadius: "10px", fontFamily: "inherit", fontSize: "13.5px", fontWeight: 600, color: "#fff", cursor: "pointer" }}
          >
            <ExportIcon />
            Export CSV
          </button>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
        {statCards.map((s) => (
          <div key={s.label} style={{ background: "#fff", border: "1px solid #e9ebf0", borderRadius: "16px", padding: "17px 18px", display: "flex", flexDirection: "column", gap: "13px", boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "12.5px", fontWeight: 500, color: "#6b7280", letterSpacing: ".01em" }}>{s.label}</span>
              <div style={{ width: "30px", height: "30px", borderRadius: "9px", display: "flex", alignItems: "center", justifyContent: "center", background: s.iconBg }}>
                {s.icon}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "9px" }}>
              <span style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "-.02em", color: "#13151b", lineHeight: 1 }}>{s.value}</span>
            </div>
            <div style={{ height: "30px", display: "flex", alignItems: "flex-end", gap: "3px" }}>
              {s.spark.map((h, i) => (
                <div key={i} style={{ flex: 1, borderRadius: "2px 2px 0 0", background: s.barColor, height: `${h}%` }} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Activity panel ── */}
      <div style={{ background: "#fff", border: "1px solid #e9ebf0", borderRadius: "18px", overflow: "hidden", boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}>

        {/* Toolbar */}
        <div style={{ padding: "16px 18px", borderBottom: "1px solid #eef0f4", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "4px", background: "#f3f4f7", borderRadius: "11px", padding: "4px" }}>
            {tabs.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => handleTabChange(t.key)}
                  style={{
                    display: "flex", alignItems: "center", gap: "7px", height: "32px", padding: "0 13px",
                    border: "none", borderRadius: "8px", fontFamily: "inherit", fontSize: "13px", fontWeight: 600,
                    cursor: "pointer",
                    background: active ? "#fff" : "transparent",
                    color: active ? "#13151b" : "#6b7280",
                    boxShadow: active ? "0 1px 2px rgba(16,24,40,.10)" : "none",
                    transition: "all .15s",
                  }}
                >
                  {t.label}
                  <span style={{ fontSize: "11px", fontWeight: 600, padding: "1px 7px", borderRadius: "99px", background: active ? "#13151b" : "#e3e5ea", color: active ? "#fff" : "#6b7280" }}>
                    {t.count}
                  </span>
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", height: "38px", padding: "0 12px", background: "#f7f8fa", border: "1px solid #e9ebf0", borderRadius: "10px", width: "260px" }}>
            <SearchIcon />
            <input
              value={query}
              onChange={handleSearch}
              placeholder="Search user, book…"
              style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: "13.5px", color: "#1a1d24" }}
            />
          </div>
        </div>

        {/* Table header */}
        <div style={{ display: "grid", gridTemplateColumns: "128px 1.1fr 1.4fr 96px", gap: "12px", padding: "11px 22px", background: "#fafbfc", borderBottom: "1px solid #eef0f4" }}>
          {["Event", "User", "Book", "Time"].map((h) => (
            <span key={h} style={{ fontSize: "11px", fontWeight: 600, color: "#9aa1ad", letterSpacing: ".06em", textTransform: "uppercase" as const, textAlign: h === "Time" ? "right" as const : "left" as const }}>
              {h}
            </span>
          ))}
        </div>

        {/* Rows */}
        <div>
          {shownRows.length === 0 ? (
            <div style={{ padding: "60px 22px", textAlign: "center", color: "#9aa1ad", fontSize: "14px" }}>
              No activity matches your filters.
            </div>
          ) : (
            shownRows.map((r, i) => {
              const pal = PALETTES[(strHash(r.name) + i) % PALETTES.length];
              const bookHue = BOOK_HUES[strHash(r.book) % BOOK_HUES.length];
              const { rel, clock } = formatTime(r.time);
              const inits = getInitials(r.name);

              const evBg = r.type === "download" ? "#eef2ff" : "#ecfdf5";
              const evColor = r.type === "download" ? "#4f46e5" : "#059669";
              const evBorder = r.type === "download" ? "#dde2fb" : "#cdeede";
              const evLabel = r.type === "download" ? "Download" : "View";

              const avBg = r.isAnon ? "#f1f2f5" : `hsl(${bookHue},62%,94%)`;
              const avColor = r.isAnon ? "#9aa1ad" : `hsl(${bookHue},52%,42%)`;

              return (
                <div
                  key={r.id}
                  style={{
                    display: "grid", gridTemplateColumns: "128px 1.1fr 1.4fr 96px", gap: "12px",
                    padding: "13px 22px", borderBottom: "1px solid #f2f3f6", alignItems: "center",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#fafbfc"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
                >
                  {/* Event badge */}
                  <div>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 9px 4px 7px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, background: evBg, color: evColor, border: `1px solid ${evBorder}` }}>
                      {r.type === "download" ? <DownloadIcon color={evColor} /> : <EyeIcon color={evColor} />}
                      {evLabel}
                    </span>
                  </div>

                  {/* User */}
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                    <Avatar url={r.avatarUrl || null} name={r.name} email={r.email} size={32} className="!rounded-[9px]" />
                    <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "1px" }}>
                      <span style={{ fontSize: "13.5px", fontWeight: 600, color: "#1a1d24", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
                      <span style={{ fontSize: "11.5px", color: "#9aa1ad", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.email}</span>
                    </div>
                  </div>

                  {/* Book */}
                  <div style={{ display: "flex", alignItems: "center", gap: "11px", minWidth: 0 }}>
                    <div style={{ width: "26px", height: "34px", flexShrink: 0, borderRadius: "3px", background: `hsl(${bookHue},55%,58%)`, boxShadow: "inset -3px 0 0 rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.12)" }} />
                    <span style={{ fontSize: "13.5px", color: "#374151", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.book}</span>
                  </div>

                  {/* Time */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "1px", alignItems: "flex-end" }}>
                    <span style={{ fontSize: "13px", fontWeight: 500, color: "#374151" }}>{rel}</span>
                    <span style={{ fontSize: "11px", color: "#9aa1ad", fontFamily: "ui-monospace, 'Geist Mono', monospace" }}>{clock}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "13px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fafbfc", borderTop: "1px solid #eef0f4" }}>
          <span style={{ fontSize: "12.5px", color: "#9aa1ad" }}>
            Showing <strong style={{ color: "#374151", fontWeight: 600 }}>{Math.min(shownRows.length, totalCount)}</strong> of {totalCount} events
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={!hasPrev}
              style={{ height: "30px", padding: "0 12px", background: "#fff", border: "1px solid #e1e4ea", borderRadius: "8px", fontFamily: "inherit", fontSize: "12.5px", fontWeight: 500, color: hasPrev ? "#374151" : "#9aa1ad", cursor: hasPrev ? "pointer" : "default" }}
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasNext}
              style={{ height: "30px", padding: "0 12px", background: "#fff", border: "1px solid #e1e4ea", borderRadius: "8px", fontFamily: "inherit", fontSize: "12.5px", fontWeight: 500, color: hasNext ? "#374151" : "#9aa1ad", cursor: hasNext ? "pointer" : "default" }}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: .45; transform: scale(.82); }
        }
      `}</style>
    </div>
  );
}
