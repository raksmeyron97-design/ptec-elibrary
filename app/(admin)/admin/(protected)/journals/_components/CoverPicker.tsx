"use client";

// Journal and issue covers. Picking a file only SELECTS it: the bytes are
// uploaded when the form is saved (uploadJournalCover below), so an abandoned
// form leaves no orphan in storage, and a failed upload never clears the cover
// that is already there. Same lifecycle as TeamForm's photo.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ImageIcon } from "lucide-react";

import { uploadToZima } from "@/app/actions/upload";
import { BTN_SECONDARY, HINT_CLASS, ERROR_CLASS } from "@/components/admin/kit/form";
import { COVER_ACCEPT_ATTR, COVER_ACCEPTED_MIME, COVER_MAX_BYTES } from "@/lib/catalog-cover-shared";
import { isSafeImageSrc } from "@/lib/safe-image-src";

/** Journal covers live beside the articles' own files (`publications/` is the journals' upload resource). */
export const JOURNAL_COVER_FOLDER = "publications/journals";

/** Upload a picked cover; returns its public URL or throws with the storage error. */
export async function uploadJournalCover(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await uploadToZima(fd, JOURNAL_COVER_FOLDER);
  if ("error" in res) throw new Error(res.error);
  return res.publicUrl;
}

export type CoverValue = { url: string | null; file: File | null };

function formatSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CoverPicker({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: CoverValue;
  onChange: (next: CoverValue) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("adminJournals");
  const inputId = `cover${useId().replace(/:/g, "")}`;
  const hintId = `${inputId}-hint`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  // One object URL per picked file, released when the file changes or the picker unmounts.
  const preview = useMemo(() => (value.file ? URL.createObjectURL(value.file) : null), [value.file]);
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function pick(file: File | undefined) {
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    if (!(COVER_ACCEPTED_MIME as readonly string[]).includes(file.type)) {
      setError(t("coverWrongType"));
      return;
    }
    if (file.size > COVER_MAX_BYTES) {
      setError(t("coverTooBig", { size: formatSize(file.size) }));
      return;
    }
    setError(null);
    onChange({ url: value.url, file });
  }

  const shown = preview ?? (value.url && isSafeImageSrc(value.url) ? value.url : null);
  const hasCover = !!(value.file || value.url);

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-text-body">{label}</p>
      <div className="flex items-start gap-4">
        <div className="flex aspect-[3/4] w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-divider bg-paper">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-6 w-6 text-text-muted" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap gap-2">
            <label htmlFor={inputId} className={`${BTN_SECONDARY} cursor-pointer ${disabled ? "pointer-events-none opacity-60" : ""}`}>
              {hasCover ? t("coverReplace") : t("coverUpload")}
            </label>
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              accept={COVER_ACCEPT_ATTR}
              className="sr-only"
              aria-describedby={hintId}
              disabled={disabled}
              onChange={(e) => pick(e.target.files?.[0])}
            />
            {hasCover && (
              <button
                type="button"
                className={BTN_SECONDARY}
                disabled={disabled}
                onClick={() => {
                  setError(null);
                  onChange({ url: null, file: null });
                }}
              >
                {t("coverRemove")}
              </button>
            )}
          </div>
          {value.file && (
            <p className="text-xs text-text-body">
              {value.file.name} · {formatSize(value.file.size)} — {t("coverPending")}
            </p>
          )}
          {error ? (
            <p id={hintId} role="alert" className={ERROR_CLASS}>
              {error}
            </p>
          ) : (
            <p id={hintId} className={HINT_CLASS}>
              {t("coverHint")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
