"use client";

/**
 * One modal for both "add a photo" and "edit this photo".
 *
 * They are the same form minus the file input, and splitting them into two
 * components is how the alt-text requirement drifts out of sync between the
 * create and edit paths — which is precisely the field a screen-reader user
 * depends on.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { ImagePlus, Loader2, UploadCloud, X } from "lucide-react";
import { PHOTO_CATEGORIES, type HomepagePhoto, type PhotoCategory } from "@/lib/types/homepage-photo";

const ACCEPT = "image/jpeg,image/png,image/webp,image/avif";
/** Mirrors MAX_IMAGE_UPLOAD_BYTES in lib/upload-content-guard.ts. Checked here
 *  only so an oversized file fails instantly instead of after the upload. */
const MAX_BYTES = 25 * 1024 * 1024;
const CAPTION_MAX = 200;
const ALT_MAX = 300;

export type PhotoFormValues = {
  file: File | null;
  caption_km: string;
  caption_en: string;
  alt_text_km: string;
  alt_text_en: string;
  category: PhotoCategory;
};

function initialValues(photo: HomepagePhoto | null): PhotoFormValues {
  return {
    file: null,
    caption_km: photo?.caption_km ?? "",
    caption_en: photo?.caption_en ?? "",
    alt_text_km: photo?.alt_text_km ?? "",
    alt_text_en: photo?.alt_text_en ?? "",
    category: photo?.category ?? "general",
  };
}

