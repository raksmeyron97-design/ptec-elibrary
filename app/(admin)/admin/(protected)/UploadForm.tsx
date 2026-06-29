"use client";
/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */

import { useState, useEffect, useRef, useCallback, Fragment } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { saveBookRecord } from "@/app/(admin)/admin/(protected)/actions";
import {
  departments as defaultDepartments,
  makeUid,
  bookFolder,
  bookPdfPath,
  bookCoverPath,
} from "@/lib/book-utils";
import Icon from "@/components/ui/core/Icon";
import SearchableSelect from "@/components/ui/search/SearchableSelect";
import TagInput from "@/components/ui/core/TagInput";
import { FileText, ImagePlus, Upload, AlertCircle, BookOpen, X } from "lucide-react";

const LANGUAGES = ["Khmer", "English"] as const;

type Phase = "idle" | "uploading-pdf" | "uploading-cover" | "saving";

const INPUT_CLASS =
  "h-11 w-full rounded-xl border border-divider bg-bg-surface px-4 text-sm outline-none transition-all " +
  "focus:border-[#4f46e5] focus:ring-2 focus:ring-[#4f46e5]/10 disabled:bg-paper disabled:opacity-60 " +
  "placeholder:text-text-muted/60 text-text-body";

const SELECT_CLASS =
  "h-11 w-full rounded-xl border border-divider bg-bg-surface px-4 text-sm outline-none transition-all " +
  "focus:border-[#4f46e5] focus:ring-2 focus:ring-[#4f46e5]/10 disabled:opacity-60 text-text-body";

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

// ── Multi-step progress indicator ─────────────────────────────
const PHASE_STEPS = [
  { id: "uploading-pdf",   label: "Uploading PDF",   color: "#4f46e5" },
  { id: "uploading-cover", label: "Uploading cover", color: "#0e7490" },
  { id: "saving",          label: "Saving record",   color: "#0f9d6b" },
] as const;

