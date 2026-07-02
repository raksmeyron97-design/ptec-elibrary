"use client";
/* eslint-disable @next/next/no-img-element */

import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";

interface CoverDropzoneProps {
  file: File | null;
  previewUrl: string | null;
  /** Currently-stored cover URL (edit mode only) */
  existingUrl?: string | null;
  /** True when the user has explicitly removed the existing cover (edit mode only) */
  removed?: boolean;
  onChange: (file: File | null) => void;
  onRemove?: () => void;
}

export default function CoverDropzone({
  file,
  previewUrl,
  existingUrl,
  removed = false,
  onChange,
  onRemove,
}: CoverDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (f && f.type.startsWith("image/")) onChange(f);
  };

  const displayUrl = previewUrl ?? (!removed ? existingUrl ?? null : null);
  const canRemove = !!onRemove && !!displayUrl;

  return (
    <div className="flex items-start gap-4">
      {displayUrl ? (
        <div className="relative h-32 w-[88px] shrink-0 overflow-hidden rounded-xl border border-divider shadow-md">
          <img src={displayUrl} alt="Cover preview" className="h-full w-full object-cover" />
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              aria-label="Remove cover"
              className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/65 text-white transition-colors hover:bg-black/85"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      ) : (
        <div className="flex h-32 w-[88px] shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-divider bg-paper text-center text-[11px] font-medium text-text-muted">
          {removed ? "Removed" : "No cover"}
        </div>
      )}

      <div
        className={`relative flex h-32 flex-1 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 text-center cursor-pointer transition-colors ${
          dragActive ? "border-brand bg-brand/5" : "border-divider bg-paper hover:border-brand hover:bg-bg-surface"
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => { e.preventDefault(); setDragActive(false); handleFiles(e.dataTransfer.files); }}
      >
        <ImagePlus className="h-6 w-6 text-text-muted" />
        <p className="text-xs leading-tight text-text-muted">
          <span className="font-semibold text-brand">{displayUrl ? "Click to replace" : "Click to upload"}</span> or drag and drop
        </p>
        <p className="text-[11px] text-text-muted/70">{file ? file.name : "PNG, JPG, WEBP"}</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onChange(e.target.files?.[0] || null)}
        />
      </div>
    </div>
  );
}
