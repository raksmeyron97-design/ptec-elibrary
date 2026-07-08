"use client";

import SearchableSelect from "@/components/ui/search/SearchableSelect";
import { CATEGORIES, VISIBILITY_OPTIONS, type PostCategory, type PostStatus, type PostVisibility } from "@/lib/admin/posts-shared";

const fieldClass =
  "h-11 w-full rounded-lg border border-divider bg-bg-surface px-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15 disabled:opacity-60";

const STATUS_OPTIONS: { value: PostStatus; label: string; help: string }[] = [
  { value: "draft", label: "Draft", help: "Not visible to the public" },
  { value: "published", label: "Publish now", help: "Goes live immediately on save" },
  { value: "scheduled", label: "Schedule", help: "Goes live automatically at a future date/time" },
];

const VISIBILITY_LABELS: Record<PostVisibility, string> = {
  public: "Public — listed and searchable",
  unlisted: "Unlisted — viewable via direct link only",
  admin_only: "Admin only — hidden from the public site",
};

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
  return (
    <div className="space-y-5 rounded-xl border border-divider bg-bg-surface p-5 shadow-sm">
      <div>
        <span className="mb-2 block text-sm font-semibold text-text-body">Publish settings</span>
        <div className="space-y-2" role="radiogroup" aria-label="Publish status">
          {STATUS_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition ${
                status === opt.value ? "border-brand bg-brand/5" : "border-divider hover:bg-paper"
              }`}
            >
              <input
                type="radio"
                name="status"
                value={opt.value}
                checked={status === opt.value}
                onChange={() => onStatusChange(opt.value)}
                disabled={disabled}
                className="mt-0.5 h-4 w-4 border-divider text-brand focus:ring-focus-ring/30"
              />
              <span>
                <span className="block text-sm font-semibold text-text-heading">{opt.label}</span>
                <span className="block text-xs text-text-muted">{opt.help}</span>
              </span>
            </label>
          ))}
        </div>

        {status === "scheduled" && (
          <div className="mt-2.5">
            <label htmlFor="scheduledAt" className="mb-1.5 block text-xs font-semibold text-text-body">
              Publish date &amp; time <span className="text-red-500">*</span>
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
        <span className="mb-1.5 block text-sm font-semibold text-text-body">Visibility</span>
        <SearchableSelect
          name="visibility"
          ariaLabel="Visibility"
          value={visibility}
          onChange={(v) => onVisibilityChange(v as PostVisibility)}
          disabled={disabled}
          options={VISIBILITY_OPTIONS.map((v) => ({ value: v, label: VISIBILITY_LABELS[v] }))}
        />
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-semibold text-text-body">
          Category <span className="text-red-500">*</span>
        </span>
        <SearchableSelect
          name="category"
          ariaLabel="Category"
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
