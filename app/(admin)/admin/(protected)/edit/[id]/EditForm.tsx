"use client";
/* eslint-disable @typescript-eslint/no-unused-vars */

import { useState, useRef, Fragment } from "react";
import Image from "next/image";
import { updateBook } from "@/app/(admin)/admin/(protected)/books/actions";
import { replaceBookFile } from "@/app/actions/ebooks";
import {
  makeUid,
  bookFolder,
  bookCoverPath,
  bookPdfPath,
  bookFolderFromCoverUrl,
  LICENSE_OPTIONS,
} from "@/lib/book-utils";
import { formatFileSize } from "@/lib/admin/ebooks-shared";
import Icon from "@/components/ui/core/Icon";
import TagInput from "@/components/ui/core/TagInput";
import SearchableSelect from "@/components/ui/search/SearchableSelect";
import BookSeoPanel from "@/components/admin/ebooks/BookSeoPanel";
import { ImagePlus, UploadCloud, Save, BookOpen, AlertCircle, X, FileText, Info, Download } from "lucide-react";

type Initial = {
  id: string;
  slug: string;
  title: string;
  author: string;
  category: string;
  department: string;
  language: string;
  isbn: string;
  publisher: string;
  year: number;
  pages: number;
  summary: string;
  coverUrl: string | null;
  tags: string[];
  license?: string;
  fileUrl: string | null;
  fileSizeKb: number | null;
  fileFormat: string | null;
};

type Phase = "idle" | "uploading-pdf" | "uploading-cover" | "saving";

const INPUT_CLASS =
  "h-11 w-full rounded-xl border border-divider bg-bg-surface px-4 text-sm outline-none transition-all " +
  "focus:border-[#4f46e5] focus:ring-2 focus:ring-[#4f46e5]/10 disabled:bg-paper disabled:opacity-60 " +
  "placeholder:text-text-muted/60 text-text-body";

const SELECT_CLASS =
  "h-11 w-full rounded-xl border border-divider bg-bg-surface px-4 text-sm outline-none transition-all " +
  "focus:border-[#4f46e5] focus:ring-2 focus:ring-[#4f46e5]/10 disabled:opacity-60 text-text-body";

function activatePickerFromKeyboard(
  e: React.KeyboardEvent<HTMLDivElement>,
  openPicker: () => void,
) {
  if (e.key !== "Enter" && e.key !== " ") return;
  e.preventDefault();
  openPicker();
}

function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">
      {children}{" "}
      {required && (
        <span className="normal-case tracking-normal font-normal text-rose-500">*</span>
      )}
    </span>
  );
}

function PhaseStepper({ phase }: { phase: Phase }) {
  if (phase === "idle") return null;
  const steps = [
    { id: "uploading-pdf",   label: "Uploading PDF",   color: "#7c3aed" },
    { id: "uploading-cover", label: "Uploading cover", color: "#0e7490" },
    { id: "saving",          label: "Saving record",   color: "#0f9d6b" },
  ] as const;
  const order = steps.map((s) => s.id as string);
  const ci = order.indexOf(phase);

  return (
    <div
      className="flex items-center gap-4 rounded-2xl border px-5 py-3.5"
      style={{ borderColor: "#A5F3FC", background: "#ECFEFF" }}
    >
      <div className="flex flex-1 items-center gap-2">
        {steps.map((step, i) => {
          const isDone = i < ci;
          const isActive = i === ci;
          return (
            <Fragment key={step.id}>
              {i > 0 && (
                <div
                  className="h-px flex-1 rounded-full transition-colors duration-500"
                  style={{ background: isDone ? "#0f9d6b" : "#A5F3FC" }}
                />
              )}
              <div className="flex shrink-0 items-center gap-1.5">
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold transition-all"
                  style={
                    isDone
                      ? { background: "#0f9d6b", color: "#fff" }
                      : isActive
                      ? { background: step.color, color: "#fff" }
                      : { background: "#DDE8F0", color: "#9CA3AF" }
                  }
                >
                  {isDone ? "✓" : i + 1}
                </span>
                <span
                  className="text-xs font-semibold"
                  style={{ color: isActive ? step.color : isDone ? "#0f9d6b" : "#9CA3AF" }}
                >
                  {step.label}
                </span>
              </div>
            </Fragment>
          );
        })}
      </div>
      <div
        className="flex shrink-0 items-center gap-1.5 text-xs font-medium"
        style={{ color: "#0e7490" }}
      >
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        {phase === "uploading-pdf" ? "Uploading PDF…" : phase === "uploading-cover" ? "Uploading cover…" : "Saving…"}
      </div>
    </div>
  );
}

