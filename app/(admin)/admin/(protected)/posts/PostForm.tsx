"use client";

// app/admin/posts/PostForm.tsx
import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { createPost, updatePost } from "@/app/(admin)/admin/(protected)/posts/actions";
import { getPresignedUrl } from "@/app/actions/upload";
import { makeUid, postFolder, postCoverPath } from "@/lib/book-utils";
import Icon from "@/components/ui/core/Icon";

const CATEGORIES = ["Research", "Announcement", "Event", "Journal", "Other"] as const;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_IMAGES = 10;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type Phase = "idle" | "uploading" | "saving";

export type PostInitial = {
  id: string;
  title: string;
  category: string;
  excerpt: string | null;
  content: string;
  coverUrls: string[];        // ← array now (was coverUrl: string | null)
  isPublished: boolean;
};

// Preview item — either an existing URL or a new File picked by the user
type PreviewItem =
  | { kind: "existing"; url: string; markedForRemoval: boolean }
  | { kind: "new"; file: File; objectUrl: string };

export default function PostForm({ initial }: { initial?: PostInitial }) {
  const supabase = createClient();
  const isEdit = !!initial;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(initial?.title ?? "");

  // Build initial preview list from existing URLs
  const [previews, setPreviews] = useState<PreviewItem[]>(() =>
    (initial?.coverUrls ?? []).map((url) => ({
      kind: "existing",
      url,
      markedForRemoval: false,
    }))
  );

  const busy = phase !== "idle";

  // ── File picker handler ────────────────────────────────────────
  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const newItems: PreviewItem[] = [];
    const errors: string[] = [];

    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        errors.push(`${file.name}: must be JPEG, PNG, WebP, or AVIF`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name}: must be under 5 MB`);
        continue;
      }
      const totalAfter =
        previews.filter((p) => !(p.kind === "existing" && p.markedForRemoval)).length +
        newItems.length;
      if (totalAfter >= MAX_IMAGES) {
        errors.push(`Maximum ${MAX_IMAGES} images allowed`);
        break;
      }
      newItems.push({ kind: "new", file, objectUrl: URL.createObjectURL(file) });
    }

    if (errors.length) setError(errors.join(" · "));
    else setError(null);

    setPreviews((prev) => [...prev, ...newItems]);
    // Reset input so the same file can be picked again
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function toggleRemoveExisting(idx: number) {
    setPreviews((prev) =>
      prev.map((item, i) =>
        i === idx && item.kind === "existing"
          ? { ...item, markedForRemoval: !item.markedForRemoval }
          : item
      )
    );
  }

  function removeNew(idx: number) {
    setPreviews((prev) => {
      const item = prev[idx];
      if (item.kind === "new") URL.revokeObjectURL(item.objectUrl);
      return prev.filter((_, i) => i !== idx);
    });
  }

  // Drag-to-reorder (simple swap on drop)
  const dragIdx = useRef<number | null>(null);

  function onDragStart(idx: number) { dragIdx.current = idx; }
  function onDrop(idx: number) {
    if (dragIdx.current === null || dragIdx.current === idx) return;
    setPreviews((prev) => {
      const arr = [...prev];
      const [moved] = arr.splice(dragIdx.current!, 1);
      arr.splice(idx, 0, moved);
      return arr;
    });
    dragIdx.current = null;
  }

  // ── Submit ─────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = e.currentTarget;
    const formData = new FormData(form);

    const titleVal    = (formData.get("title") as string)?.trim();
    const contentVal  = (formData.get("content") as string)?.trim();
    const categoryVal = (formData.get("category") as string)?.trim();

    if (!titleVal)    { setError("Title is required");    return; }
    if (!categoryVal) { setError("Category is required"); return; }
    if (!contentVal)  { setError("Content is required");  return; }

    try {
      // ── 1. Upload new images to Cloudflare R2 via Presigned URLs ───────────────
      const newPreviews = previews.filter((p): p is Extract<PreviewItem, { kind: "new" }> =>
        p.kind === "new"
      );

      const uploadedUrls: string[] = [];
      if (newPreviews.length > 0) {
        setPhase("uploading");
        // All images for this post live in one folder: posts/{slug}-{uid}/
        const folder = postFolder(titleVal, makeUid());
        for (let i = 0; i < newPreviews.length; i++) {
          setUploadProgress(`Uploading image ${i + 1} of ${newPreviews.length}…`);
          const { file } = newPreviews[i];
          const path = postCoverPath(folder, i, file.name);

          try {
            const presignedRes = await getPresignedUrl(path, file.type, "public");
            if ("error" in presignedRes) {
              throw new Error(presignedRes.error);
            }
            const { presignedUrl, publicUrl } = presignedRes;
            
            const upRes = await fetch(presignedUrl, {
              method: "PUT",
              body: file,
              headers: {
                "Content-Type": file.type,
              },
            });

            if (!upRes.ok) throw new Error(upRes.statusText);

            uploadedUrls.push(publicUrl);
          } catch (upErr) {
            console.warn("Upload failed:", upErr instanceof Error ? upErr.message : upErr);
            continue; // skip failed, keep going
          }
        }
      }

      // ── 2. Build final ordered URL list ───────────────────────
      // Walk previews in display order:
      //   existing + not removed → keep URL
      //   new → use uploaded URL (match by index among new items)
      let newIdx = 0;
      const finalUrls: string[] = [];
      for (const item of previews) {
        if (item.kind === "existing") {
          if (!item.markedForRemoval) finalUrls.push(item.url);
        } else {
          // new item — grab the corresponding uploaded URL (if upload succeeded)
          if (uploadedUrls[newIdx] !== undefined) finalUrls.push(uploadedUrls[newIdx]);
          newIdx++;
        }
      }

      // ── 3. Save via Server Action ──────────────────────────────
      setPhase("saving");
      setUploadProgress("Saving post…");

      const payload = new FormData();
      payload.set("title",       titleVal);
      payload.set("category",    categoryVal);
      payload.set("excerpt",     (formData.get("excerpt") as string) ?? "");
      payload.set("content",     contentVal);
      payload.set("isPublished", formData.get("isPublished") === "on" ? "true" : "false");
      // Pass as JSON array string — actions.ts will parse it
      payload.set("coverUrls",   JSON.stringify(finalUrls));

      if (isEdit && initial) {
        await updatePost(initial.id, payload);
      } else {
        await createPost(payload);
      }
    } catch (err) {
      setPhase("idle");
      setUploadProgress("");
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  const activeCount = previews.filter(
    (p) => !(p.kind === "existing" && p.markedForRemoval)
  ).length;

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-5 rounded-xl border border-divider bg-bg-surface p-6 shadow-sm md:grid-cols-2 md:p-8"
    >
      <h2 className="text-lg font-bold text-text-heading md:col-span-2">
        {isEdit ? "Edit post" : "New post"}
      </h2>

      {/* Title */}
      <label className="md:col-span-2">
        <span className="mb-1.5 block text-sm font-semibold text-text-body">
          Title <span className="text-red-500">*</span>
        </span>
        <input
          name="title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Post title"
          disabled={busy}
          className="h-11 w-full rounded-lg border border-divider px-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15 disabled:bg-paper disabled:opacity-60"
        />
        {title.trim() && (
          <p className="mt-1.5 text-xs text-text-muted">
            Slug: <span className="font-mono text-text-muted">/posts/{slugify(title) || "…"}</span>
          </p>
        )}
      </label>

      {/* Category */}
      <label>
        <span className="mb-1.5 block text-sm font-semibold text-text-body">
          Category <span className="text-red-500">*</span>
        </span>
        <select
          name="category"
          required
          defaultValue={initial?.category ?? "Research"}
          disabled={busy}
          className="h-11 w-full rounded-lg border border-divider bg-bg-surface px-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15 disabled:opacity-60"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>

      {/* Publish toggle */}
      <label className="flex items-end pb-1">
        <span className="flex items-center gap-3 rounded-lg border border-divider px-4 py-2.5 w-full h-11">
          <input
            name="isPublished"
            type="checkbox"
            defaultChecked={initial?.isPublished ?? false}
            disabled={busy}
            className="h-4 w-4 rounded border-divider text-brand focus:ring-focus-ring/30 disabled:opacity-60"
          />
          <span className="text-sm font-semibold text-text-body">Publish immediately</span>
        </span>
      </label>

      {/* ── Cover images (multi) ─────────────────────────────── */}
      <div className="md:col-span-2">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-text-body">
            Cover images{" "}
            <span className="font-normal text-text-muted">
              (optional · up to {MAX_IMAGES} · JPEG, PNG, WebP · max 5 MB each)
            </span>
          </span>
          {activeCount > 0 && (
            <span className="rounded-full bg-paper px-2.5 py-0.5 text-xs font-semibold text-text-body">
              {activeCount} / {MAX_IMAGES}
            </span>
          )}
        </div>

        {/* Preview grid */}
        {previews.length > 0 && (
          <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {previews.map((item, idx) => {
              const src = item.kind === "existing" ? item.url : item.objectUrl;
              const removed = item.kind === "existing" && item.markedForRemoval;
              return (
                <div
                  key={idx}
                  draggable
                  onDragStart={() => onDragStart(idx)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(idx)}
                  className={`group relative cursor-grab overflow-hidden rounded-lg border-2 transition ${
                    removed
                      ? "border-red-300 opacity-40"
                      : "border-divider hover:border-brand"
                  }`}
                  style={{ aspectRatio: "4/3" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`Image ${idx + 1}`}
                    className="h-full w-full object-cover"
                  />

                  {/* Order badge */}
                  {!removed && (
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {idx + 1}
                    </span>
                  )}

                  {/* Remove / undo button */}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      item.kind === "existing"
                        ? toggleRemoveExisting(idx)
                        : removeNew(idx)
                    }
                    className="absolute right-1 top-1 rounded-full bg-black/50 p-1 text-white opacity-0 transition group-hover:opacity-100 disabled:cursor-not-allowed"
                    title={removed ? "Undo remove" : "Remove"}
                  >
                    {removed ? (
                      // undo arrow
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                        <path d="M9 14l-4-4 4-4"/><path d="M5 10h11a4 4 0 0 1 0 8h-1"/>
                      </svg>
                    ) : (
                      // ✕
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                        <path d="M18 6L6 18M6 6l12 12"/>
                      </svg>
                    )}
                  </button>

                  {removed && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="rounded bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">
                        REMOVED
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* File picker — hidden, triggered by button */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          disabled={busy || activeCount >= MAX_IMAGES}
          onChange={handleFilePick}
          className="hidden"
        />
        <button
          type="button"
          disabled={busy || activeCount >= MAX_IMAGES}
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-divider bg-paper py-4 text-sm font-semibold text-text-body transition hover:border-brand hover:bg-cyan-50/40 hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          {activeCount === 0 ? "Choose images" : "Add more images"}
        </button>
        <p className="mt-1.5 text-xs text-text-muted">
          Drag thumbnails above to reorder. First image shown as hero cover.
        </p>
      </div>

      {/* Excerpt */}
      <label className="md:col-span-2">
        <span className="mb-1.5 block text-sm font-semibold text-text-body">
          Excerpt{" "}
          <span className="font-normal text-text-muted">(optional — auto-generated from content if empty)</span>
        </span>
        <textarea
          name="excerpt"
          rows={2}
          defaultValue={initial?.excerpt ?? ""}
          disabled={busy}
          placeholder="Short summary shown on cards (~150 characters)…"
          className="w-full resize-none rounded-lg border border-divider p-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15 disabled:bg-paper disabled:opacity-60"
        />
      </label>

      {/* Content */}
      <label className="md:col-span-2">
        <span className="mb-1.5 block text-sm font-semibold text-text-body">
          Content <span className="text-red-500">*</span>{" "}
          <span className="font-normal text-text-muted">(Markdown supported)</span>
        </span>
        <textarea
          name="content"
          required
          rows={14}
          defaultValue={initial?.content ?? ""}
          disabled={busy}
          placeholder={"Write your post in Markdown…\n\n## A heading\n\nSome **bold** text and a [link](https://example.com)."}
          className="w-full resize-y rounded-lg border border-divider p-4 text-sm font-mono leading-relaxed outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15 disabled:bg-paper disabled:opacity-60"
        />
      </label>

      {/* Error */}
      {error && (
        <div className="md:col-span-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Progress */}
      {busy && (
        <div className="md:col-span-2 flex items-center gap-3 rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-600 border-t-transparent" />
          {uploadProgress}
        </div>
      )}

      <div className="md:col-span-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-blue-950 px-6 font-semibold text-white transition hover:bg-brand disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Icon name="pdf" className="text-lg" />
          {busy ? uploadProgress : isEdit ? "Save changes" : "Create post"}
        </button>
      </div>
    </form>
  );
}