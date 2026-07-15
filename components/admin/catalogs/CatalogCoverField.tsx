"use client";
// components/admin/catalogs/CatalogCoverField.tsx
//
// "Book cover" section of the catalog add/edit forms. Three sources:
//   1. Upload to PTEC Storage  — file rides the form's FormData (cover_file);
//      the server action validates, re-encodes and pushes it to Zima Storage
//      when the book is saved, so an abandoned form never orphans a file.
//   2. External image URL      — hotlinked https URL (legacy behavior).
//   3. Auto-generated cover    — cover_url null; readers see GeneratedBookCover.
//
// The component only emits form fields (cover_mode, cover_file, cover_url) —
// no network calls of its own, and no storage credentials anywhere near it.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import GeneratedBookCover from "@/components/ui/books/GeneratedBookCover";
import {
  COVER_ACCEPT_ATTR,
  COVER_MAX_BYTES,
  COVER_MIN_WIDTH,
  COVER_MIN_HEIGHT,
  sniffImageType,
  type CoverSource,
} from "@/lib/catalog-cover-shared";

type Segment = "upload" | "external" | "generated";

type Props = {
  /** Saved cover URL (edit form) or null (add form / no cover). */
  initialCoverUrl: string | null;
  /** Derived server-side: "storage" | "external" | "generated". */
  initialSource: CoverSource;
  /** Live values that drive the generated-cover preview. */
  title: string;
  author?: string | null;
  category?: string | null;
  disabled?: boolean;
  /** Fired on interactions that don't bubble a form onChange (segment switch,
   *  drag-drop, remove) — lets the edit wizard flip its dirty flag. */
  onChanged?: () => void;
};

type SelectedFile = { file: File; objectUrl: string; width: number; height: number };

/** Decode an image client-side to get its intrinsic dimensions. */
function readImageSize(objectUrl: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = objectUrl;
  });
}

