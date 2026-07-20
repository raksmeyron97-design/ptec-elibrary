"use client";

import { useTranslations } from "next-intl";

const fieldClass =
  "w-full rounded-lg border border-divider px-3.5 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15 disabled:bg-paper disabled:opacity-60";

export default function SeoSettings({
  seoTitle,
  seoDescription,
  ogImage,
  onSeoTitleChange,
  onSeoDescriptionChange,
  onOgImageChange,
  fallbackTitle,
  fallbackDescription,
  fallbackImage,
  siteUrl,
  slug,
  disabled,
}: {
  seoTitle: string;
  seoDescription: string;
  ogImage: string;
  onSeoTitleChange: (v: string) => void;
  onSeoDescriptionChange: (v: string) => void;
  onOgImageChange: (v: string) => void;
  fallbackTitle: string;
  fallbackDescription: string;
  fallbackImage: string | null;
  siteUrl: string;
  slug: string;
  disabled?: boolean;
}) {
  const t = useTranslations("adminPostForm.seo");
  const previewTitle = seoTitle || fallbackTitle || t("untitled");
  const previewDescription = seoDescription || fallbackDescription || t("noDescription");
  const previewImage = ogImage || fallbackImage;

  return (
    <div className="space-y-4 rounded-xl border border-divider bg-bg-surface p-5 shadow-sm">
      <h3 className="text-sm font-bold text-text-heading">{t("heading")}</h3>

      <label className="block">
        <span className="mb-1 flex items-center justify-between text-xs font-semibold text-text-body">
          {t("seoTitle")}
          <span className="font-normal text-text-muted">{seoTitle.length}/60</span>
        </span>
        <input
          type="text"
          value={seoTitle}
          onChange={(e) => onSeoTitleChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
          disabled={disabled}
          placeholder={fallbackTitle}
          maxLength={70}
          className={fieldClass}
        />
      </label>

      <label className="block">
        <span className="mb-1 flex items-center justify-between text-xs font-semibold text-text-body">
          {t("seoDescription")}
          <span className="font-normal text-text-muted">{seoDescription.length}/160</span>
        </span>
        <textarea
          rows={2}
          value={seoDescription}
          onChange={(e) => onSeoDescriptionChange(e.target.value)}
          disabled={disabled}
          placeholder={fallbackDescription || t("descPlaceholder")}
          maxLength={200}
          className={`${fieldClass} resize-none`}
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-text-body">{t("ogImage")}</span>
        <input
          type="text"
          value={ogImage}
          onChange={(e) => onOgImageChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
          disabled={disabled}
          placeholder={t("ogPlaceholder")}
          className={fieldClass}
        />
      </label>

      {/* Google-style preview */}
      <div className="rounded-lg border border-divider p-3">
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-text-muted">{t("searchPreview")}</p>
        <p className="truncate text-[13px] text-emerald-800">{siteUrl}/posts/{slug || "…"}</p>
        <p className="truncate text-[18px] text-blue-800 hover:underline">{previewTitle}</p>
        <p className="line-clamp-2 text-[13px] text-text-body">{previewDescription}</p>
      </div>

      {/* Social preview */}
      <div className="overflow-hidden rounded-lg border border-divider">
        {previewImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewImage} alt="" className="h-32 w-full object-cover" />
        )}
        <div className="bg-paper p-3">
          <p className="text-[10px] uppercase tracking-wide text-text-muted">{siteUrl.replace(/^https?:\/\//, "")}</p>
          <p className="truncate text-sm font-bold text-text-heading">{previewTitle}</p>
          <p className="line-clamp-2 text-xs text-text-muted">{previewDescription}</p>
        </div>
      </div>
    </div>
  );
}
