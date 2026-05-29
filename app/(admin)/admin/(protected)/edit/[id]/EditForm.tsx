"use client";

// app/admin/edit/[id]/EditForm.tsx
import { useState, useRef } from "react";
import Image from "next/image";
import { updateBook } from "@/app/(admin)/admin/(protected)/actions";
import { getPresignedUrl } from "@/app/actions/upload";
import { departments, slugify } from "@/lib/book-utils";
import { createClient } from "@/lib/supabase/client";
import Icon from "@/components/ui/Icon";

type Initial = {
  id: string;
  title: string;
  author: string;
  category: string;
  department: string;
  language: string;
  isbn: string;
  year: number;
  pages: number;
  summary: string;
  coverUrl: string | null; // existing cover (may be null)
};

const TEXT_FIELDS = [
  { name: "title",    label: "Title",    placeholder: "Book title",            required: true  },
  { name: "author",   label: "Author",   placeholder: "Author or institution", required: true  },
  { name: "category", label: "Category", placeholder: "Research, Journal...",   required: true  },
  { name: "language", label: "Language", placeholder: "",                      required: true  },
  { name: "isbn",     label: "ISBN",     placeholder: "Optional",              required: false },
] as const;

type Phase = "idle" | "uploading-cover" | "saving";

export default function EditForm({ initial }: { initial: Initial }) {
  const supabase = createClient();

  const [phase, setPhase]         = useState<Phase>("idle");
  const [error, setError]         = useState<string | null>(null);
  const [preview, setPreview]     = useState<string | null>(initial.coverUrl ?? null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const fileInputRef              = useRef<HTMLInputElement>(null);

  const saving = phase !== "idle";

  // ── Preview when user picks a file ───────────────────────────
  function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ["image/jpeg", "image/png", "image/webp", "image/avif"];
    if (!allowed.includes(file.type)) {
      setError("Cover must be JPEG, PNG, WebP, or AVIF");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Cover image must be under 5 MB");
      return;
    }

    setError(null);
    setCoverFile(file);
    setPreview(URL.createObjectURL(file));
  }

  function removeCover() {
    setCoverFile(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ── Submit ────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form     = e.currentTarget;
    const formData = new FormData(form);
    const title    = (formData.get("title") as string)?.trim() || initial.title;

    try {
      // ── 1. Upload new cover to R2 if selected ──────────────────────
      let newCoverUrl: string | null = null;

      if (coverFile) {
        setPhase("uploading-cover");
        const slug = slugify(title);
        const ext  = coverFile.name.split(".").pop() ?? "jpg";
        const path = `covers/${Date.now()}-${slug}.${ext}`;

        const { presignedUrl, publicUrl } = await getPresignedUrl(path, coverFile.type);

        const uploadRes = await fetch(presignedUrl, {
          method: "PUT",
          body: coverFile,
          headers: {
            "Content-Type": coverFile.type,
          },
        });

        if (!uploadRes.ok) throw new Error(`Cover upload failed: ${uploadRes.statusText}`);

        newCoverUrl = publicUrl;
      }

      // ── 2. Pass coverUrl to server action ─────────────────────
      // null  = remove cover (user cleared it)
      // ""    = no change (keep existing)
      // "https://..." = new cover uploaded above
      if (newCoverUrl) {
        formData.set("coverUrl", newCoverUrl);
      } else if (preview === null) {
        // user explicitly removed the cover
        formData.set("coverUrl", "__remove__");
      }
      // else: don't set coverUrl → server keeps existing

      // ── 3. Save metadata via server action ───────────────────
      setPhase("saving");
      await updateBook(initial.id, formData);
      // updateBook redirects on success — nothing runs after
    } catch (err) {
      setPhase("idle");
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  const phaseLabel: Record<Phase, string> = {
    "idle":            "Save changes",
    "uploading-cover": "Uploading cover…",
    "saving":          "Saving…",
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2 md:p-8"
    >
      <p className="md:col-span-2 rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500">
        Editing metadata and cover image. The PDF file is not changed here.
      </p>

      {/* ── Cover image section ── */}
      <div className="md:col-span-2">
        <span className="mb-2 block text-sm font-semibold text-slate-700">
          Cover image{" "}
          <span className="font-normal text-slate-400">(optional — JPEG, PNG, WebP · max 5 MB)</span>
        </span>

        <div className="flex items-start gap-4">
          {/* Preview */}
          {preview ? (
            <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 shadow-sm">
              <Image
                src={preview}
                alt="Cover preview"
                fill
                sizes="80px"
                className="object-cover"
              />
              <button
                type="button"
                onClick={removeCover}
                disabled={saving}
                title="Remove cover"
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[10px] text-white hover:bg-black/80 disabled:opacity-50"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="flex h-28 w-20 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-400">
              No cover
            </div>
          )}

          {/* File input */}
          <div className="flex-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              disabled={saving}
              onChange={handleCoverChange}
              className="block w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600 transition hover:border-[#007c91] file:mr-4 file:cursor-pointer file:rounded-md file:border-0 file:bg-slate-200 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700 disabled:opacity-50"
            />
            <p className="mt-1.5 text-xs text-slate-400">
              {preview
                ? coverFile
                  ? `New cover selected: ${coverFile.name}`
                  : "Current cover shown. Pick a new file to replace it."
                : "No cover — a colored placeholder will be used."}
            </p>
          </div>
        </div>
      </div>

      {/* ── Text fields ── */}
      {TEXT_FIELDS.map((f) => (
        <label key={f.name}>
          <span className="mb-1.5 block text-sm font-semibold text-slate-700">
            {f.label} {f.required && <span className="text-red-500">*</span>}
          </span>
          <input
            name={f.name}
            required={f.required}
            defaultValue={initial[f.name as keyof Initial] as string}
            placeholder={f.placeholder}
            disabled={saving}
            className="h-11 w-full rounded-lg border border-slate-200 px-4 text-sm outline-none transition focus:border-[#007c91] focus:ring-2 focus:ring-[#007c91]/15 disabled:opacity-60"
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
          defaultValue={initial.department}
          disabled={saving}
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
          name="year" type="number" min="1900" max="2099"
          defaultValue={initial.year} disabled={saving}
          className="h-11 w-full rounded-lg border border-slate-200 px-4 text-sm outline-none transition focus:border-[#007c91] focus:ring-2 focus:ring-[#007c91]/15 disabled:opacity-60"
        />
      </label>

      {/* Pages */}
      <label>
        <span className="mb-1.5 block text-sm font-semibold text-slate-700">Pages</span>
        <input
          name="pages" type="number" min="1"
          defaultValue={initial.pages} disabled={saving}
          className="h-11 w-full rounded-lg border border-slate-200 px-4 text-sm outline-none transition focus:border-[#007c91] focus:ring-2 focus:ring-[#007c91]/15 disabled:opacity-60"
        />
      </label>

      {/* Summary */}
      <label className="md:col-span-2">
        <span className="mb-1.5 block text-sm font-semibold text-slate-700">
          Summary <span className="text-red-500">*</span>
        </span>
        <textarea
          name="summary" required rows={4}
          defaultValue={initial.summary} disabled={saving}
          className="w-full resize-none rounded-lg border border-slate-200 p-4 text-sm outline-none transition focus:border-[#007c91] focus:ring-2 focus:ring-[#007c91]/15 disabled:opacity-60"
        />
      </label>

      {error && (
        <div className="md:col-span-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {saving && (
        <div className="md:col-span-2 flex items-center gap-3 rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-600 border-t-transparent" />
          {phaseLabel[phase]}
        </div>
      )}

      <div className="md:col-span-2 flex gap-3">
        <button
          type="submit" disabled={saving}
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#0a1629] px-6 font-semibold text-white transition hover:bg-[#007c91] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Icon name="pdf" className="text-lg" />
          {phaseLabel[phase]}
        </button>
      </div>
    </form>
  );
}