export default function CatalogCoverField({
  initialCoverUrl,
  initialSource,
  title,
  author,
  category,
  disabled = false,
  onChanged,
}: Props) {
  const t = useTranslations("adminCatalogCover");
  const uid = useId();

  const [segment, setSegment] = useState<Segment>(
    initialSource === "storage" ? "upload" : initialSource === "external" ? "external" : "upload",
  );
  const [selected, setSelected] = useState<SelectedFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [externalUrl, setExternalUrl] = useState(initialSource === "external" ? initialCoverUrl ?? "" : "");
  const [externalBroken, setExternalBroken] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Revoke the object URL of a replaced/removed selection.
  useEffect(() => () => { if (selected) URL.revokeObjectURL(selected.objectUrl); }, [selected]);

  // Catch external preview images that failed before hydration.
  const brokenProbeRef = useCallback((node: HTMLImageElement | null) => {
    if (node && node.complete && node.naturalWidth === 0) setExternalBroken(true);
  }, []);

  const hasStoredCover = initialSource === "storage" && !!initialCoverUrl;

  // What the server is asked to do on save.
  const coverMode: string =
    segment === "generated"
      ? initialSource === "generated" ? "keep" : "generated"
      : segment === "external"
        ? "external"
        : selected
          ? "upload"
          : "keep";

  async function acceptFile(file: File) {
    setFileError(null);

    if (file.size === 0) { setFileError(t("errUnreadable")); return; }
    if (file.size > COVER_MAX_BYTES) { setFileError(t("errTooLarge")); return; }

    // Sniff real magic bytes — same check the server repeats authoritatively.
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    if (!sniffImageType(head)) { setFileError(t("errBadType")); clearFileInput(); return; }

    const objectUrl = URL.createObjectURL(file);
    const size = await readImageSize(objectUrl);
    if (!size) {
      URL.revokeObjectURL(objectUrl);
      setFileError(t("errUnreadable"));
      clearFileInput();
      return;
    }
    if (size.width < COVER_MIN_WIDTH || size.height < COVER_MIN_HEIGHT) {
      URL.revokeObjectURL(objectUrl);
      setFileError(t("errTooSmall"));
      clearFileInput();
      return;
    }

    if (selected) URL.revokeObjectURL(selected.objectUrl);
    setSelected({ file, objectUrl, ...size });
    onChanged?.();
  }

  function clearFileInput() {
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeSelection() {
    if (selected) URL.revokeObjectURL(selected.objectUrl);
    setSelected(null);
    setFileError(null);
    clearFileInput();
    onChanged?.();
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    // Mirror the drop into the real input so the file submits with the form.
    if (fileInputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInputRef.current.files = dt.files;
    }
    void acceptFile(file);
  }

  const segBtn = (key: Segment, label: string) => (
    <button
      key={key}
      type="button"
      role="radio"
      aria-checked={segment === key}
      disabled={disabled}
      onClick={() => { setSegment(key); setFileError(null); onChanged?.(); }}
      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/40 ${
        segment === key
          ? "bg-brand text-white shadow-sm"
          : "text-text-muted hover:bg-paper hover:text-text-body"
      }`}
    >
      {label}
    </button>
  );

  const figureCls = "relative h-[128px] w-[92px] overflow-hidden rounded-lg border border-divider bg-bg-surface";
  const captionCls = "mt-1 text-center text-[9px] font-semibold text-text-muted";

  return (
    <fieldset className="rounded-xl border border-divider bg-paper/30 p-4">
      <legend className="px-1 text-xs font-bold uppercase tracking-wider text-text-muted">
        {t("label")}
      </legend>

      {/* Hidden intent field read by the server action */}
      <input type="hidden" name="cover_mode" value={coverMode} />

      {/* Source selector */}
      <div
        role="radiogroup"
        aria-label={t("modeGroupLabel")}
        className="inline-flex flex-wrap gap-1 rounded-xl border border-divider bg-bg-surface p-1"
      >
        {segBtn("upload", t("modeUpload"))}
        {segBtn("external", t("modeExternal"))}
        {segBtn("generated", t("modeGenerated"))}
      </div>

      {/* ── Upload panel ── */}
      <div hidden={segment !== "upload"} className="mt-3 space-y-3">
        {/* The real input stays mounted (and inside the form) in every segment
            so a chosen file survives tab switches; cover_mode decides whether
            the server uses it. */}
        <input
          ref={fileInputRef}
          id={`${uid}-cover-file`}
          name="cover_file"
          type="file"
          accept={COVER_ACCEPT_ATTR}
          disabled={disabled}
          className="peer sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void acceptFile(file);
          }}
        />

        {selected ? (
          <div className="flex flex-wrap items-start gap-4 rounded-xl border border-divider bg-bg-surface p-3">
            <figure className="w-[92px]">
              <div className={figureCls}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={selected.objectUrl} alt={t("coverPreviewAlt")} className="h-full w-full object-cover" />
              </div>
              <figcaption className={captionCls}>{t("selectedFile")}</figcaption>
            </figure>
            <div className="min-w-[160px] flex-1 space-y-2">
              <p className="break-all text-xs font-semibold text-text-body">{selected.file.name}</p>
              <p className="text-[11px] text-text-muted">
                {(selected.file.size / 1024 / 1024).toFixed(2)} MB · {selected.width}×{selected.height}px
              </p>
              <p className="text-[11px] text-text-muted">{t("uploadOnSave")}</p>
              {hasStoredCover && (
                <p className="text-[11px] font-semibold text-amber-600">{t("replaceOnSaveNote")}</p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-lg border border-divider px-3 py-1.5 text-xs font-semibold text-text-body transition hover:border-brand hover:text-brand"
                >
                  {t("replace")}
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={removeSelection}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                >
                  {t("removeSelection")}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-start gap-4">
            {hasStoredCover && (
              <figure className="w-[92px]">
                <div className={figureCls}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={initialCoverUrl!} alt={t("coverPreviewAlt")} className="h-full w-full object-cover" />
                </div>
                <figcaption className={captionCls}>{t("currentCover")}</figcaption>
              </figure>
            )}
            <label
              htmlFor={`${uid}-cover-file`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`flex min-h-[128px] min-w-[220px] flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center transition peer-focus-visible:ring-2 peer-focus-visible:ring-focus-ring/40 ${
                dragOver ? "border-brand bg-brand/5" : "border-divider bg-bg-surface hover:border-brand/50"
              } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <svg className="h-6 w-6 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-sm font-semibold text-text-body">{t("dropHere")}</span>
              <span className="text-xs font-semibold text-brand underline underline-offset-2">{t("orBrowse")}</span>
              <span className="mt-1 text-[10px] text-text-muted">{t("constraints")}</span>
              {hasStoredCover && (
                <span className="text-[10px] text-text-muted">{t("keepCurrentHint")}</span>
              )}
            </label>
          </div>
        )}

        <div aria-live="polite">
          {fileError && (
            <p role="alert" className="text-[11px] font-semibold text-red-500">{fileError}</p>
          )}
        </div>
      </div>

      {/* ── External URL panel ── */}
      <div hidden={segment !== "external"} className="mt-3 space-y-3">
        <label htmlFor={`${uid}-cover-url`} className="block text-xs font-bold uppercase tracking-wider text-text-muted">
          {t("externalLabel")}
        </label>
        <div className="flex gap-2">
          <input
            id={`${uid}-cover-url`}
            name="cover_url"
            type="url"
            value={externalUrl}
            disabled={disabled}
            placeholder="https://…"
            className="w-full rounded-xl border border-divider bg-paper/50 px-3.5 py-2.5 text-sm text-text-heading placeholder:text-text-muted outline-none transition focus:border-brand/50 focus:bg-bg-surface focus:ring-2 focus:ring-focus-ring/15"
            onChange={(e) => {
              let next = e.target.value;
              const match = next.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
              if (match) next = `https://lh3.googleusercontent.com/d/${match[1]}`;
              setExternalUrl(next);
              setExternalBroken(false); // re-probe the new URL
            }}
          />
          {externalUrl && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => { setExternalUrl(""); onChanged?.(); }}
              className="shrink-0 rounded-xl border border-divider px-3 py-1.5 text-xs font-semibold text-text-body transition hover:border-brand hover:text-brand"
            >
              {t("clearUrl")}
            </button>
          )}
        </div>
        <p className="text-[11px] text-text-muted">{t("externalHelp")}</p>

        {externalUrl.trim() && (
          <div className="flex flex-wrap items-start gap-4 rounded-xl border border-divider bg-bg-surface p-3" aria-live="polite">
            <figure className="w-[92px]">
              <div className={figureCls}>
                {externalBroken ? (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center">
                    <svg className="h-5 w-5 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                      <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" strokeLinecap="round" />
                    </svg>
                    <span className="text-[9px] font-bold leading-tight text-red-600">{t("urlBrokenCaption")}</span>
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    ref={brokenProbeRef}
                    src={externalUrl.trim()}
                    alt={t("coverPreviewAlt")}
                    className="h-full w-full object-cover"
                    onError={() => setExternalBroken(true)}
                  />
                )}
              </div>
              <figcaption className={captionCls}>
                {externalBroken ? t("urlBrokenCaption") : t("urlPreviewCaption")}
              </figcaption>
            </figure>
            {externalBroken && (
              <p role="alert" className="min-w-[160px] flex-1 text-[11px] font-semibold text-red-600">
                {t("urlBroken")}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Generated panel ── */}
      <div hidden={segment !== "generated"} className="mt-3">
        <div className="flex flex-wrap items-start gap-4 rounded-xl border border-divider bg-bg-surface p-3">
          <figure className="w-[92px]">
            <div className="relative h-[128px] w-[92px] overflow-hidden rounded-lg border border-divider">
              <GeneratedBookCover
                title={title || "Book title"}
                author={author}
                category={category}
                variant="card"
              />
            </div>
            <figcaption className={captionCls}>{t("generatedCaption")}</figcaption>
          </figure>
          <div className="min-w-[160px] flex-1 space-y-2">
            <p className="text-[11px] leading-relaxed text-text-muted">{t("generatedInfo")}</p>
            {hasStoredCover && (
              <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">
                {t("deleteOnSaveWarning")}
              </p>
            )}
          </div>
        </div>
      </div>
    </fieldset>
  );
}