export default function PhotoFormModal({
  open,
  photo,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  /** null = create mode. */
  photo: HomepagePhoto | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (values: PhotoFormValues) => void;
}) {
  const t = useTranslations("adminHomepagePhotos");
  const baseId = useId();
  const isEdit = photo !== null;

  // Mount-time initialisation only — the parent gives this component a `key`
  // per target, so opening the modal for a different photo remounts it rather
  // than resetting six pieces of state from an effect.
  const [values, setValues] = useState<PhotoFormValues>(() => initialValues(photo));
  const [localError, setLocalError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Derived, not stored: an object URL is a pure function of the file. The
  // effect exists only to revoke it — an unrevoked blob URL pins the whole
  // file in memory until the tab closes.
  const preview = useMemo(
    () => (values.file ? URL.createObjectURL(values.file) : null),
    [values.file],
  );
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, busy, onCancel]);

  if (!open) return null;

  function acceptFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setLocalError(t("errorTooLarge"));
      return;
    }
    setLocalError(null);
    setValues((v) => ({ ...v, file }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isEdit && !values.file) {
      setLocalError(t("errorNoFile"));
      return;
    }
    if (!values.alt_text_km.trim() && !values.alt_text_en.trim()) {
      setLocalError(t("errorAltRequired"));
      return;
    }
    setLocalError(null);
    onSubmit(values);
  }

  const shown = localError ?? error;
  const field =
    "focus-field w-full rounded-lg border border-divider bg-bg-surface px-3 py-2 text-sm text-text-body outline-none placeholder:text-text-muted";
  const label = "mb-1 block text-xs font-semibold text-text-heading";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${baseId}-title`}
        className="w-full max-w-2xl rounded-2xl border border-divider bg-bg-surface shadow-xl"
      >
        <form onSubmit={submit} noValidate>
          {/* Header */}
          <div className="flex items-start gap-3 border-b border-divider px-6 py-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-950 text-white">
              <ImagePlus className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id={`${baseId}-title`} className="text-base font-bold text-text-heading">
                {isEdit ? t("editTitle") : t("addPhoto")}
              </h2>
              <p className="mt-0.5 text-xs text-text-muted">{t("formHint")}</p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="focus-field shrink-0 cursor-pointer rounded-lg p-1.5 text-text-muted transition hover:bg-paper disabled:opacity-50"
              aria-label={t("cancel")}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <div className="space-y-5 px-6 py-5">
            {shown && (
              <div role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger-text">
                {shown}
              </div>
            )}

            {/* File — create mode only. In edit mode the photo is fixed:
                replacing the image would silently change what a caption and
                alt text describe. Delete and re-upload instead. */}
            {!isEdit && (
              <div>
                <span className={label}>{t("fileLabel")}</span>
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    acceptFile(e.dataTransfer.files?.[0]);
                  }}
                  className={`rounded-xl border-2 border-dashed p-6 text-center transition ${
                    dragOver ? "border-brand bg-surface-brand-soft" : "border-divider bg-paper"
                  }`}
                >
                  {preview ? (
                    <div className="space-y-3">
                      {/* Local object URL — next/image would gain nothing over
                          a plain img for a blob: source. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={preview}
                        alt={t("previewAlt")}
                        className="mx-auto max-h-56 w-auto rounded-lg object-contain"
                      />
                      <p className="truncate text-xs text-text-muted">{values.file?.name}</p>
                      <button
                        type="button"
                        onClick={() => setValues((v) => ({ ...v, file: null }))}
                        className="focus-field cursor-pointer rounded-lg border border-divider px-3 py-1.5 text-xs font-semibold text-text-body transition hover:bg-bg-surface"
                      >
                        {t("chooseDifferent")}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <UploadCloud className="mx-auto h-8 w-8 text-text-muted" aria-hidden />
                      <p className="text-sm font-semibold text-text-heading">{t("dropzoneTitle")}</p>
                      <p className="text-xs text-text-muted">{t("dropzoneHint")}</p>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="focus-field mt-1 cursor-pointer rounded-lg border border-divider bg-bg-surface px-3.5 py-2 text-xs font-semibold text-text-body transition hover:bg-paper"
                      >
                        {t("browseFiles")}
                      </button>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPT}
                    className="sr-only"
                    onChange={(e) => acceptFile(e.target.files?.[0])}
                  />
                </div>
              </div>
            )}

            {isEdit && photo && (
              <div className="flex items-center gap-4 rounded-xl border border-divider bg-paper p-3">
                <span className="relative h-20 w-32 shrink-0 overflow-hidden rounded-lg bg-bg-surface">
                  <Image src={photo.public_url} alt="" fill sizes="128px" className="object-cover" />
                </span>
                <p className="text-xs text-text-muted">{t("editFileNote")}</p>
              </div>
            )}

            {/* Alt text — required, so it comes before the optional captions. */}
            <fieldset className="grid gap-4 sm:grid-cols-2">
              <legend className="mb-1 text-xs font-semibold text-text-heading">
                {t("altLegend")} <span className="text-danger">*</span>
              </legend>
              <div>
                <label className={label} htmlFor={`${baseId}-alt-km`}>{t("altTextKm")}</label>
                <input
                  id={`${baseId}-alt-km`}
                  className={field}
                  maxLength={ALT_MAX}
                  value={values.alt_text_km}
                  onChange={(e) => setValues((v) => ({ ...v, alt_text_km: e.target.value }))}
                  placeholder={t("altPlaceholder")}
                />
              </div>
              <div>
                <label className={label} htmlFor={`${baseId}-alt-en`}>{t("altTextEn")}</label>
                <input
                  id={`${baseId}-alt-en`}
                  className={field}
                  maxLength={ALT_MAX}
                  value={values.alt_text_en}
                  onChange={(e) => setValues((v) => ({ ...v, alt_text_en: e.target.value }))}
                  placeholder={t("altPlaceholder")}
                />
              </div>
              <p className="text-[11px] text-text-muted sm:col-span-2">{t("altHint")}</p>
            </fieldset>

            <fieldset className="grid gap-4 sm:grid-cols-2">
              <legend className="mb-1 text-xs font-semibold text-text-heading">{t("captionLegend")}</legend>
              <div>
                <label className={label} htmlFor={`${baseId}-caption-km`}>{t("captionKm")}</label>
                <input
                  id={`${baseId}-caption-km`}
                  className={field}
                  maxLength={CAPTION_MAX}
                  value={values.caption_km}
                  onChange={(e) => setValues((v) => ({ ...v, caption_km: e.target.value }))}
                />
              </div>
              <div>
                <label className={label} htmlFor={`${baseId}-caption-en`}>{t("captionEn")}</label>
                <input
                  id={`${baseId}-caption-en`}
                  className={field}
                  maxLength={CAPTION_MAX}
                  value={values.caption_en}
                  onChange={(e) => setValues((v) => ({ ...v, caption_en: e.target.value }))}
                />
              </div>
            </fieldset>

            <div className="sm:max-w-xs">
              <label className={label} htmlFor={`${baseId}-category`}>{t("category")}</label>
              <select
                id={`${baseId}-category`}
                className={field}
                value={values.category}
                onChange={(e) => setValues((v) => ({ ...v, category: e.target.value as PhotoCategory }))}
              >
                {PHOTO_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{t(`categories.${c}`)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-divider px-6 py-4">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="focus-field cursor-pointer rounded-lg border border-divider bg-bg-surface px-4 py-2 text-sm font-semibold text-text-body transition hover:bg-paper disabled:opacity-50"
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="focus-field inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-contrast transition hover:bg-brand-hover disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {busy ? t("saving") : isEdit ? t("saveChanges") : t("uploadAction")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
