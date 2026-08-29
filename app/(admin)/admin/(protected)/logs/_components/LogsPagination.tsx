"use client";

// Server-side pagination, presented honestly: the range of rows on screen and
// the true total, so "Showing 1–20 of 428" tells a reader both where they are
// and how much work is left. Page changes go through the same URL writer as
// every other filter, so all active filters survive a page change.

import { useTranslations } from "next-intl";
import { INK, INK2, INK3, LINE, LINE_SUBTLE, SURFACE, srOnly, ChevronIcon } from "./logs-ui";

/** Page numbers with ellipses: first, last, and a window around the current
 *  one. Returns numbers plus "gap" markers so the caller renders, not
 *  computes. Pages are 0-indexed, matching the server. */
export function pageWindow(page: number, totalPages: number): Array<number | "gap"> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i);
  const out: Array<number | "gap"> = [0];
  const from = Math.max(1, Math.min(page - 1, totalPages - 4));
  const to = Math.min(totalPages - 2, Math.max(page + 1, 3));
  if (from > 1) out.push("gap");
  for (let i = from; i <= to; i++) out.push(i);
  if (to < totalPages - 2) out.push("gap");
  out.push(totalPages - 1);
  return out;
}

export default function LogsPagination({
  page, pageSize, total, totalPages, onPage, pending,
}: {
  page: number; pageSize: number; total: number; totalPages: number;
  onPage: (page: number) => void; pending: boolean;
}) {
  const t = useTranslations("adminLogs");

  if (totalPages <= 1) {
    return (
      <div style={bar}>
        <span style={{ fontSize: 12.5, color: INK3 }}>{t("pagination.totalOnly", { count: total })}</span>
      </div>
    );
  }

  const from = page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  const atStart = page <= 0;
  const atEnd = page + 1 >= totalPages;

  return (
    <nav style={bar} aria-label={t("pagination.label")}>
      <p style={{ fontSize: 12.5, color: INK2 }}>
        <span className="logs-desktop-inline">{t("pagination.showing", { from, to, total })}</span>
        <span className="logs-mobile-inline">{t("pagination.showingShort", { from, to, total })}</span>
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <button type="button" disabled={atStart || pending} onClick={() => onPage(page - 1)} aria-label={t("pagination.prev")} style={{ ...navBtn, opacity: atStart ? 0.45 : 1 }}>
          <ChevronIcon size={14} dir="left" />
          <span className="logs-desktop-inline">{t("pagination.prev")}</span>
        </button>

        {/* Page numbers are a desktop affordance: at 375px they crowd out the
            prev/next controls, which are the ones a thumb reliably hits. */}
        <span className="logs-desktop-flex" style={{ alignItems: "center", gap: 4 }}>
          {pageWindow(page, totalPages).map((entry, i) =>
            entry === "gap" ? (
              <span key={`gap-${i}`} aria-hidden style={{ padding: "0 2px", color: INK3, fontSize: 12.5 }}>…</span>
            ) : (
              <button
                key={entry}
                type="button"
                onClick={() => onPage(entry)}
                disabled={pending}
                aria-current={entry === page ? "page" : undefined}
                aria-label={t("pagination.gotoPage", { page: entry + 1 })}
                style={{
                  ...navBtn, minWidth: 32, justifyContent: "center", padding: "0 8px",
                  fontVariantNumeric: "tabular-nums",
                  background: entry === page ? "var(--dash-blue)" : SURFACE,
                  color: entry === page ? "#fff" : INK2,
                  borderColor: entry === page ? "var(--dash-blue)" : LINE,
                }}
              >
                {entry + 1}
              </button>
            ),
          )}
        </span>
        <span className="logs-mobile-inline" style={{ fontSize: 12.5, color: INK, fontWeight: 600, padding: "0 6px", fontVariantNumeric: "tabular-nums" }}>
          {t("pagination.pageOf", { page: page + 1, pages: totalPages })}
        </span>

        <button type="button" disabled={atEnd || pending} onClick={() => onPage(page + 1)} aria-label={t("pagination.next")} style={{ ...navBtn, opacity: atEnd ? 0.45 : 1 }}>
          <span className="logs-desktop-inline">{t("pagination.next")}</span>
          <ChevronIcon size={14} />
        </button>
      </div>

      <span aria-live="polite" style={srOnly}>{t("pagination.showing", { from, to, total })}</span>
    </nav>
  );
}

const bar: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  gap: 12, flexWrap: "wrap", padding: "11px 16px", borderTop: `1px solid ${LINE_SUBTLE}`,
};
const navBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5, height: 32, padding: "0 10px",
  borderRadius: 8, border: `1px solid ${LINE}`, background: SURFACE,
  fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: INK2, cursor: "pointer",
};
