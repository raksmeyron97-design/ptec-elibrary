"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { saveBookRecord, addCategory, addDepartment } from "@/app/(admin)/admin/(protected)/actions";
import { getPresignedUrl } from "@/app/actions/upload";
import {
  departments as defaultDepartments,
  makeUid,
  bookFolder,
  bookPdfPath,
  bookCoverPath,
} from "@/lib/book-utils";
import Icon from "@/components/ui/core/Icon";
import SearchableSelect from "@/components/ui/search/SearchableSelect";
import { FileText, ImagePlus, Upload } from "lucide-react";

const LANGUAGES = ["Khmer", "English"] as const;

const TEXT_FIELDS = [
  { name: "title",  label: "Title",  placeholder: "Book title",            required: true  },
  { name: "author", label: "Author", placeholder: "Author or institution", required: true  },
  { name: "isbn",   label: "ISBN",   placeholder: "Optional",              required: false },
] as const;

type Phase = "idle" | "uploading-pdf" | "uploading-cover" | "saving";

const INPUT_CLASS =
  "h-12 w-full rounded-xl border border-divider bg-bg-surface px-4 text-sm outline-none transition-all " +
  "focus:border-brand focus:ring-2 focus:ring-focus-ring/15 disabled:bg-paper disabled:opacity-60";

const SELECT_CLASS =
  "h-12 w-full rounded-xl border border-divider bg-bg-surface px-4 text-sm outline-none transition-all " +
  "focus:border-brand focus:ring-2 focus:ring-focus-ring/15 disabled:opacity-60";

