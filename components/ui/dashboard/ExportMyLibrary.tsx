"use client";

import { useState } from "react";
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

const OPTIONS: { key: ExportType; label: string }[] = [
  { key: "reading",     label: "Reading Progress (.csv)" },
  { key: "saved",       label: "Saved Books (.csv)"      },
  { key: "annotations", label: "Annotations (.csv)"      },
  { key: "notes",       label: "Notes (.txt)"            },
];

export default function ExportMyLibrary() {
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState<ExportType | null>(null);

  const handle = async (type: ExportType) => {
    setLoading(type);
    setOpen(false);
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
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-text-body transition hover:bg-paper hover:text-brand"
      >
        <span className="text-text-muted flex-none">
          <Download className="h-4 w-4" />
        </span>
        Export My Library
        {loading
          ? <span className="ml-auto text-[11px] text-text-muted animate-pulse">Exporting…</span>
          : <ChevronDown className={`ml-auto h-3.5 w-3.5 text-text-muted transition-transform ${open ? "rotate-180" : ""}`} />
        }
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-3 top-full z-20 mt-1 w-52 rounded-xl border border-divider bg-bg-surface shadow-lg py-1.5 overflow-hidden">
            {OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => handle(opt.key)}
                className="flex w-full items-center gap-2.5 px-4 py-2 text-[12.5px] text-text-body transition hover:bg-paper hover:text-brand text-left"
              >
                <Download className="h-3.5 w-3.5 text-text-muted flex-none" />
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