export default function EditForm({
  initial,
  departments,
  categories,
}: {
  initial: Initial;
  departments: string[];
  categories: string[];
}) {
  const [phase, setPhase]         = useState<Phase>("idle");
  const [error, setError]         = useState<string | null>(null);
  const [preview, setPreview]     = useState<string | null>(initial.coverUrl ?? null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const fileInputRef              = useRef<HTMLInputElement>(null);
  const coverZoneRef              = useRef<HTMLDivElement>(null);

  const [pdfFile, setPdfFile]     = useState<File | null>(null);
  const pdfInputRef               = useRef<HTMLInputElement>(null);

  // Live snapshot of the SEO-relevant fields for the quality panel. Read from
  // the form on every input so the panel + Google preview stay in sync without
  // converting every field to a controlled input.
  const [seoState, setSeoState] = useState({
    title: initial.title,
    summary: initial.summary,
    author: initial.author,
    language: initial.language,
    isbn: initial.isbn,
    publisher: initial.publisher,
    year: initial.year || null,
    pages: initial.pages || null,
    tags: initial.tags,
  });

  function handleFormInput(e: React.FormEvent<HTMLFormElement>) {
    const fd = new FormData(e.currentTarget);
    const num = (v: FormDataEntryValue | null) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    setSeoState({
      title: String(fd.get("title") ?? ""),
      summary: String(fd.get("summary") ?? ""),
      author: String(fd.get("author") ?? ""),
      language: String(fd.get("language") ?? ""),
      isbn: String(fd.get("isbn") ?? ""),
      publisher: String(fd.get("publisher") ?? ""),
      year: num(fd.get("year")),
      pages: num(fd.get("pages")),
      tags: fd.getAll("tags").map(String).filter(Boolean),
    });
  }

  const saving = phase !== "idle";

  function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/avif"];
    if (!allowed.includes(file.type)) { setError("Cover must be JPEG, PNG, WebP, or AVIF"); return; }
    if (file.size > 5 * 1024 * 1024)  { setError("Cover image must be under 5 MB"); return; }
    setError(null);
    setCoverFile(file);
    setPreview(URL.createObjectURL(file));
  }

  function removeCover() {
    setCoverFile(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handlePdfChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") { setError("File must be a PDF"); return; }
    if (file.size > 100 * 1024 * 1024)   { setError("PDF must be under 100 MB"); return; }
    setError(null);
    setPdfFile(file);
  }

  function removePdf() {
    setPdfFile(null);
    if (pdfInputRef.current) pdfInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form     = e.currentTarget;
    const formData = new FormData(form);
    const title    = (formData.get("title") as string)?.trim() || initial.title;

    try {
      if (pdfFile) {
        setPhase("uploading-pdf");
        const folder =
          bookFolderFromCoverUrl(initial.coverUrl) ??
          bookFolder(initial.category, title, makeUid());
        const path = bookPdfPath(folder);

        const pdfPayload = new FormData();
        pdfPayload.set("file", pdfFile);
        pdfPayload.set("key", path);
        pdfPayload.set("target", "private");
        pdfPayload.set("excludeType", "book");
        pdfPayload.set("excludeId", initial.id);

        const uploadRes = await fetch("/api/admin/upload", { method: "POST", body: pdfPayload });
        const data = await uploadRes.json().catch(() => ({}));
        if (!uploadRes.ok) throw new Error(data.error ?? `PDF upload failed (${uploadRes.status})`);

        const replaceResult = await replaceBookFile(initial.id, {
          fileUrl: data.url,
          fileSizeKb: Math.round(pdfFile.size / 1024),
          contentHash: data.contentHash ?? null,
        });
        if (!replaceResult.success) throw new Error(replaceResult.error ?? "Failed to save the new PDF");
        removePdf();
      }

      let newCoverUrl: string | null = null;

      if (coverFile) {
        setPhase("uploading-cover");
        const folder =
          bookFolderFromCoverUrl(initial.coverUrl) ??
          bookFolder(initial.category, title, makeUid());
        const path = bookCoverPath(folder, coverFile.name);

        const coverPayload = new FormData();
        coverPayload.set("file", coverFile);
        coverPayload.set("key", path);
        coverPayload.set("target", "public");

        const uploadRes = await fetch("/api/admin/upload", { method: "POST", body: coverPayload });
        if (!uploadRes.ok) {
          const data = await uploadRes.json().catch(() => ({}));
          throw new Error(data.error ?? `Cover upload failed (${uploadRes.status})`);
        }
        const { url } = await uploadRes.json();
        newCoverUrl = url;
      }

      if (newCoverUrl)           formData.set("coverUrl", newCoverUrl);
      else if (preview === null) formData.set("coverUrl", "__remove__");

      setPhase("saving");
      await updateBook(initial.id, formData);
    } catch (err) {
      setPhase("idle");
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  const phaseLabel: Record<Phase, string> = {
    "idle":            "Save changes",
    "uploading-pdf":   "Uploading PDF…",
    "uploading-cover": "Uploading cover…",
    "saving":          "Saving…",
  };

  return (
    <form onSubmit={handleSubmit} onInput={handleFormInput} className="space-y-5">

      {/* ── Phase progress ── */}
      <PhaseStepper phase={phase} />

      {/* ── Info banner ── */}
      <div
        className="flex items-center gap-3 rounded-xl border px-4 py-3"
        style={{ borderColor: "#C7D2FE", background: "#EEF2FF" }}
      >
        <Info className="h-4 w-4 shrink-0" style={{ color: "#4f46e5" }} />
        <p className="text-xs" style={{ color: "#4f46e5" }}>
          Editing metadata, cover image, and PDF file for this e-book.
        </p>
      </div>

      {/* ── PDF file card ── */}
      <div id="replace-pdf" className="form-card-accent scroll-mt-24 overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm">
        <div className="flex items-center gap-3.5 border-b border-divider bg-paper/60 px-6 py-4">
          <span className="sec-chip sec-chip--files">
            <FileText className="h-[18px] w-[18px]" />
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-text-heading">PDF File</h2>
            <p className="text-xs text-text-muted">PDF only · max 100 MB · recommended under 25 MB</p>
          </div>
          {!pdfFile && (
            <span
              className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold"
              style={initial.fileUrl ? { background: "rgba(15,157,107,0.10)", color: "#0f9d6b" } : { background: "rgba(220,38,38,0.10)", color: "#dc2626" }}
            >
              {initial.fileUrl ? "PDF ready" : "Missing PDF"}
            </span>
          )}
          {pdfFile && (
            <span
              className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold"
              style={{ background: "rgba(221,176,34,0.12)", color: "#806211" }}
            >
              New PDF selected
            </span>
          )}
        </div>

        <div className="p-6 space-y-3">
          {initial.fileUrl && !pdfFile && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-divider bg-paper px-4 py-3">
              <div className="flex min-w-0 items-center gap-2 text-sm text-text-body">
                <FileText className="h-4 w-4 shrink-0 text-text-muted" />
                <span className="truncate">Current file · {(initial.fileFormat ?? "pdf").toUpperCase()} · {formatFileSize(initial.fileSizeKb)}</span>
              </div>
              <a
                href={initial.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-brand hover:underline"
              >
                <Download className="h-3.5 w-3.5" /> Open
              </a>
            </div>
          )}

          <div
            role="button"
            tabIndex={saving ? -1 : 0}
            aria-label={pdfFile ? "Replace PDF file" : initial.fileUrl ? "Replace PDF file" : "Upload PDF file"}
            className="relative flex h-24 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-divider bg-paper px-4 text-center transition-all hover:border-brand hover:bg-bg-surface cursor-pointer"
            onClick={() => !saving && pdfInputRef.current?.click()}
            onKeyDown={(e) => activatePickerFromKeyboard(e, () => !saving && pdfInputRef.current?.click())}
          >
            <UploadCloud className="h-5 w-5 text-text-muted" />
            <p className="text-xs text-text-muted leading-tight">
              {pdfFile ? `Selected: ${pdfFile.name}` : initial.fileUrl ? "Click to replace PDF" : "Click to upload PDF"}
            </p>
            <p className="max-w-sm text-[11px] leading-4 text-text-muted">
              Compress scanned PDFs before uploading so the online reader stays fast.
            </p>
            <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf"
              aria-label="PDF file"
              disabled={saving}
              onChange={handlePdfChange}
              className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
            />
          </div>

          {pdfFile && (
            <button
              type="button"
              onClick={removePdf}
              disabled={saving}
              className="text-xs font-semibold text-text-muted hover:text-red-600 disabled:opacity-50"
            >
              Cancel PDF replacement
            </button>
          )}
        </div>
      </div>

      {/* ── Cover image card ── */}
      <div id="cover" className="form-card-accent scroll-mt-24 overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm">
        <div className="flex items-center gap-3.5 border-b border-divider bg-paper/60 px-6 py-4">
          <span className="sec-chip sec-chip--files">
            <ImagePlus className="h-[18px] w-[18px]" />
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-text-heading">Cover Image</h2>
            <p className="text-xs text-text-muted">JPEG, PNG, WebP · max 5 MB</p>
          </div>
          {preview && !coverFile && (
            <span
              className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold"
              style={{ background: "rgba(15,157,107,0.10)", color: "#0f9d6b" }}
            >
              Current cover
            </span>
          )}
          {coverFile && (
            <span
              className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold"
              style={{ background: "rgba(221,176,34,0.12)", color: "#806211" }}
            >
              New cover selected
            </span>
          )}
        </div>

        <div className="p-6">
          <div className="flex items-start gap-4">
            {/* Preview */}
            {preview ? (
              <div className="relative h-36 w-24 shrink-0 overflow-hidden rounded-xl border border-divider shadow-md">
                <Image
                  src={preview}
                  alt="Cover preview"
                  fill
                  sizes="96px"
                  className="object-cover"
                />
                <button
                  type="button"
                  onClick={removeCover}
                  disabled={saving}
                  title="Remove cover"
                  aria-label="Remove cover"
                  className="absolute right-1 top-1 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-black/65 text-white transition-colors hover:bg-black/85 disabled:opacity-50"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <div className="flex h-36 w-24 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-divider bg-paper text-[11px] font-medium text-text-muted">
                No cover
              </div>
            )}

            {/* Dropzone */}
            <div
              ref={coverZoneRef}
              role="button"
              tabIndex={saving ? -1 : 0}
              aria-label={preview ? "Replace cover image" : "Upload cover image"}
              className="relative flex h-36 flex-1 flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed border-divider bg-paper px-4 text-center transition-all hover:border-brand hover:bg-bg-surface cursor-pointer"
              onClick={() => !saving && fileInputRef.current?.click()}
              onKeyDown={(e) => activatePickerFromKeyboard(e, () => !saving && fileInputRef.current?.click())}
            >
              <ImagePlus className="h-6 w-6 text-text-muted" />
              <p className="text-xs text-text-muted leading-tight">
                {preview
                  ? coverFile
                    ? `Selected: ${coverFile.name}`
                    : "Click to replace cover"
                  : "Click to select cover image"}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                aria-label="Cover image"
                disabled={saving}
                onChange={handleCoverChange}
                className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Book details card ── */}
      <div className="form-card-accent overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm">
        <div className="flex items-center gap-3.5 border-b border-divider bg-paper/60 px-6 py-4">
          <span className="sec-chip sec-chip--details">
            <BookOpen className="h-[18px] w-[18px]" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-text-heading">Book Details</h2>
            <p className="text-xs text-text-muted">Title, author, category, and more</p>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Title — full width */}
          <label className="block">
            <FieldLabel required>Title</FieldLabel>
            <input
              name="title"
              required
              defaultValue={initial.title}
              placeholder="Book title"
              disabled={saving}
              className={INPUT_CLASS}
            />
          </label>

          <div className="grid gap-5 md:grid-cols-2">
            {/* Author */}
            <label>
              <FieldLabel required>Author</FieldLabel>
              <input
                name="author"
                required
                defaultValue={initial.author}
                placeholder="Author or institution"
                disabled={saving}
                className={INPUT_CLASS}
              />
            </label>

            {/* Language */}
            <label>
              <FieldLabel required>Language</FieldLabel>
              <input
                name="language"
                required
                defaultValue={initial.language}
                disabled={saving}
                className={INPUT_CLASS}
              />
            </label>

            {/* ISBN */}
            <label>
              <FieldLabel>ISBN</FieldLabel>
              <input
                name="isbn"
                defaultValue={initial.isbn}
                placeholder="Optional"
                disabled={saving}
                className={INPUT_CLASS}
              />
            </label>

            {/* Publisher */}
            <label>
              <FieldLabel>Publisher</FieldLabel>
              <input
                name="publisher"
                defaultValue={initial.publisher}
                placeholder="Optional"
                disabled={saving}
                className={INPUT_CLASS}
              />
            </label>

            {/* License */}
            <label>
              <FieldLabel>License</FieldLabel>
              <select name="license" disabled={saving} defaultValue={initial.license ?? ""} className={SELECT_CLASS}>
                {LICENSE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>

            {/* Category */}
            <div>
              <FieldLabel required>Category</FieldLabel>
              <SearchableSelect
                name="category"
                required
                options={categories}
                defaultValue={initial.category}
                disabled={saving}
              />
            </div>

            {/* Department */}
            <div>
              <FieldLabel required>Department</FieldLabel>
              <SearchableSelect
                name="department"
                required
                options={departments}
                defaultValue={initial.department}
                disabled={saving}
              />
            </div>

            {/* Year */}
            <label>
              <FieldLabel>Year</FieldLabel>
              <input
                name="year"
                type="number"
                min="1900"
                max="2099"
                defaultValue={initial.year}
                disabled={saving}
                className={INPUT_CLASS}
              />
            </label>

            {/* Pages */}
            <label>
              <FieldLabel>Pages</FieldLabel>
              <input
                name="pages"
                type="number"
                min="1"
                defaultValue={initial.pages}
                disabled={saving}
                className={INPUT_CLASS}
              />
            </label>
          </div>

          {/* Summary */}
          <label className="block">
            <FieldLabel required>Summary</FieldLabel>
            <textarea
              name="summary"
              required
              rows={4}
              defaultValue={initial.summary}
              disabled={saving}
              className="w-full resize-none rounded-xl border border-divider bg-bg-surface p-4 text-sm outline-none transition-all focus:border-[#4f46e5] focus:ring-2 focus:ring-[#4f46e5]/10 disabled:bg-paper disabled:opacity-60 placeholder:text-text-muted/60 text-text-body"
            />
          </label>

          {/* Tags */}
          <div>
            <FieldLabel>Keywords / Tags (ពាក្យគន្លឺះ)</FieldLabel>
            <TagInput name="tags" defaultTags={initial.tags} disabled={saving} />
          </div>
        </div>
      </div>

      {/* ── SEO & metadata quality ── */}
      <BookSeoPanel
        slug={initial.slug}
        fields={{ ...seoState, coverPresent: preview !== null }}
      />

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={saving}
        className="btn-brand-gradient flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl py-3.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            {phaseLabel[phase]}
          </>
        ) : (
          <>
            <Save className="h-4 w-4" />
            Save changes
          </>
        )}
      </button>
    </form>
  );
}
