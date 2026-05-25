"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { saveBookRecord } from "@/app/admin/actions";
import { departments, slugify } from "@/lib/book-utils";
import Icon from "@/components/ui/Icon";

const TEXT_FIELDS = [
  { name: "title",    label: "Title",    placeholder: "Book title",            required: true  },
  { name: "author",   label: "Author",   placeholder: "Author or institution", required: true  },
  { name: "category", label: "Category", placeholder: "Research, Journal...",   required: true  },
  { name: "language", label: "Language", placeholder: "",                      required: true, defaultValue: "English" },
  { name: "isbn",     label: "ISBN",     placeholder: "Optional",              required: false },
] as const;

type Phase = "idle" | "uploading-pdf" | "uploading-cover" | "saving";

export default function UploadForm() {
  const router = useRouter();
  const supabase = createClient();

  const [phase, setPhase]       = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError]       = useState<string | null>(null);

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
    const slug = slugify(title);

    try {
      // ── 1. Upload PDF directly to Supabase Storage ───────────
      setPhase("uploading-pdf");
      setProgress(0);

      const pdfFileName = `${Date.now()}-${slug}.pdf`;
      const pdfPath = `pdfs/${pdfFileName}`;

      const { error: pdfErr } = await supabase.storage
        .from("book-files")
        .upload(pdfPath, pdf, {
          contentType: "application/pdf",
          upsert: false,
        });
      if (pdfErr) throw new Error(`PDF upload failed: ${pdfErr.message}`);

      const { data: pdfUrlData } = supabase.storage
        .from("book-files")
        .getPublicUrl(pdfPath);

      // ── 2. Upload cover (optional) ───────────────────────────
      let coverUrl: string | null = null;
      if (hasCover) {
        setPhase("uploading-cover");
        const coverFile = cover as File;
        const ext = coverFile.name.split(".").pop() ?? "jpg";
        const coverPath = `covers/${Date.now()}-${slug}.${ext}`;

        const { error: coverErr } = await supabase.storage
          .from("book-files")
          .upload(coverPath, coverFile, {
            contentType: coverFile.type,
            upsert: false,
          });

        if (coverErr) {
          // Non-fatal — fall back to color cover
          console.warn("Cover upload failed:", coverErr.message);
        } else {
          const { data: coverUrlData } = supabase.storage
            .from("book-files")
            .getPublicUrl(coverPath);
          coverUrl = coverUrlData.publicUrl;
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
      payload.set("fileUrl",    pdfUrlData.publicUrl);
      payload.set("fileSizeKb", String(Math.round(pdf.size / 1024)));
      payload.set("coverUrl",   coverUrl ?? "");

      // saveBookRecord redirects on success, so nothing runs after it
      await saveBookRecord(payload);
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
      className="grid gap-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2 md:p-8"
    >
      <h2 className="text-lg font-bold text-slate-800 md:col-span-2">
        Add new book
      </h2>

      {/* PDF file */}
      <label className="md:col-span-2">
        <span className="mb-2 block text-sm font-semibold text-slate-700">
          PDF file <span className="text-red-500">*</span>
        </span>
        <input
          name="pdf"
          type="file"
          accept="application/pdf"
          required
          disabled={busy}
          className="block w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600 transition hover:border-[#007c91] file:mr-4 file:cursor-pointer file:rounded-md file:border-0 file:bg-[#007c91] file:px-4 file:py-2 file:font-semibold file:text-white disabled:opacity-50"
        />
      </label>

      {/* Cover image */}
      <label className="md:col-span-2">
        <span className="mb-1 block text-sm font-semibold text-slate-700">
          Cover image{" "}
          <span className="font-normal text-slate-400">(optional — JPEG, PNG, WebP · max 5 MB)</span>
        </span>
        <input
          name="cover"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          disabled={busy}
          className="block w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600 transition hover:border-[#007c91] file:mr-4 file:cursor-pointer file:rounded-md file:border-0 file:bg-slate-200 file:px-4 file:py-2 file:font-semibold file:text-slate-700 disabled:opacity-50"
        />
        <p className="mt-1.5 text-xs text-slate-400">
          If left empty, a colored placeholder is used automatically.
        </p>
      </label>

      {/* Text fields */}
      {TEXT_FIELDS.map((f) => (
        <label key={f.name}>
          <span className="mb-1.5 block text-sm font-semibold text-slate-700">
            {f.label}{" "}
            {f.required && <span className="text-red-500">*</span>}
          </span>
          <input
            name={f.name}
            required={f.required}
            defaultValue={"defaultValue" in f ? f.defaultValue : undefined}
            placeholder={f.placeholder}
            disabled={busy}
            className="h-11 w-full rounded-lg border border-slate-200 px-4 text-sm outline-none transition focus:border-[#007c91] focus:ring-2 focus:ring-[#007c91]/15 disabled:bg-slate-50 disabled:opacity-60"
          />
        </label>
      ))}

      {/* Department */}
      <label>
        <span className="mb-1.5 block text-sm font-semibold text-slate-700">
          Department <span className="text-red-500">*</span>
        </span>
        <select
          name="department"
          required
          defaultValue="Research"
          disabled={busy}
          className="h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-[#007c91] focus:ring-2 focus:ring-[#007c91]/15 disabled:opacity-60"
        >
          {departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </label>

      {/* Year */}
      <label>
        <span className="mb-1.5 block text-sm font-semibold text-slate-700">Year</span>
        <input
          name="year"
          type="number"
          min="1900"
          max="2099"
          defaultValue={new Date().getFullYear()}
          disabled={busy}
          className="h-11 w-full rounded-lg border border-slate-200 px-4 text-sm outline-none transition focus:border-[#007c91] focus:ring-2 focus:ring-[#007c91]/15 disabled:opacity-60"
        />
      </label>

      {/* Pages */}
      <label>
        <span className="mb-1.5 block text-sm font-semibold text-slate-700">Pages</span>
        <input
          name="pages"
          type="number"
          min="1"
          defaultValue="1"
          disabled={busy}
          className="h-11 w-full rounded-lg border border-slate-200 px-4 text-sm outline-none transition focus:border-[#007c91] focus:ring-2 focus:ring-[#007c91]/15 disabled:opacity-60"
        />
      </label>

      {/* Summary */}
      <label className="md:col-span-2">
        <span className="mb-1.5 block text-sm font-semibold text-slate-700">
          Summary <span className="text-red-500">*</span>
        </span>
        <textarea
          name="summary"
          required
          rows={4}
          disabled={busy}
          placeholder="Short description for readers..."
          className="w-full resize-none rounded-lg border border-slate-200 p-4 text-sm outline-none transition focus:border-[#007c91] focus:ring-2 focus:ring-[#007c91]/15 disabled:bg-slate-50 disabled:opacity-60"
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
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#0a1629] px-6 font-semibold text-white transition hover:bg-[#007c91] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Icon name="pdf" className="text-lg" />
          {phaseLabel[phase]}
        </button>
      </div>
    </form>
  );
}