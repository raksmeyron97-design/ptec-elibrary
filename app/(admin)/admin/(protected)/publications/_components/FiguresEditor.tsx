"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  FileImage,
  ImagePlus,
  Images,
  Loader2,
  Save,
  Trash2,
} from "lucide-react";

import {
  getPublicationFigures,
  savePublicationFigures,
  type PublicationFigureInput,
} from "@/app/actions/publications";
import type { PublicationFigure } from "@/lib/publications";
import { Field, FieldEmptyState } from "@/components/admin/kit/form";

/**
 * Manage a publication's figures.
 *
 * WHY IT SAVES ITSELF. The rest of this editor writes through
 * savePublicationWorkspace, which carries optimistic-concurrency tokens, a
 * debounced recovery draft and a server-side publish gate. Figures are a
 * separate table with their own replace-all action, and threading them through
 * that machinery would mean a caption typo re-entering the revision-conflict
 * path. So this panel owns its own Save, and says so.
 *
 * WHY IT NEEDS AN EXISTING ARTICLE. Figures are rows keyed on publication_id.
 * There is no id to key on until the article has been saved once, so on a brand
 * new record the panel asks for that first rather than silently discarding the
 * work at submit time.
 *
 * ALT TEXT AND CAPTION ARE BOTH ASKED FOR, separately, because they are
 * different jobs — the caption is the printed "Figure 1. …" line, the alt text
 * is what a screen reader says instead of the image. The hint under each says
 * which is which, since that is the distinction cataloguers most often collapse.
 */

type Row = {
  /** Stable key for React across reorders — not the database id. */
  key: string;
  image_url: string;
  caption: string;
  caption_km: string;
  alt_text: string;
  credit: string;
  /** Set while this row's image is uploading. */
  uploading?: boolean;
};

let keySeq = 0;
const nextKey = () => `fig-${++keySeq}`;

function toRow(figure: PublicationFigure): Row {
  return {
    key: nextKey(),
    image_url: figure.image_url,
    caption: figure.caption ?? "",
    caption_km: figure.caption_km ?? "",
    alt_text: figure.alt_text ?? "",
    credit: figure.credit ?? "",
  };
}

