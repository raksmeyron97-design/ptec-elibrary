"use client";

import { useTranslations } from "next-intl";
import SearchableSelect from "@/components/ui/search/SearchableSelect";
import { CATEGORIES, VISIBILITY_OPTIONS, type PostCategory, type PostStatus, type PostVisibility } from "@/lib/admin/posts-shared";

const fieldClass =
  "h-11 w-full rounded-lg border border-divider bg-bg-surface px-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15 disabled:opacity-60";

const STATUS_VALUES: PostStatus[] = ["draft", "published", "scheduled"];

export default function PostPublishPanel({
  status,
  onStatusChange,
  scheduledAt,
  onScheduledAtChange,
  scheduledAtError,
  visibility,
  onVisibilityChange,
  category,
  onCategoryChange,
  disabled,
}: {
  status: PostStatus;
  onStatusChange: (status: PostStatus) => void;
  scheduledAt: string;
  onScheduledAtChange: (value: string) => void;
  scheduledAtError?: string | null;
  visibility: PostVisibility;
  onVisibilityChange: (visibility: PostVisibility) => void;
  category: PostCategory;
  onCategoryChange: (category: PostCategory) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("adminPostForm.publish");
  return (
    <div className="space-y-5 rounded-xl border border-divider bg-bg-surface p-5 shadow-sm">
      <div>
        <span className="mb-2 block text-sm font-semibold text-text-body">{t("settings")}</span>
        <div className="space-y-2" role="radiogroup" aria-label={t("statusAria")}>
          {STATUS_VALUES.map((value) => (
            <label
              key={value}
              className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition ${
                status === value ? "border-brand bg-brand/5" : "border-divider hover:bg-paper"
              }`}
            >
              <input
                type="radio"
                name="status"
                value={value}
                checked={status === value}
                onChange={() => onStatusChange(value)}
                disabled={disabled}
                className="mt-0.5 h-4 w-4 border-divider text-brand focus:ring-focus-ring/30"
              />
              <span>
                <span className="block text-sm font-semibold text-text-heading">{t(`status.${value}.label`)}</span>
                <span className="block text-xs text-text-muted">{t(`status.${value}.help`)}</span>
              </span>
            </label>
          ))}
        </div>

        {status === "scheduled" && (
          <div className="mt-2.5">
            <label htmlFor="scheduledAt" className="mb-1.5 block text-xs font-semibold text-text-body">
              {t("publishDate")} <span className="text-red-500">*</span>
            </label>
            <input
              id="scheduledAt"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => onScheduledAtChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
              disabled={disabled}
              required={status === "scheduled"}
              aria-invalid={!!scheduledAtError}
              aria-describedby={scheduledAtError ? "scheduledAt-error" : undefined}
              className={fieldClass}
            />
            {scheduledAtError && (
              <p id="scheduledAt-error" className="mt-1 text-xs text-red-600">{scheduledAtError}</p>
            )}
          </div>
        )}
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-semibold text-text-body">{t("visibility")}</span>
        <SearchableSelect
          name="visibility"
          ariaLabel={t("visibility")}
          value={visibility}
          onChange={(v) => onVisibilityChange(v as PostVisibility)}
          disabled={disabled}
          options={VISIBILITY_OPTIONS.map((v) => ({ value: v, label: t(`visibilityLabels.${v}`) }))}
        />
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-semibold text-text-body">
          {t("category")} <span className="text-red-500">*</span>
        </span>
        <SearchableSelect
          name="category"
          ariaLabel={t("category")}
          required
          value={category}
          onChange={(v) => onCategoryChange(v as PostCategory)}
          disabled={disabled}
          options={[...CATEGORIES]}
        />
      </div>
    </div>
  );
}
