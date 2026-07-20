"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { FilePlus2, X, FileText, FileSpreadsheet, Presentation } from "lucide-react";
import PdfDropzone from "@/app/(admin)/admin/(protected)/theses/_components/PdfDropzone";
import CoverDropzone from "@/app/(admin)/admin/(protected)/theses/_components/CoverDropzone";
import {
  ALLOWED_SUPPLEMENTARY_MIMES,
  SUPPLEMENTARY_EXTENSION_LABELS,
  validateClientFile,
  type SupplementaryFile,
} from "@/lib/admin/thesis-file-validation";

const LABEL_CLASS = "block text-sm font-semibold text-text-body mb-1.5";

export type PendingSupplementaryFile = { file: File; description: string };

function iconFor(mimeType: string) {
  if (mimeType.includes("spreadsheet") || mimeType === "text/csv") return FileSpreadsheet;
  if (mimeType.includes("presentation")) return Presentation;
  return FileText;
}

function formatSize(bytes: number) {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function FilesStep({
  pdfFile, onPdfChange, existingPdfLabel,
  coverFile, coverPreview, existingCoverUrl, coverRemoved, onCoverChange, onCoverRemove,
  coverAltText, onCoverAltTextChange,
  supplementaryExisting, onRemoveExistingSupplementary,
  supplementaryNew, onAddSupplementary, onRemoveNewSupplementary, onSupplementaryDescriptionChange,
  disabled,
  fileError,
}: {
  pdfFile: File | null; onPdfChange: (f: File | null) => void; existingPdfLabel?: string | null;
  coverFile: File | null; coverPreview: string | null; existingCoverUrl?: string | null; coverRemoved: boolean;
  onCoverChange: (f: File | null) => void; onCoverRemove: () => void;
  coverAltText: string; onCoverAltTextChange: (v: string) => void;
  supplementaryExisting: SupplementaryFile[]; onRemoveExistingSupplementary: (url: string) => void;
  supplementaryNew: PendingSupplementaryFile[]; onAddSupplementary: (files: File[]) => void;
  onRemoveNewSupplementary: (index: number) => void; onSupplementaryDescriptionChange: (index: number, description: string) => void;
  disabled?: boolean;
  fileError?: string | null;
}) {
  const t = useTranslations("adminThesisForm.files");
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const valid: File[] = [];
    for (const file of Array.from(files)) {
      const result = validateClientFile(file, "supplementary");
      if (!result.ok) { setLocalError(result.error); continue; }
      valid.push(file);
    }
    if (valid.length) { setLocalError(null); onAddSupplementary(valid); }
  }

  return (
    <div className="space-y-6">
      <div>
        <label className={LABEL_CLASS}>
          {t("pdfThesis")} <span className="text-red-500">*</span>
        </label>
        <PdfDropzone file={pdfFile} onChange={onPdfChange} existingLabel={existingPdfLabel} />
        {fileError && <p className="mt-1.5 text-xs text-red-600">{fileError}</p>}
      </div>

      <div>
        <label className={LABEL_CLASS}>{t("coverImage")}</label>
        <CoverDropzone
          file={coverFile}
          previewUrl={coverPreview}
          existingUrl={existingCoverUrl}
          removed={coverRemoved}
          onChange={onCoverChange}
          onRemove={onCoverRemove}
        />
        <div className="mt-2">
          <label className="mb-1 block text-xs font-semibold text-text-muted">{t("altText")}</label>
          <input
            value={coverAltText}
            onChange={(e) => onCoverAltTextChange(e.target.value)}
            disabled={disabled}
            placeholder={t("altPlaceholder")}
            className="h-9 w-full rounded-lg border border-divider bg-transparent px-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15"
          />
        </div>
      </div>

      <hr className="border-divider" />

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className={LABEL_CLASS.replace("mb-1.5", "")}>{t("supplementary")}</label>
          <span className="text-xs text-text-muted">{t("supplementaryHint")}</span>
        </div>

        {(supplementaryExisting.length > 0 || supplementaryNew.length > 0) && (
          <ul className="mb-3 space-y-2">
            {supplementaryExisting.map((f) => {
              const Icon = iconFor(f.mimeType);
              return (
                <li key={f.url} className="flex items-center gap-3 rounded-lg border border-divider bg-bg-surface px-3 py-2">
                  <Icon className="h-4 w-4 shrink-0 text-brand" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-text-body">{f.filename}</p>
                    <p className="text-[11px] text-text-muted">{SUPPLEMENTARY_EXTENSION_LABELS[f.mimeType] ?? f.mimeType} · {formatSize(f.size)}</p>
                  </div>
                  <button type="button" onClick={() => onRemoveExistingSupplementary(f.url)} disabled={disabled} aria-label={t("remove", { name: f.filename })} className="text-text-muted hover:text-red-500 disabled:opacity-40">
                    <X className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
            {supplementaryNew.map((item, i) => {
              const Icon = iconFor(item.file.type);
              return (
                <li key={i} className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50/40 px-3 py-2">
                  <Icon className="h-4 w-4 shrink-0 text-emerald-600" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-text-body">{item.file.name}</p>
                    <input
                      value={item.description}
                      onChange={(e) => onSupplementaryDescriptionChange(i, e.target.value)}
                      disabled={disabled}
                      placeholder={t("optionalDescription")}
                      className="mt-1 h-7 w-full rounded border border-divider bg-transparent px-2 text-xs outline-none focus:border-brand"
                    />
                  </div>
                  <button type="button" onClick={() => onRemoveNewSupplementary(i)} disabled={disabled} aria-label={t("remove", { name: item.file.name })} className="text-text-muted hover:text-red-500 disabled:opacity-40">
                    <X className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div
          className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-6 text-center cursor-pointer transition-colors ${
            dragActive ? "border-brand bg-brand/5" : "border-divider bg-paper hover:border-brand"
          }`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => { e.preventDefault(); setDragActive(false); handleFiles(e.dataTransfer.files); }}
        >
          <FilePlus2 className="h-5 w-5 text-text-muted" />
          <p className="text-xs text-text-muted">
            <span className="font-semibold text-brand">{t("clickUpload")}</span> {t("orDragDrop")}
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ALLOWED_SUPPLEMENTARY_MIMES.join(",")}
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
        {localError && <p className="mt-1.5 text-xs text-red-600">{localError}</p>}
      </div>
    </div>
  );
}