function PhaseStepper({ phase }: { phase: Phase }) {
  if (phase === "idle") return null;
  const order = PHASE_STEPS.map((s) => s.id as string);
  const ci = order.indexOf(phase);

  return (
    <div
      className="flex items-center gap-4 rounded-2xl border px-5 py-3.5"
      style={{ borderColor: "#C7D2FE", background: "#EEF2FF" }}
    >
      <div className="flex flex-1 items-center gap-2">
        {PHASE_STEPS.map((step, i) => {
          const isDone = i < ci;
          const isActive = i === ci;
          return (
            <Fragment key={step.id}>
              {i > 0 && (
                <div
                  className="h-px flex-1 rounded-full transition-colors duration-500"
                  style={{ background: isDone ? "#0f9d6b" : "#C7D2FE" }}
                />
              )}
              <div className="flex shrink-0 items-center gap-1.5">
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold transition-all duration-300"
                  style={
                    isDone
                      ? { background: "#0f9d6b", color: "#fff" }
                      : isActive
                      ? { background: step.color, color: "#fff" }
                      : { background: "#DDE1F0", color: "#9CA3AF" }
                  }
                >
                  {isDone ? "✓" : i + 1}
                </span>
                <span
                  className="text-xs font-semibold"
                  style={{
                    color: isActive ? step.color : isDone ? "#0f9d6b" : "#9CA3AF",
                  }}
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
        style={{ color: "#4f46e5" }}
      >
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#4f46e5] border-t-transparent" />
        {phase === "uploading-pdf"
          ? "Uploading PDF…"
          : phase === "uploading-cover"
          ? "Uploading cover…"
          : "Saving…"}
      </div>
    </div>
  );
}

export default function UploadForm({ recentBooks = [] }: { recentBooks?: any[] } = {}) {
  const router = useRouter();
  const supabase = createClient();

  const [phase, setPhase]               = useState<Phase>("idle");
  const [error, setError]               = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [pdfName, setPdfName]           = useState<string | null>(null);
  const [deptList, setDeptList]         = useState<string[]>(defaultDepartments);
  const [catList, setCatList]           = useState<string[]>([]);

  const pdfInputRef   = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const refreshLists = useCallback(async () => {
    const [deptRes, catRes] = await Promise.all([
      supabase.from("departments").select("name").order("name", { ascending: true }),
      supabase.from("categories").select("name").order("name", { ascending: true }),
    ]);
    if (deptRes.data && deptRes.data.length > 0)
      setDeptList(deptRes.data.map((d: { name: string }) => d.name));
    if (catRes.data && catRes.data.length > 0)
      setCatList(catRes.data.map((c: { name: string }) => c.name));
  }, [supabase]);

  useEffect(() => {
    refreshLists();
    window.addEventListener("ptec:categories-changed", refreshLists);
    window.addEventListener("ptec:departments-changed", refreshLists);
    return () => {
      window.removeEventListener("ptec:categories-changed", refreshLists);
      window.removeEventListener("ptec:departments-changed", refreshLists);
    };
  }, [refreshLists]);

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setCoverPreview(URL.createObjectURL(file));
    else setCoverPreview(null);
  };

  const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setPdfName(file ? file.name : null);
  };

  const busy = phase !== "idle";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form     = e.currentTarget;
    const formData = new FormData(form);

    const pdf = formData.get("pdf");
    if (!(pdf instanceof File) || pdf.size === 0) { setError("A PDF file is required"); return; }
    if (pdf.type !== "application/pdf") { setError("Only PDF files can be uploaded"); return; }

    const cover    = formData.get("cover");
    const hasCover = cover instanceof File && cover.size > 0;
    if (hasCover) {
      const allowed = ["image/jpeg", "image/png", "image/webp", "image/avif"];
      if (!allowed.includes((cover as File).type)) { setError("Cover must be JPEG, PNG, WebP, or AVIF"); return; }
      if ((cover as File).size > 5 * 1024 * 1024)  { setError("Cover image must be under 5 MB"); return; }
    }

    const title = (formData.get("title") as string)?.trim();
    if (!title) { setError("Title is required"); return; }

    try {
      setPhase("uploading-pdf");
      const categoryName = (formData.get("category") as string)?.trim() || "uncategorized";
      const uid    = makeUid();
      const folder = bookFolder(categoryName, title, uid);
      const pdfPath = bookPdfPath(folder);

      const pdfPayload = new FormData();
      pdfPayload.set("file", pdf);
      pdfPayload.set("key", pdfPath);
      pdfPayload.set("target", "private");

      const pdfRes = await fetch("/api/admin/upload", { method: "POST", body: pdfPayload });
      if (!pdfRes.ok) {
        const data = await pdfRes.json().catch(() => ({}));
        throw new Error(data.error ?? `PDF upload failed (${pdfRes.status})`);
      }
      const { url: pdfPublicUrl } = await pdfRes.json();

      let coverUrl: string | null = null;
      if (hasCover) {
        setPhase("uploading-cover");
        const coverFile = cover as File;
        const coverPath = bookCoverPath(folder, coverFile.name);
        try {
          const coverPayload = new FormData();
          coverPayload.set("file", coverFile);
          coverPayload.set("key", coverPath);
          coverPayload.set("target", "public");

          const coverRes = await fetch("/api/admin/upload", { method: "POST", body: coverPayload });
          if (!coverRes.ok) {
            const data = await coverRes.json().catch(() => ({}));
            throw new Error(data.error ?? `Cover upload failed (${coverRes.status})`);
          }
          const { url: uploadedCoverUrl } = await coverRes.json();
          coverUrl = uploadedCoverUrl;
        } catch (coverErr) {
          console.warn("Cover upload failed:", coverErr instanceof Error ? coverErr.message : coverErr);
        }
      }

      setPhase("saving");
      const res = await saveBookRecord({
        title,
        author:     (formData.get("author")     as string) ?? "",
        department: (formData.get("department") as string) ?? "",
        category:   (formData.get("category")   as string) ?? "",
        language:   (formData.get("language")   as string) ?? "",
        summary:    (formData.get("summary")    as string) ?? "",
        isbn:       (formData.get("isbn")       as string) ?? "",
        year:       (formData.get("year")       as string) ?? "",
        pages:      (formData.get("pages")      as string) ?? "",
        fileUrl:    pdfPublicUrl,
        fileSizeKb: String(Math.round(pdf.size / 1024)),
        coverUrl:   coverUrl ?? "",
        tags:       (formData.get("tags")       as string) ?? "",
      });
      if (res && "error" in res) throw new Error(res.error);
      else if (res && "success" in res) router.push(`/books/${res.slug}`);
    } catch (err) {
      setPhase("idle");
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  const phaseLabel: Record<Phase, string> = {
    "idle":            "Upload and publish",
    "uploading-pdf":   "Uploading PDF…",
    "uploading-cover": "Uploading cover…",
    "saving":          "Saving…",
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* ── Phase progress ── */}
      <PhaseStepper phase={phase} />

      <div className="grid gap-6 lg:grid-cols-[380px_1fr] items-start">
        <div className="space-y-6">
          {/* ── Files card ── */}
          <div className="form-card-accent overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm">
        <div className="flex items-center gap-3.5 border-b border-divider bg-paper/60 px-6 py-4">
          <span className="sec-chip sec-chip--files">
            <FileText className="h-[18px] w-[18px]" />
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-text-heading">Files</h2>
            <p className="text-xs text-text-muted">PDF (required) · Cover image (optional)</p>
          </div>
          {pdfName && (
            <span
              className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold"
              style={{ background: "rgba(15,157,107,0.10)", color: "#0f9d6b" }}
            >
              PDF ready
            </span>
          )}
        </div>

        <div className="p-6 space-y-5">
          {/* PDF dropzone */}
          <div>
            <FieldLabel required>PDF file</FieldLabel>
            <div
              className="relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-11 text-center transition-all cursor-pointer group"
              style={{
                borderColor: pdfName ? "#0f9d6b" : "var(--ptec-divider)",
                background:  pdfName ? "rgba(15,157,107,0.03)" : "var(--ptec-paper)",
              }}
              onClick={() => !busy && pdfInputRef.current?.click()}
            >
              <span
                className="flex h-14 w-14 items-center justify-center rounded-2xl shadow-sm transition-transform duration-200 group-hover:scale-105"
                style={{
                  background: pdfName ? "rgba(15,157,107,0.12)" : "rgba(30,58,138,0.08)",
                }}
              >
                <FileText
                  className="h-7 w-7"
                  style={{ color: pdfName ? "#0f9d6b" : "var(--ptec-brand)" }}
                />
              </span>
              {pdfName ? (
                <>
                  <p className="max-w-xs truncate text-sm font-semibold" style={{ color: "#0f9d6b" }}>
                    {pdfName}
                  </p>
                  <p className="text-xs text-text-muted">Click to replace</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-text-heading">Click to select PDF</p>
                  <p className="text-xs text-text-muted">or drag &amp; drop · PDF only · max 100 MB</p>
                </>
              )}
              <input
                ref={pdfInputRef}
                name="pdf"
                type="file"
                accept=".pdf,application/pdf"
                required
                disabled={busy}
                onChange={handlePdfChange}
                onClick={(e) => e.stopPropagation()}
                className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* Cover image */}
          <div>
            <FieldLabel>
              Cover image{" "}
              <span className="font-normal normal-case tracking-normal text-text-muted">
                (JPEG, PNG, WebP · max 5 MB)
              </span>
            </FieldLabel>
            <div className="flex items-start gap-4">
              {coverPreview ? (
                <div className="relative h-32 w-[88px] shrink-0 overflow-hidden rounded-xl border border-divider shadow-md">
                  <img
                    src={coverPreview}
                    alt="Cover preview"
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setCoverPreview(null);
                      if (coverInputRef.current) coverInputRef.current.value = "";
                    }}
                    className="absolute right-1 top-1 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-black/65 text-[10px] text-white transition-colors hover:bg-black/85 disabled:opacity-50"
                    aria-label="Remove cover"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="flex h-32 w-[88px] shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-divider bg-paper text-[11px] font-medium text-text-muted">
                  No cover
                </div>
              )}
              <div
                className="relative flex h-32 flex-1 flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed border-divider bg-paper px-4 text-center transition-all hover:border-brand hover:bg-bg-surface cursor-pointer"
                onClick={() => !busy && coverInputRef.current?.click()}
              >
                <ImagePlus className="h-6 w-6 text-text-muted" />
                <p className="text-xs text-text-muted leading-tight">
                  {coverPreview ? "Click to replace cover" : "Click to select cover image"}
                </p>
                <input
                  ref={coverInputRef}
                  name="cover"
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.avif,image/jpeg,image/png,image/webp,image/avif"
                  disabled={busy}
                  onChange={handleCoverChange}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Recent uploads ── */}
      <div className="h-fit overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm">
        {/* Header */}
        <div
          className="border-b border-divider px-5 py-4"
          style={{ background: "linear-gradient(135deg,#1E3A8A,#0F2160)" }}
        >
          <h2 className="text-sm font-bold text-white">Recent uploads</h2>
          <p className="mt-0.5 text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>
            Last 5 books added
          </p>
        </div>

        {recentBooks && recentBooks.length > 0 ? (
          <ul className="divide-y divide-divider">
            {recentBooks.map((book: any, i: number) => (
              <li key={book.id} className="flex items-start gap-3 px-5 py-3.5">
                <div
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-sm"
                  style={{ background: "rgba(30,58,138,0.08)" }}
                >
                  <Icon name="pdf" className="text-sm text-brand" />
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/books/${book.slug}`}
                    className="block truncate text-sm font-semibold text-text-heading transition-colors hover:text-[#DDB022]"
                  >
                    {book.title}
                  </Link>
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className="truncate text-[11px] text-text-muted">
                      {(book.authors as any)?.name}
                      {book.book_files?.[0]?.file_size_kb
                        ? ` · ${(book.book_files[0].file_size_kb / 1024).toFixed(1)} MB`
                        : ""}
                    </p>
                    <Link
                      href={`/admin/edit/${book.id}`}
                      className="shrink-0 text-[11px] font-semibold transition-colors hover:underline"
                      style={{ color: "#DDB022" }}
                    >
                      Edit
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-4 text-sm text-text-muted">No books uploaded yet.</p>
        )}
      </div>
        </div>

        <div className="space-y-6 min-w-0">
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
              placeholder="Book title"
              disabled={busy}
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
                placeholder="Author or institution"
                disabled={busy}
                className={INPUT_CLASS}
              />
            </label>

            {/* ISBN */}
            <label>
              <FieldLabel>ISBN</FieldLabel>
              <input
                name="isbn"
                placeholder="Optional"
                disabled={busy}
                className={INPUT_CLASS}
              />
            </label>

            {/* Category */}
            <div>
              <FieldLabel required>Category</FieldLabel>
              <SearchableSelect name="category" required options={catList} disabled={busy} />
            </div>

            {/* Language */}
            <label>
              <FieldLabel required>Language</FieldLabel>
              <select
                name="language"
                required
                defaultValue="Khmer"
                disabled={busy}
                className={SELECT_CLASS}
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </label>

            {/* Department */}
            <div>
              <FieldLabel required>Department</FieldLabel>
              <SearchableSelect
                name="department"
                required
                options={deptList}
                disabled={busy}
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
                defaultValue={new Date().getFullYear()}
                disabled={busy}
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
                defaultValue="1"
                disabled={busy}
                className={INPUT_CLASS}
              />
            </label>
          </div>

          {/* Summary */}
          <label className="block">
            <FieldLabel>Summary</FieldLabel>
            <textarea
              name="summary"
              rows={4}
              disabled={busy}
              placeholder="Short description for readers…"
              className="w-full resize-none rounded-xl border border-divider bg-bg-surface p-4 text-sm outline-none transition-all focus:border-[#4f46e5] focus:ring-2 focus:ring-[#4f46e5]/10 disabled:bg-paper disabled:opacity-60 placeholder:text-text-muted/60 text-text-body"
            />
          </label>

          {/* Tags */}
          <div>
            <FieldLabel>Keywords / Tags (ពាក្យគន្លឺះ)</FieldLabel>
            <TagInput
              name="tags"
              placeholder="e.g. គណិតវិទ្យា, algebra, textbook…"
              disabled={busy}
            />
            <p className="mt-1.5 text-[11px] text-text-muted">
              ចុច Enter ឬ , ដើម្បីបន្ថែម tag · Press Enter or comma to add each tag
            </p>
          </div>
        </div>
      </div>

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
        disabled={busy}
        className="btn-brand-gradient flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl py-3.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            {phaseLabel[phase]}
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" />
            Upload and publish
          </>
        )}
      </button>
        </div>
      </div>
    </form>
  );
}
