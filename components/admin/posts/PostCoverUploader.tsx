"use client";

import { useRef } from "react";
import { Star, Upload, Undo2, X } from "lucide-react";

export const MAX_IMAGES = 10;
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export type CoverItem =
  | { kind: "existing"; url: string; markedForRemoval: boolean; alt: string; isHero: boolean }
  | { kind: "new"; file: File; objectUrl: string; alt: string; isHero: boolean };

export default function PostCoverUploader({
  items,
  onItemsChange,
  disabled,
  error,
  onError,
}: {
  items: CoverItem[];
  onItemsChange: (items: CoverItem[]) => void;
  disabled?: boolean;
  error?: string | null;
  onError: (message: string | null) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragIdx = useRef<number | null>(null);

  const activeCount = items.filter((it) => !(it.kind === "existing" && it.markedForRemoval)).length;

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const newItems: CoverItem[] = [];
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
      if (activeCount + newItems.length >= MAX_IMAGES) {
        errors.push(`Maximum ${MAX_IMAGES} images allowed`);
        break;
      }
      newItems.push({
        kind: "new",
        file,
        objectUrl: URL.createObjectURL(file),
        alt: "",
        isHero: items.length === 0 && newItems.length === 0,
      });
    }

    onError(errors.length ? errors.join(" · ") : null);
    onItemsChange([...items, ...newItems]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function updateItem(idx: number, patch: Partial<CoverItem>) {
    onItemsChange(items.map((it, i) => (i === idx ? ({ ...it, ...patch } as CoverItem) : it)));
  }

  function setHero(idx: number) {
    onItemsChange(items.map((it, i) => ({ ...it, isHero: i === idx })));
  }

  function toggleRemoveExisting(idx: number) {
    onItemsChange(
      items.map((it, i) => (i === idx && it.kind === "existing" ? { ...it, markedForRemoval: !it.markedForRemoval } : it)),
    );
  }

  function removeNew(idx: number) {
    const item = items[idx];
    if (item?.kind === "new") URL.revokeObjectURL(item.objectUrl);
    onItemsChange(items.filter((_, i) => i !== idx));
  }

  function onDragStart(idx: number) { dragIdx.current = idx; }
  function onDrop(idx: number) {
    if (dragIdx.current === null || dragIdx.current === idx) return;
    const arr = [...items];
    const [moved] = arr.splice(dragIdx.current, 1);
    arr.splice(idx, 0, moved);
    onItemsChange(arr);
    dragIdx.current = null;
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-text-body">
          Cover images{" "}
          <span className="font-normal text-text-muted">(optional · up to {MAX_IMAGES} · JPEG, PNG, WebP · max 5 MB each)</span>
        </span>
        {activeCount > 0 && (
          <span className="rounded-full bg-paper px-2.5 py-0.5 text-xs font-semibold text-text-body">{activeCount} / {MAX_IMAGES}</span>
        )}
      </div>

      {items.length > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((item, idx) => {
            const src = item.kind === "existing" ? item.url : item.objectUrl;
            const removed = item.kind === "existing" && item.markedForRemoval;
            return (
              <div
                key={idx}
                draggable
                onDragStart={() => onDragStart(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(idx)}
                className={`group relative cursor-grab overflow-hidden rounded-lg border-2 transition ${removed ? "border-red-300 opacity-40" : item.isHero ? "border-amber-400" : "border-divider hover:border-brand"}`}
              >
                <div className="relative" style={{ aspectRatio: "4/3" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={item.alt || `Cover image ${idx + 1}`} className="h-full w-full object-cover" />

                  <span className="absolute left-1.5 top-1.5 rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] font-bold text-white">{idx + 1}</span>

                  {!removed && (
                    <button
                      type="button"
                      onClick={() => setHero(idx)}
                      title={item.isHero ? "Hero cover" : "Set as hero cover"}
                      aria-label={item.isHero ? `Image ${idx + 1} is the hero cover` : `Set image ${idx + 1} as hero cover`}
                      aria-pressed={item.isHero}
                      className={`absolute right-1 top-1 rounded-full p-1 transition ${item.isHero ? "bg-amber-400 text-white" : "bg-black/50 text-white opacity-0 group-hover:opacity-100"}`}
                    >
                      <Star className="h-3.5 w-3.5" fill={item.isHero ? "currentColor" : "none"} />
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => (item.kind === "existing" ? toggleRemoveExisting(idx) : removeNew(idx))}
                    title={removed ? "Undo remove" : "Remove"}
                    aria-label={removed ? `Undo remove for image ${idx + 1}` : `Remove image ${idx + 1}`}
                    className="absolute bottom-1 right-1 rounded-full bg-black/50 p-1 text-white opacity-0 transition group-hover:opacity-100 disabled:cursor-not-allowed"
                  >
                    {removed ? <Undo2 className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                  </button>

                  {removed && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="rounded bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">REMOVED</span>
                    </div>
                  )}
                </div>
                {!removed && (
                  <input
                    type="text"
                    value={item.alt}
                    onChange={(e) => updateItem(idx, { alt: e.target.value })}
                    placeholder="Alt text (for accessibility & SEO)"
                    aria-label={`Alt text for image ${idx + 1}`}
                    disabled={disabled}
                    className="w-full border-t border-divider bg-bg-surface px-2 py-1.5 text-[11px] outline-none placeholder:text-text-muted/70 disabled:opacity-60"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        multiple
        disabled={disabled || activeCount >= MAX_IMAGES}
        onChange={handleFilePick}
        className="hidden"
        id="cover-file-input"
      />
      <label htmlFor="cover-file-input" className="sr-only">Upload cover images</label>
      <button
        type="button"
        disabled={disabled || activeCount >= MAX_IMAGES}
        onClick={() => fileInputRef.current?.click()}
        className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-divider bg-paper py-4 text-sm font-semibold text-text-body transition hover:border-brand hover:bg-cyan-50/40 hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Upload className="h-5 w-5" />
        {activeCount === 0 ? "Choose or drop images" : "Add more images"}
      </button>
      <p className="mt-1.5 text-xs text-text-muted">
        Drag thumbnails to reorder. Click the star to set the hero cover — defaults to the first image.
      </p>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