export default function UploadForm() {
  const router = useRouter();
  const supabase = createClient();

  const [phase, setPhase]             = useState<Phase>("idle");
  const [error, setError]             = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [pdfName, setPdfName]          = useState<string | null>(null);
  const [deptList, setDeptList]        = useState<string[]>(defaultDepartments);
  const [catList, setCatList]          = useState<string[]>([]);

  const pdfInputRef   = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const [deptRes, catRes] = await Promise.all([
        supabase.from("departments").select("name").order("name", { ascending: true }),
        supabase.from("categories").select("name").order("name", { ascending: true }),
      ]);
      if (deptRes.data && deptRes.data.length > 0)
        setDeptList(deptRes.data.map((d: { name: string }) => d.name));
      if (catRes.data && catRes.data.length > 0)
        setCatList(catRes.data.map((c: { name: string }) => c.name));
    })();
  }, []);

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

      const pdfPresignedRes = await getPresignedUrl(pdfPath, "application/pdf");
      if ("error" in pdfPresignedRes) throw new Error(pdfPresignedRes.error);
      const { presignedUrl: pdfPresignedUrl, publicUrl: pdfPublicUrl } = pdfPresignedRes;

      const pdfUploadRes = await fetch(pdfPresignedUrl, {
        method: "PUT", body: pdf, headers: { "Content-Type": "application/pdf" },
      });
      if (!pdfUploadRes.ok) throw new Error(`PDF upload failed: ${pdfUploadRes.statusText}`);

      let coverUrl: string | null = null;
      if (hasCover) {
        setPhase("uploading-cover");
        const coverFile = cover as File;
        const coverPath = bookCoverPath(folder, coverFile.name);
        try {
          const coverPresignedRes = await getPresignedUrl(coverPath, coverFile.type);
          if ("error" in coverPresignedRes) throw new Error(coverPresignedRes.error);
          const { presignedUrl: coverPresignedUrl, publicUrl: coverPublicUrl } = coverPresignedRes;
          const coverUploadRes = await fetch(coverPresignedUrl, {
            method: "PUT", body: coverFile, headers: { "Content-Type": coverFile.type },
          });
          if (!coverUploadRes.ok) throw new Error(`Cover upload failed: ${coverUploadRes.statusText}`);
          coverUrl = coverPublicUrl;
        } catch (coverErr) {
          console.warn("Cover upload failed:", coverErr instanceof Error ? coverErr.message : coverErr);
        }
      }

      setPhase("saving");
      const payload = new FormData();
      payload.set("title",      title);
      payload.set("author",     formData.get("author") as string);
      payload.set("department", formData.get("department") as string);
      payload.set("category",   formData.get("category") as string);
      payload.set("language",   formData.get("language") as string);
      payload.set("summary",    formData.get("summary") as string);
      payload.set("isbn",       (formData.get("isbn") as string) ?? "");
      payload.set("year",       (formData.get("year") as string) ?? "");
      payload.set("pages",      (formData.get("pages") as string) ?? "");
      payload.set("fileUrl",    pdfPublicUrl);
      payload.set("fileSizeKb", String(Math.round(pdf.size / 1024)));
      payload.set("coverUrl",   coverUrl ?? "");

      const res = await saveBookRecord(payload);
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
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* ── File section ── */}
      <div className="rounded-2xl border border-divider bg-bg-surface p-6 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-text-heading">Files</h2>

        {/* PDF dropzone */}
        <div>
          <span className="mb-2 block text-sm font-semibold text-text-body">
            PDF file <span className="text-red-500">*</span>
          </span>
          <div
            className="relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-divider bg-paper px-6 py-8 text-center transition-all hover:border-brand hover:bg-bg-surface cursor-pointer"
            onClick={() => !busy && pdfInputRef.current?.click()}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl"
              style={{ background: "rgba(30,58,138,0.08)" }}>
              <FileText className="h-6 w-6" style={{ color: "var(--ptec-brand)" }} />
            </span>
            {pdfName ? (
              <>
                <p className="text-sm font-medium text-text-body">{pdfName}</p>
                <p className="text-xs text-text-muted">Click to replace</p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-text-body">Click to select PDF</p>
                <p className="text-xs text-text-muted">or drag &amp; drop · PDF only</p>
              </>
            )}
            <input
              ref={pdfInputRef}
              name="pdf"
              type="file"
              accept="application/pdf"
              required
              disabled={busy}
              onChange={handlePdfChange}
              className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
            />
          </div>
        </div>

        {/* Cover dropzone */}
        <div>
          <span className="mb-2 block text-sm font-semibold text-text-body">
            Cover image{" "}
            <span className="font-normal text-text-muted">(optional — JPEG, PNG, WebP · max 5 MB)</span>
          </span>
          <div className="flex items-start gap-4">
            {/* Preview */}
            {coverPreview && (
              <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-xl border border-divider shadow-sm">
                <img src={coverPreview} alt="Cover preview" className="h-full w-full object-cover" />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { setCoverPreview(null); if (coverInputRef.current) coverInputRef.current.value = ""; }}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[10px] text-white hover:bg-black/80 disabled:opacity-50"
                >
                  ✕
                </button>
              </div>
            )}
            <div
              className="relative flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-divider bg-paper px-4 py-6 text-center transition-all hover:border-brand hover:bg-bg-surface cursor-pointer"
              onClick={() => !busy && coverInputRef.current?.click()}
            >
              <ImagePlus className="h-5 w-5 text-text-muted" />
              <p className="text-xs text-text-muted">
                {coverPreview ? "Click to replace cover" : "Click to select cover image"}
              </p>
              <input
                ref={coverInputRef}
                name="cover"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                disabled={busy}
                onChange={handleCoverChange}
                className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Metadata section ── */}
      <div className="rounded-2xl border border-divider bg-bg-surface p-6 shadow-sm space-y-5">
        <h2 className="text-base font-bold text-text-heading">Metadata</h2>

        <div className="grid gap-5 md:grid-cols-2">
          {TEXT_FIELDS.map((f) => (
            <label key={f.name}>
              <span className="mb-1.5 block text-sm font-semibold text-text-body">
                {f.label} {f.required && <span className="text-red-500">*</span>}
              </span>
              <input
                name={f.name}
                required={f.required}
                placeholder={f.placeholder}
                disabled={busy}
                className={INPUT_CLASS}
              />
            </label>
          ))}

          {/* Category */}
          <div>
            <span className="mb-1.5 block text-sm font-semibold text-text-body">
              Category <span className="text-red-500">*</span>
            </span>
            <SearchableSelect name="category" required options={catList} disabled={busy} />
          </div>

          {/* Language */}
          <label>
            <span className="mb-1.5 block text-sm font-semibold text-text-body">
              Language <span className="text-red-500">*</span>
            </span>
            <select name="language" required defaultValue="Khmer" disabled={busy} className={SELECT_CLASS}>
              {LANGUAGES.map((lang) => <option key={lang} value={lang}>{lang}</option>)}
            </select>
          </label>

          {/* Department */}
          <div>
            <span className="mb-1.5 block text-sm font-semibold text-text-body">
              Department <span className="text-red-500">*</span>
            </span>
            <SearchableSelect name="department" required options={deptList} disabled={busy} />
          </div>

          {/* Year */}
          <label>
            <span className="mb-1.5 block text-sm font-semibold text-text-body">Year</span>
            <input name="year" type="number" min="1900" max="2099"
              defaultValue={new Date().getFullYear()} disabled={busy} className={INPUT_CLASS} />
          </label>

          {/* Pages */}
          <label>
            <span className="mb-1.5 block text-sm font-semibold text-text-body">Pages</span>
            <input name="pages" type="number" min="1" defaultValue="1" disabled={busy} className={INPUT_CLASS} />
          </label>
        </div>

        {/* Summary — full width */}
        <label>
          <span className="mb-1.5 block text-sm font-semibold text-text-body">Summary</span>
          <textarea
            name="summary" rows={4} disabled={busy}
            placeholder="Short description for readers..."
            className="w-full resize-none rounded-xl border border-divider bg-bg-surface p-4 text-sm outline-none transition-all focus:border-brand focus:ring-2 focus:ring-focus-ring/15 disabled:bg-paper disabled:opacity-60"
          />
        </label>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Progress */}
      {busy && (
        <div className="flex items-center gap-3 rounded-xl border px-4 py-3 text-sm"
          style={{ borderColor: "#A5F3FC", background: "#ECFEFF", color: "#0E7490" }}>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {phaseLabel[phase]}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit" disabled={busy}
        className="btn-brand-gradient inline-flex h-12 items-center gap-2 rounded-xl px-8 font-semibold text-white"
      >
        <Upload className="h-4 w-4" />
        {phaseLabel[phase]}
      </button>
    </form>
  );
}
