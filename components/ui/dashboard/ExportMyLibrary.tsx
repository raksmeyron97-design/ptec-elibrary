"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, ChevronDown } from "lucide-react";
import { getExportData } from "@/app/actions/export";

function toCSV(headers: string[], rows: string[][]): string {
  const esc = (s: string) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  return [headers.map(esc).join(","), ...rows.map(r => r.map(esc).join(","))].join("\n");
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob(["﻿" + content], { type: `${mimeType};charset=utf-8` });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type ExportType = "reading" | "saved" | "annotations" | "notes";

const OPTIONS: { key: ExportType; labelKey: "exportReading" | "exportSaved" | "exportAnnotations" | "exportNotes" }[] = [
  { key: "reading",     labelKey: "exportReading"     },
  { key: "saved",       labelKey: "exportSaved"       },
  { key: "annotations", labelKey: "exportAnnotations" },
  { key: "notes",       labelKey: "exportNotes"       },
];

export default function ExportMyLibrary() {
  const t = useTranslations("dashboard");
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState<ExportType | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs   = useRef<(HTMLButtonElement | null)[]>([]);

  // Menu-button pattern: opening moves focus into the menu, Escape hands it
  // back to the trigger. It used to open and leave focus on the trigger, so a
  // keyboard user had to Tab through an overlay to find the items at all.
  useEffect(() => {
    if (open) itemRefs.current[0]?.focus();
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") { e.preventDefault(); close(true); }
    else if (e.key === "Tab") close(false);
    else if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); items[items.length - 1]?.focus(); }
  };

  const handle = async (type: ExportType) => {
    setLoading(type);
    close(true);
    try {
      const data = await getExportData();
      if (!data) return;
      const date = new Date().toISOString().split("T")[0];

      if (type === "reading") {
        downloadFile(
          toCSV(
            ["Title", "Author", "Category", "Pages", "Progress %", "Last Read"],
            data.readingProgress.map(r => [r.title, r.author, r.category, String(r.pages), String(r.progress_pct), r.last_read_at]),
          ),
          `ptec-reading-${date}.csv`, "text/csv",
        );
      } else if (type === "saved") {
        downloadFile(
          toCSV(
            ["Title", "Author", "Category", "Department", "Saved On"],
            data.savedBooks.map(r => [r.title, r.author, r.category, r.department, r.saved_at]),
          ),
          `ptec-saved-${date}.csv`, "text/csv",
        );
      } else if (type === "annotations") {
        downloadFile(
          toCSV(
            ["Book", "Page", "Color", "Selected Text", "Note", "Date"],
            data.annotations.map(r => [r.book_title, String(r.page_number), r.highlight_color, r.selected_text, r.note_content, r.created_at]),
          ),
          `ptec-annotations-${date}.csv`, "text/csv",
        );
      } else if (type === "notes") {
        const txt = data.notes.length
          ? data.notes.map(n => `=== ${n.book_title} (${n.updated_at}) ===\n${n.content}\n`).join("\n")
          : "No notes saved yet.";
        downloadFile(txt, `ptec-notes-${date}.txt`, "text/plain");
      }
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        disabled={loading !== null}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? "export-library-menu" : undefined}
        className="focus-field inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl border border-divider bg-bg-surface px-3.5 text-[13px] font-semibold text-text-body transition-colors hover:border-brand/30 hover:text-brand disabled:cursor-wait disabled:opacity-70"
      >
        <Download className="h-4 w-4 text-text-muted" aria-hidden="true" />
        {loading
          ? <span role="status">{t("exporting")}</span>
          : <>
              {t("exportLibrary")}
              <ChevronDown className={`h-3.5 w-3.5 text-text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
            </>
        }
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" aria-hidden="true" onClick={() => close(false)} />
          <div
            id="export-library-menu"
            role="menu"
            aria-label={t("exportLibrary")}
            onKeyDown={onMenuKeyDown}
            className="absolute right-0 top-full z-20 mt-1.5 w-56 overflow-hidden rounded-xl border border-divider bg-bg-surface py-1.5 shadow-lg"
          >
            {OPTIONS.map((opt, i) => (
              <button
                key={opt.key}
                ref={(el) => { itemRefs.current[i] = el; }}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => handle(opt.key)}
                className="flex w-full cursor-pointer items-center gap-2.5 px-4 py-2.5 text-left text-[13px] text-text-body transition-colors hover:bg-paper hover:text-brand focus-visible:bg-paper focus-visible:text-brand focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
              >
                <Download className="h-3.5 w-3.5 flex-none text-text-muted" aria-hidden="true" />
                {t(opt.labelKey)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
