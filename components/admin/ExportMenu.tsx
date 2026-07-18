"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertCircle, Check, ChevronDown, Download, FileSpreadsheet, FileText, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";

type Format = "xlsx" | "csv";

/**
 * Accessible "Export" split menu shared by the admin dashboard and Users
 * page: Excel workbook (.xlsx) as the recommended action, CSV as the
 * compatibility option. Downloads via fetch so the button can show a real
 * preparing/disabled state (no double downloads), surface the server's error
 * message with a retry, and report the record count from X-Export-Rows.
 *
 * `href` is the export endpoint including the current filter query — the
 * menu only appends `format=`. All authorization happens server-side.
 */
export default function ExportMenu({
  href,
  recordCount,
  buttonClassName,
  menuAlign = "right",
}: {
  href: string;
  /** Records the export will contain, shown in the menu header (optional). */
  recordCount?: number;
  /** Styles for the trigger, so the menu blends into its host toolbar. */
  buttonClassName?: string;
  menuAlign?: "left" | "right";
}) {
  const t = useTranslations("adminExport");
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<
    | { kind: "success"; filename: string; rows: string | null }
    | { kind: "error"; message: string; format: Format }
    | null
  >(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Move focus into the menu when it opens.
  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
  }, [open]);

  function onMenuKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [],
    );
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "ArrowDown" ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
    items[next].focus();
  }

  async function download(format: Format) {
    if (busy) return; // no duplicate downloads from repeated clicks
    setOpen(false);
    setBusy(true);
    setStatus(null);
    try {
      const url = `${href}${href.includes("?") ? "&" : "?"}format=${format}`;
      const res = await fetch(url);
      if (!res.ok) {
        let message = t("error");
        try {
          const data = (await res.json()) as { error?: string };
          if (data.error) message = data.error;
        } catch {
          /* non-JSON error body — keep the generic message */
        }
        setStatus({ kind: "error", message, format });
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") ?? "";
      const filename =
        /filename="([^"]+)"/.exec(disposition)?.[1] ?? `export.${format}`;
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
      setStatus({ kind: "success", filename, rows: res.headers.get("x-export-rows") });
    } catch {
      setStatus({ kind: "error", message: t("error"), format });
    } finally {
      setBusy(false);
    }
  }

  // Auto-dismiss the success note; errors stay until dismissed/retried.
  useEffect(() => {
    if (status?.kind !== "success") return;
    const timer = setTimeout(() => setStatus(null), 6000);
    return () => clearTimeout(timer);
  }, [status]);

  const itemClass =
    "flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-paper focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        className={
          buttonClassName ??
          "flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium text-text-muted transition-colors hover:bg-paper hover:text-text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        }
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        <span className="hidden sm:inline">{busy ? t("preparing") : t("export")}</span>
        <span className="sr-only sm:hidden">{busy ? t("preparing") : t("export")}</span>
        <ChevronDown className="h-3 w-3" aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={t("export")}
          onKeyDown={onMenuKeyDown}
          className={`absolute top-full z-40 mt-1 w-64 rounded-xl border border-divider bg-bg-surface p-1.5 shadow-xl ${
            menuAlign === "right" ? "right-0" : "left-0"
          }`}
        >
          {typeof recordCount === "number" && (
            <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              {t("menuTitle", { count: recordCount })}
            </p>
          )}
          <button type="button" role="menuitem" className={itemClass} onClick={() => download("xlsx")}>
            <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
            <span>
              <span className="block text-[13px] font-semibold text-text-heading">{t("xlsx")}</span>
              <span className="block text-[11.5px] text-text-muted">{t("xlsxHint")}</span>
            </span>
          </button>
          <button type="button" role="menuitem" className={itemClass} onClick={() => download("csv")}>
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
            <span>
              <span className="block text-[13px] font-semibold text-text-heading">{t("csv")}</span>
              <span className="block text-[11.5px] text-text-muted">{t("csvHint")}</span>
            </span>
          </button>
        </div>
      )}

      <div aria-live="polite">
        {status && (
          <div
            className={`absolute top-full z-40 mt-1 flex w-72 items-start gap-2 rounded-xl border p-3 text-[12.5px] shadow-xl ${
              menuAlign === "right" ? "right-0" : "left-0"
            } ${
              status.kind === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {status.kind === "success" ? (
              <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1 break-words">
              {status.kind === "success"
                ? status.rows !== null
                  ? t("successWithCount", { filename: status.filename, count: status.rows })
                  : t("success", { filename: status.filename })
                : status.message}
            </span>
            {status.kind === "error" && (
              <button
                type="button"
                onClick={() => download(status.format)}
                className="shrink-0 cursor-pointer rounded-md px-1.5 py-0.5 font-semibold underline hover:bg-red-100"
              >
                {t("retry")}
              </button>
            )}
            <button
              type="button"
              onClick={() => setStatus(null)}
              aria-label={t("dismiss")}
              className="shrink-0 cursor-pointer rounded-md p-0.5 hover:bg-black/5"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