async function uploadFigure(file: File, slug: string, index: number): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const seq = String(index + 1).padStart(2, "0");
  const payload = new FormData();
  payload.set("file", file);
  // "publications/" is the allow-listed folder whose permission check is
  // publications:write — the same permission that governs the article this
  // figure belongs to (app/actions/upload.ts permissionResourceForFolder).
  payload.set("key", `publications/${slug || "publication"}/figures/figure-${seq}-${Date.now()}.${ext}`);
  const res = await fetch("/api/admin/upload", { method: "POST", body: payload });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Upload failed (${res.status})`);
  }
  const { url } = await res.json();
  return url as string;
}

export default function FiguresEditor({
  publicationId,
  slug,
}: {
  /** null until the article has been saved at least once. */
  publicationId: string | null;
  slug: string;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(!!publicationId);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const statusId = useId();

  // `loading` is initialised to `!!publicationId`, so this effect only has to
  // turn it OFF — setting it true here would be a synchronous setState in an
  // effect body for a value that is already correct on the first render.
  useEffect(() => {
    if (!publicationId) return;
    let cancelled = false;
    void getPublicationFigures(publicationId).then((figures) => {
      if (cancelled) return;
      setRows(figures.map(toRow));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [publicationId]);

  const mutate = (next: Row[]) => {
    setRows(next);
    setDirty(true);
    setSaved(false);
  };

  const update = (key: string, patch: Partial<Row>) =>
    mutate(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    mutate(next);
  };

  const addFiles = async (files: FileList) => {
    setError("");
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) {
      setError("Figures must be images (JPG, PNG, WebP or AVIF).");
      return;
    }
    const tooBig = images.find((f) => f.size > 8 * 1024 * 1024);
    if (tooBig) {
      setError(`"${tooBig.name}" is over 8 MB. Please use a smaller image.`);
      return;
    }

    // Placeholder rows first, so the list shows what is happening and the
    // existing figures are never disturbed by a failure below.
    const placeholders: Row[] = images.map(() => ({
      key: nextKey(),
      image_url: "",
      caption: "",
      caption_km: "",
      alt_text: "",
      credit: "",
      uploading: true,
    }));
    setRows((prev) => [...prev, ...placeholders]);
    setDirty(true);
    setSaved(false);

    for (let i = 0; i < images.length; i++) {
      const placeholder = placeholders[i];
      try {
        const url = await uploadFigure(images[i], slug, rows.length + i);
        setRows((prev) =>
          prev.map((row) =>
            row.key === placeholder.key ? { ...row, image_url: url, uploading: false } : row,
          ),
        );
      } catch (err) {
        // Drop only the row that failed; everything already in the list stays.
        setRows((prev) => prev.filter((row) => row.key !== placeholder.key));
        setError(err instanceof Error ? err.message : "That image could not be uploaded.");
      }
    }
  };

  const save = async () => {
    if (!publicationId || saving) return;
    const pending = rows.some((r) => r.uploading || !r.image_url);
    if (pending) {
      setError("Wait for every image to finish uploading before saving.");
      return;
    }
    setError("");
    setSaving(true);
    const payload: PublicationFigureInput[] = rows.map((row) => ({
      image_url: row.image_url,
      caption: row.caption,
      caption_km: row.caption_km,
      alt_text: row.alt_text,
      credit: row.credit,
    }));
    const result = await savePublicationFigures(publicationId, payload);
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? "The figures could not be saved.");
      return;
    }
    setDirty(false);
    setSaved(true);
  };

  if (!publicationId) {
    return (
      <FieldEmptyState
        icon={Images}
        title="Save the article first"
        description="Figures are stored against the article, so it needs to exist before they can be attached. Save this draft and the panel opens here."
      />
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-text-muted">Loading figures…</p>
      ) : rows.length === 0 ? (
        <FieldEmptyState
          icon={FileImage}
          title="No figures yet"
          description="Add the article's charts, diagrams or photographs. Each one gets a numbered caption on the public page and can be opened full-size."
        />
      ) : (
        <ol className="space-y-4">
          {rows.map((row, index) => (
            <li
              key={row.key}
              className="rounded-xl border border-divider bg-paper/40 p-4"
            >
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="flex h-28 w-full shrink-0 items-center justify-center overflow-hidden rounded-lg border border-divider bg-bg-surface sm:w-40">
                  {row.uploading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-text-muted" aria-hidden="true" />
                  ) : row.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.image_url} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <ImagePlus className="h-5 w-5 text-text-muted" aria-hidden="true" />
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-text-heading">Figure {index + 1}</p>
                    <div className="flex items-center gap-1 text-text-muted">
                      <button
                        type="button"
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                        aria-label={`Move figure ${index + 1} up`}
                        className="focus-field cursor-pointer rounded p-1.5 transition-colors hover:text-brand disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <ArrowUp className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(index, 1)}
                        disabled={index === rows.length - 1}
                        aria-label={`Move figure ${index + 1} down`}
                        className="focus-field cursor-pointer rounded p-1.5 transition-colors hover:text-brand disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <ArrowDown className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => mutate(rows.filter((r) => r.key !== row.key))}
                        aria-label={`Remove figure ${index + 1}`}
                        className="focus-field cursor-pointer rounded p-1.5 transition-colors hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <Field
                    label="Caption"
                    htmlFor={`fig-caption-${row.key}`}
                    hint="The printed line under the image. The Figure number is added automatically."
                  >
                    {(p) => (
                      <input
                        {...p}
                        value={row.caption}
                        onChange={(e) => update(row.key, { caption: e.target.value })}
                        placeholder="Guiding principles of responsible chemistry."
                      />
                    )}
                  </Field>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field
                      label="Alt text"
                      htmlFor={`fig-alt-${row.key}`}
                      hint="What a screen reader says in place of the image. Describe the content, not the role."
                    >
                      {(p) => (
                        <input
                          {...p}
                          value={row.alt_text}
                          onChange={(e) => update(row.key, { alt_text: e.target.value })}
                          placeholder="Flow chart with four linked stages"
                        />
                      )}
                    </Field>
                    <Field
                      label="Credit"
                      htmlFor={`fig-credit-${row.key}`}
                      hint="Photographer, source or licence, where one is owed."
                    >
                      {(p) => (
                        <input
                          {...p}
                          value={row.credit}
                          onChange={(e) => update(row.key, { credit: e.target.value })}
                        />
                      )}
                    </Field>
                  </div>

                  <Field label="Caption (Khmer)" htmlFor={`fig-caption-km-${row.key}`}>
                    {(p) => (
                      <input
                        {...p}
                        lang="km"
                        value={row.caption_km}
                        onChange={(e) => update(row.key, { caption_km: e.target.value })}
                      />
                    )}
                  </Field>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          id="fig-add"
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <label
          htmlFor="fig-add"
          className="focus-field inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-divider bg-bg-surface px-3.5 text-sm font-semibold text-text-body transition-colors hover:border-brand hover:text-brand"
        >
          <ImagePlus className="h-4 w-4" aria-hidden="true" />
          Add figures
        </label>

        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          aria-describedby={statusId}
          className="focus-field inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-contrast transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="h-4 w-4" aria-hidden="true" />
          )}
          {saving ? "Saving…" : "Save figures"}
        </button>

        {/* Truthful status. Figures save separately from the rest of the form,
            so the panel has to say which state it is actually in rather than
            letting the main save bar speak for it. */}
        <p id={statusId} aria-live="polite" className="text-xs text-text-muted">
          {saving
            ? "Saving figures…"
            : dirty
              ? "Unsaved figure changes — they save separately from the article."
              : saved
                ? "Figures saved."
                : "Figures save separately from the rest of this form."}
        </p>
      </div>
    </div>
  );
}
