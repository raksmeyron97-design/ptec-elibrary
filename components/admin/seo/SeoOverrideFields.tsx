"use client";

// Shared per-resource SEO override editor (migration 0112). Uncontrolled by
// design: the three inputs carry plain `name=` attributes (seo_title,
// seo_description, og_image) so any FormData-submitting admin form picks them up
// with zero extra wiring — the book editor (edit/[id]/EditForm) and the catalog
// wizard both submit via FormData. Internal state only drives the live char
// counters + Google/social preview; it is never lifted.
//
// A blank field means "no override" — the SEO builders fall back to the
// auto-generated title/description/cover, so leaving these empty is always safe.

import { useState } from "react";
import { isSafeImageSrc } from "@/lib/safe-image-src";

export type SeoOverrideLabels = {
  heading: string;
  hint: string;
  seoTitle: string;
  seoDescription: string;
  ogImage: string;
  searchPreview: string;
  titlePlaceholder?: string;
  descPlaceholder?: string;
  ogPlaceholder?: string;
};

const DEFAULT_LABELS: SeoOverrideLabels = {
  heading: "Search engine optimization",
  hint: "Optional. Leave blank to auto-generate from the record's title, summary and cover.",
  seoTitle: "SEO title",
  seoDescription: "Meta description",
  ogImage: "Social image URL (Open Graph)",
  searchPreview: "Search result preview",
  titlePlaceholder: "Defaults to the record title",
  descPlaceholder: "Defaults to an auto-generated summary",
  ogPlaceholder: "Defaults to the cover image",
};

const fieldClass =
  "w-full rounded-lg border border-divider px-3.5 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15 disabled:bg-paper disabled:opacity-60";

export default function SeoOverrideFields({
  routePrefix,
  slug,
  siteUrl,
  defaultSeoTitle = "",
  defaultSeoDescription = "",
  defaultOgImage = "",
  fallbackTitle = "",
  fallbackDescription = "",
  fallbackImage = null,
  disabled,
  labels,
}: {
  /** e.g. "/books", "/catalogs", "/publications" — for the preview URL only. */
  routePrefix: string;
  slug?: string;
  siteUrl: string;
  defaultSeoTitle?: string | null;
  defaultSeoDescription?: string | null;
  defaultOgImage?: string | null;
  /** Auto-generated values shown as placeholders/preview when no override is set. */
  fallbackTitle?: string;
  fallbackDescription?: string;
  fallbackImage?: string | null;
  disabled?: boolean;
  labels?: Partial<SeoOverrideLabels>;
}) {
  const l = { ...DEFAULT_LABELS, ...labels };
  const [seoTitle, setSeoTitle] = useState(defaultSeoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(defaultSeoDescription ?? "");
  const [ogImage, setOgImage] = useState(defaultOgImage ?? "");

  const previewTitle = seoTitle.trim() || fallbackTitle || l.titlePlaceholder!;
  const previewDescription = seoDescription.trim() || fallbackDescription || l.descPlaceholder!;
  const rawPreviewImage = ogImage.trim() || fallbackImage;
  const previewImage = isSafeImageSrc(rawPreviewImage) ? rawPreviewImage : null;
  const displayUrl = siteUrl.replace(/^https?:\/\//, "");

  return (
    <div className="space-y-4 rounded-xl border border-divider bg-bg-surface p-5 shadow-sm">
      <div>
        <h3 className="text-sm font-bold text-text-heading">{l.heading}</h3>
        <p className="mt-0.5 text-xs text-text-muted">{l.hint}</p>
      </div>

      <label className="block">
        <span className="mb-1 flex items-center justify-between text-xs font-semibold text-text-body">
          {l.seoTitle}
          <span className="font-normal text-text-muted tabular-nums">{seoTitle.length}/60</span>
        </span>
        <input
          type="text"
          name="seo_title"
          value={seoTitle}
          onChange={(e) => setSeoTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
          disabled={disabled}
          placeholder={fallbackTitle || l.titlePlaceholder}
          maxLength={70}
          className={fieldClass}
        />
      </label>

      <label className="block">
        <span className="mb-1 flex items-center justify-between text-xs font-semibold text-text-body">
          {l.seoDescription}
          <span className="font-normal text-text-muted tabular-nums">{seoDescription.length}/160</span>
        </span>
        <textarea
          name="seo_description"
          rows={2}
          value={seoDescription}
          onChange={(e) => setSeoDescription(e.target.value)}
          disabled={disabled}
          placeholder={fallbackDescription || l.descPlaceholder}
          maxLength={200}
          className={`${fieldClass} resize-none`}
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-text-body">{l.ogImage}</span>
        <input
          type="url"
          name="og_image"
          value={ogImage}
          onChange={(e) => setOgImage(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
          disabled={disabled}
          placeholder={l.ogPlaceholder}
          className={fieldClass}
        />
      </label>

      <div className="rounded-lg border border-divider p-3">
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-text-muted">{l.searchPreview}</p>
        <p className="truncate text-[13px] text-emerald-700 dark:text-emerald-400">
          {siteUrl}{routePrefix}/{slug || "…"}
        </p>
        <p className="truncate text-[18px] text-blue-800 dark:text-blue-300 hover:underline">{previewTitle}</p>
        <p className="line-clamp-2 text-[13px] text-text-body">{previewDescription}</p>
      </div>

      {previewImage && (
        <div className="overflow-hidden rounded-lg border border-divider">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewImage} alt="" className="h-32 w-full object-cover" />
          <div className="bg-paper p-3">
            <p className="text-[10px] uppercase tracking-wide text-text-muted">{displayUrl}</p>
            <p className="truncate text-sm font-bold text-text-heading">{previewTitle}</p>
            <p className="line-clamp-2 text-xs text-text-muted">{previewDescription}</p>
          </div>
        </div>
      )}
    </div>
  );
}
