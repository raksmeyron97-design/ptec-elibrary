"use client";

import { useRef, useState } from "react";
import { FileText } from "lucide-react";

interface PdfDropzoneProps {
  file: File | null;
  onChange: (file: File | null) => void;
  /** Shown when no new file is selected but one already exists (edit mode) */
  existingLabel?: string | null;
  actionLabel?: string;
}

function formatSize(bytes: number) {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function PdfDropzone({ file, onChange, existingLabel, actionLabel = "Click to upload" }: PdfDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (f && f.type === "application/pdf") onChange(f);
  };

  return (
    <div
      className={`relative flex flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed px-6 py-8 text-center cursor-pointer group transition-colors ${
        file
          ? "border-emerald-400 bg-emerald-50/40"
          : dragActive
          ? "border-brand bg-brand/5"
          : "border-divider bg-paper hover:border-brand"
      }`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(e) => { e.preventDefault(); setDragActive(false); handleFiles(e.dataTransfer.files); }}
    >
      <span className={`dz-chip ${file ? "" : "dz-chip--pdf"}`} style={file ? { background: "linear-gradient(135deg, #0f9d6b, #0c7a55)" } : undefined}>
        <FileText className="h-6 w-6" />
      </span>
      <div className="min-w-0">
        <p className="text-sm">
          <span className="font-semibold text-brand">{file ? "Click to replace" : actionLabel}</span>{" "}
          <span className="text-text-muted">or drag and drop</span>
        </p>
        <p className="mt-0.5 max-w-xs truncate text-xs text-text-muted/80">
          {file ? `${file.name} · ${formatSize(file.size)}` : existingLabel ?? "PDF files only"}
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] || null)}
      />
    </div>
  );
}
