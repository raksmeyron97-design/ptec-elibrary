"use client"
 
;
/* eslint-disable @typescript-eslint/no-unused-vars */


import { useState, useRef } from "react";
import Image from "next/image";
import { updateBook } from "@/app/(admin)/admin/(protected)/actions";
import {
  makeUid,
  bookFolder,
  bookCoverPath,
  bookFolderFromCoverUrl,
} from "@/lib/book-utils";
import Icon from "@/components/ui/core/Icon";
import TagInput from "@/components/ui/core/TagInput";
import SearchableSelect from "@/components/ui/search/SearchableSelect";
import { ImagePlus, Save } from "lucide-react";

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
  coverUrl: string | null;
  tags: string[];
};

const TEXT_FIELDS = [
  { name: "title",    label: "Title",    placeholder: "Book title",            required: true  },
  { name: "author",   label: "Author",   placeholder: "Author or institution", required: true  },
  { name: "language", label: "Language", placeholder: "",                      required: true  },
  { name: "isbn",     label: "ISBN",     placeholder: "Optional",              required: false },
] as const;

type Phase = "idle" | "uploading-cover" | "saving";

const INPUT_CLASS =
  "h-12 w-full rounded-xl border border-divider bg-bg-surface px-4 text-sm outline-none transition-all " +
  "focus:border-brand focus:ring-2 focus:ring-focus-ring/15 disabled:bg-paper disabled:opacity-60";


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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form     = e.currentTarget;
    const formData = new FormData(form);
    const title    = (formData.get("title") as string)?.trim() || initial.title;

    try {
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

      if (newCoverUrl)        formData.set("coverUrl", newCoverUrl);
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
    "uploading-cover": "Uploading cover…",
    "saving":          "Saving…",
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <p className="rounded-xl border border-divider bg-paper px-4 py-3 text-xs text-text-muted">
        Editing metadata and cover image. The PDF file is not changed here.
      </p>

      {/* ── Cover section ── */}
      <div className="rounded-2xl border border-divider bg-bg-surface p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-bold text-text-heading">
          Cover image{" "}
          <span className="font-normal text-text-muted">(optional — JPEG, PNG, WebP · max 5 MB)</span>
        </h3>

        <div className="flex items-start gap-4">
          {/* Current / new preview */}
          {preview ? (
            <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-xl border border-divider shadow-sm">
              <Image src={preview} alt="Cover preview" fill sizes="80px" className="object-cover" />
              <button
                type="button" onClick={removeCover} disabled={saving} title="Remove cover"
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[10px] text-white hover:bg-black/80 disabled:opacity-50"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="flex h-28 w-20 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-divider bg-paper text-xs text-text-muted">
              No cover
            </div>
          )}

          {/* Dropzone */}
          <div
            ref={coverZoneRef}
            className="relative flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-divider bg-paper px-4 py-6 text-center transition-all hover:border-brand hover:bg-bg-surface cursor-pointer"
            onClick={() => !saving && fileInputRef.current?.click()}
          >
            <ImagePlus className="h-5 w-5 text-text-muted" />
            <p className="text-xs text-text-muted">
              {preview
                ? coverFile ? `Selected: ${coverFile.name}` : "Click to replace cover"
                : "Click to select cover image"}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              disabled={saving}
              onChange={handleCoverChange}
              className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
            />
          </div>
        </div>
      </div>

      {/* ── Metadata section ── */}
      <div className="rounded-2xl border border-divider bg-bg-surface p-6 shadow-sm">
        <h3 className="mb-5 text-sm font-bold text-text-heading">Metadata</h3>

        <div className="grid gap-5 md:grid-cols-2">
          {TEXT_FIELDS.map((f) => (
            <label key={f.name}>
              <span className="mb-1.5 block text-sm font-semibold text-text-body">
                {f.label} {f.required && <span className="text-red-500">*</span>}
              </span>
              <input
                name={f.name}
                required={f.required}
                defaultValue={initial[f.name as keyof Initial] as string}
                placeholder={f.placeholder}
                disabled={saving}
                className={INPUT_CLASS}
              />
            </label>
          ))}

          {/* Category */}
          <div>
            <span className="mb-1.5 block text-sm font-semibold text-text-body">
              Category <span className="text-red-500">*</span>
            </span>
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
            <span className="mb-1.5 block text-sm font-semibold text-text-body">
              Department <span className="text-red-500">*</span>
            </span>
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
            <span className="mb-1.5 block text-sm font-semibold text-text-body">Year</span>
            <input name="year" type="number" min="1900" max="2099"
              defaultValue={initial.year} disabled={saving} className={INPUT_CLASS} />
          </label>

          {/* Pages */}
          <label>
            <span className="mb-1.5 block text-sm font-semibold text-text-body">Pages</span>
            <input name="pages" type="number" min="1"
              defaultValue={initial.pages} disabled={saving} className={INPUT_CLASS} />
          </label>
        </div>

        {/* Summary */}
        <label className="mt-5 block">
          <span className="mb-1.5 block text-sm font-semibold text-text-body">
            Summary <span className="text-red-500">*</span>
          </span>
          <textarea
            name="summary" required rows={4} defaultValue={initial.summary} disabled={saving}
            className="w-full resize-none rounded-xl border border-divider bg-bg-surface p-4 text-sm outline-none transition-all focus:border-brand focus:ring-2 focus:ring-focus-ring/15 disabled:bg-paper disabled:opacity-60"
          />
        </label>

        {/* Tags */}
        <label className="md:col-span-2 mt-5 block">
          <span className="mb-1.5 block text-sm font-semibold text-text-body">
            Keywords / Tags (ពាក្យគន្លឺះ)
          </span>
          <TagInput
            name="tags"
            defaultTags={initial.tags}
            disabled={saving}
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
      {saving && (
        <div className="flex items-center gap-3 rounded-xl border px-4 py-3 text-sm"
          style={{ borderColor: "#A5F3FC", background: "#ECFEFF", color: "#0E7490" }}>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {phaseLabel[phase]}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit" disabled={saving}
        className="btn-brand-gradient inline-flex h-12 items-center gap-2 rounded-xl px-8 font-semibold text-white"
      >
        <Save className="h-4 w-4" />
        {phaseLabel[phase]}
      </button>
    </form>
  );
}
