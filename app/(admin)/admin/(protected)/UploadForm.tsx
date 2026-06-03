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

const LANGUAGES = ["Khmer", "English"] as const;

const TEXT_FIELDS = [
  { name: "title",    label: "Title",    placeholder: "Book title",            required: true  },
  { name: "author",   label: "Author",   placeholder: "Author or institution", required: true  },
  { name: "isbn",     label: "ISBN",     placeholder: "Optional",              required: false },
] as const;

type Phase = "idle" | "uploading-pdf" | "uploading-cover" | "saving";

export default function UploadForm() {
  const router = useRouter();
  const supabase = createClient();

  const [phase, setPhase]       = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError]       = useState<string | null>(null);

  // Cover preview
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  // Dynamic departments
  const [deptList, setDeptList] = useState<string[]>(defaultDepartments);

  // Dynamic categories
  const [catList, setCatList] = useState<string[]>([]);

  // Fetch departments (from books.department) & categories on mount
  useEffect(() => {
    (async () => {
      const [deptRes, catRes] = await Promise.all([
        supabase.from("departments").select("name").order("name", { ascending: true }),
        supabase.from("categories").select("name").order("name", { ascending: true }),
      ]);

      if (deptRes.data && deptRes.data.length > 0) {
        setDeptList(deptRes.data.map((d: { name: string }) => d.name));
      }

      if (catRes.data && catRes.data.length > 0) {
        setCatList(catRes.data.map((c: { name: string }) => c.name));
      }
    })();
  }, []);

  function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setCoverPreview(url);
    } else {
      setCoverPreview(null);
    }
  }

  const busy = phase !== "idle";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = e.currentTarget;
    const formData = new FormData(form);

    // ── Read & validate the PDF (client-side) ──────────────────
    const pdf = formData.get("pdf");
    if (!(pdf instanceof File) || pdf.size === 0) {
      setError("A PDF file is required");
      return;
    }
    if (pdf.type !== "application/pdf") {
      setError("Only PDF files can be uploaded");
      return;
    }

    const cover = formData.get("cover");
    const hasCover = cover instanceof File && cover.size > 0;
    if (hasCover) {
      const allowed = ["image/jpeg", "image/png", "image/webp", "image/avif"];
      if (!allowed.includes((cover as File).type)) {
        setError("Cover must be JPEG, PNG, WebP, or AVIF");
        return;
      }
      if ((cover as File).size > 5 * 1024 * 1024) {
        setError("Cover image must be under 5 MB");
        return;
      }
    }

    const title = (formData.get("title") as string)?.trim();
    if (!title) {
      setError("Title is required");
      return;
    }

    try {
      // ── 1. Upload PDF directly to Cloudflare R2 via Presigned URL
      setPhase("uploading-pdf");
      setProgress(0);

      // ── Build per-book storage folder ──────────────────────
      // Layout: books/{category}/{book-slug}-{uid}/{book.pdf|cover.ext}
      // All assets for a single book live together in one folder.
      const categoryName = (formData.get("category") as string)?.trim() || "uncategorized";
      const uid = makeUid();
      const folder = bookFolder(categoryName, title, uid);

      const pdfPath = bookPdfPath(folder);

      // Get presigned URL for PDF
      const pdfPresignedRes = await getPresignedUrl(pdfPath, "application/pdf");
      if ("error" in pdfPresignedRes) {
        throw new Error(pdfPresignedRes.error);
      }
      const { presignedUrl: pdfPresignedUrl, publicUrl: pdfPublicUrl } = pdfPresignedRes;

      // Upload PDF to R2
      const pdfUploadRes = await fetch(pdfPresignedUrl, {
        method: "PUT",
        body: pdf,
        headers: {
          "Content-Type": "application/pdf",
        },
      });

      if (!pdfUploadRes.ok) {
        throw new Error(`PDF upload failed: ${pdfUploadRes.statusText}`);
      }

      // ── 2. Upload cover (optional) to R2 ──────────────────────
      let coverUrl: string | null = null;
      if (hasCover) {
        setPhase("uploading-cover");
        const coverFile = cover as File;
        const coverPath = bookCoverPath(folder, coverFile.name);

        try {
          const coverPresignedRes = await getPresignedUrl(coverPath, coverFile.type);
          if ("error" in coverPresignedRes) {
            throw new Error(coverPresignedRes.error);
          }
          const { presignedUrl: coverPresignedUrl, publicUrl: coverPublicUrl } = coverPresignedRes;
          
          const coverUploadRes = await fetch(coverPresignedUrl, {
            method: "PUT",
            body: coverFile,
            headers: {
              "Content-Type": coverFile.type,
            },
          });

          if (!coverUploadRes.ok) {
            throw new Error(`Cover upload failed: ${coverUploadRes.statusText}`);
          }
          
          coverUrl = coverPublicUrl;
        } catch (coverErr) {
          // Non-fatal — fall back to color cover
          console.warn("Cover upload failed:", coverErr instanceof Error ? coverErr.message : coverErr);
        }
      }

      // ── 3. Save the record via Server Action (metadata only) ──
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

      // saveBookRecord returns success/error object now
      const res = await saveBookRecord(payload);
      if (res && "error" in res) {
        throw new Error(res.error);
      } else if (res && "success" in res) {
        router.push(`/books/${res.slug}`);
      }
    } catch (err) {
      setPhase("idle");
      setProgress(0);
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
    <form
      onSubmit={handleSubmit}
      className="grid gap-5 rounded-xl border border-divider bg-bg-surface p-6 shadow-sm md:grid-cols-2 md:p-8"
    >
      <h2 className="text-lg font-bold text-text-heading md:col-span-2">
        Add new book
      </h2>

      {/* PDF file */}
      <label className="md:col-span-2">
        <span className="mb-2 block text-sm font-semibold text-text-body">
          PDF file <span className="text-red-500">*</span>
        </span>
        <input
          name="pdf"
          type="file"
          accept="application/pdf"
          required
          disabled={busy}
          className="block w-full rounded-lg border border-dashed border-divider bg-paper px-4 py-4 text-sm text-text-body transition hover:border-brand file:mr-4 file:cursor-pointer file:rounded-md file:border-0 file:bg-brand file:px-4 file:py-2 file:font-semibold file:text-white disabled:opacity-50"
        />
      </label>

      {/* Cover image */}
      <label className="md:col-span-2">
        <span className="mb-1 block text-sm font-semibold text-text-body">
          Cover image{" "}
          <span className="font-normal text-text-muted">(optional — JPEG, PNG, WebP · max 5 MB)</span>
        </span>
        <input
          name="cover"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          disabled={busy}
          onChange={handleCoverChange}
          className="block w-full rounded-lg border border-dashed border-divider bg-paper px-4 py-4 text-sm text-text-body transition hover:border-brand file:mr-4 file:cursor-pointer file:rounded-md file:border-0 file:bg-paper file:px-4 file:py-2 file:font-semibold file:text-text-body disabled:opacity-50"
        />
        {coverPreview ? (
          <div className="mt-3 flex items-start gap-3">
            <div className="relative h-[140px] w-[100px] shrink-0 overflow-hidden rounded-lg border border-divider bg-paper shadow-sm">
              <img
                src={coverPreview}
                alt="Cover preview"
                className="h-full w-full object-cover"
              />
            </div>
            <button
              type="button"
              onClick={() => setCoverPreview(null)}
              className="mt-1 text-xs font-semibold text-red-500 hover:text-red-700 transition"
            >
              Remove preview
            </button>
          </div>
        ) : (
          <p className="mt-1.5 text-xs text-text-muted">
            If left empty, a colored placeholder is used automatically.
          </p>
        )}
      </label>

      {/* Text fields */}
      {TEXT_FIELDS.map((f) => (
        <label key={f.name}>
          <span className="mb-1.5 block text-sm font-semibold text-text-body">
            {f.label}{" "}
            {f.required && <span className="text-red-500">*</span>}
          </span>
          <input
            name={f.name}
            required={f.required}
            placeholder={f.placeholder}
            disabled={busy}
            className="h-11 w-full rounded-lg border border-divider px-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15 disabled:bg-paper disabled:opacity-60"
          />
        </label>
      ))}

      {/* Category */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="block text-sm font-semibold text-text-body">
            Category <span className="text-red-500">*</span>
          </span>
        </div>
        <SearchableSelect
          name="category"
          required
          options={catList}
          disabled={busy}
        />
      </div>

      {/* Language */}
      <label>
        <span className="mb-1.5 block text-sm font-semibold text-text-body">
          Language <span className="text-red-500">*</span>
        </span>
        <select
          name="language"
          required
          defaultValue="Khmer"
          disabled={busy}
          className="h-11 w-full rounded-lg border border-divider bg-bg-surface px-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15 disabled:opacity-60"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>{lang}</option>
          ))}
        </select>
      </label>

      {/* Department */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="block text-sm font-semibold text-text-body">
            Department <span className="text-red-500">*</span>
          </span>
        </div>
        <SearchableSelect
          name="department"
          required
          options={deptList}
          disabled={busy}
        />
      </div>

      {/* Year */}
      <label>
        <span className="mb-1.5 block text-sm font-semibold text-text-body">Year</span>
        <input
          name="year"
          type="number"
          min="1900"
          max="2099"
          defaultValue={new Date().getFullYear()}
          disabled={busy}
          className="h-11 w-full rounded-lg border border-divider px-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15 disabled:opacity-60"
        />
      </label>

      {/* Pages */}
      <label>
        <span className="mb-1.5 block text-sm font-semibold text-text-body">Pages</span>
        <input
          name="pages"
          type="number"
          min="1"
          defaultValue="1"
          disabled={busy}
          className="h-11 w-full rounded-lg border border-divider px-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15 disabled:opacity-60"
        />
      </label>

      {/* Summary */}
      <label className="md:col-span-2">
        <span className="mb-1.5 block text-sm font-semibold text-text-body">
          Summary
        </span>
        <textarea
          name="summary"
          rows={4}
          disabled={busy}
          placeholder="Short description for readers..."
          className="w-full resize-none rounded-lg border border-divider p-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15 disabled:bg-paper disabled:opacity-60"
        />
      </label>

      {/* Error message */}
      {error && (
        <div className="md:col-span-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Progress / status while busy */}
      {busy && (
        <div className="md:col-span-2 flex items-center gap-3 rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-600 border-t-transparent" />
          {phaseLabel[phase]}
        </div>
      )}

      <div className="md:col-span-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-blue-950 px-6 font-semibold text-white transition hover:bg-brand disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Icon name="pdf" className="text-lg" />
          {phaseLabel[phase]}
        </button>
      </div>
    </form>
  );
}