"use client";

import { useTranslations } from "next-intl";
import { EVENT_FORMATS, EVENT_STATUS_OVERRIDES } from "@/lib/admin/posts-shared";

const fieldClass =
  "h-11 w-full rounded-lg border border-divider bg-bg-surface px-4 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/15 disabled:opacity-60 aria-[invalid=true]:border-red-400";

export type EventDraft = {
  startAt: string; // datetime-local
  endAt: string; // datetime-local
  location: string;
  format: string; // "" | EventFormatValue
  registrationUrl: string;
  registrationDeadline: string; // datetime-local
  statusOverride: string; // "" | EventStatusOverrideValue
};

/**
 * Event-specific fields for the Posts CMS, shown only when the post's category
 * is "Event". Everything is optional — a date makes the public page treat the
 * post as an event and derive its upcoming/ongoing/ended status; the override
 * lets an admin mark it cancelled or postponed.
 */
export default function PostEventDetails({
  value,
  onChange,
  errors,
  disabled,
}: {
  value: EventDraft;
  onChange: (next: Partial<EventDraft>) => void;
  errors?: { startAt?: string | null; endAt?: string | null; registrationUrl?: string | null };
  disabled?: boolean;
}) {
  const t = useTranslations("adminPostForm.event");

  return (
    <section
      aria-label={t("title")}
      className="space-y-4 rounded-xl border border-orange-200 bg-orange-50/40 p-5 shadow-sm"
    >
      <div>
        <h2 className="flex items-center gap-2 text-sm font-bold text-text-heading">
          <span aria-hidden="true">📅</span>
          {t("title")}
        </h2>
        <p className="mt-1 text-xs text-text-muted">{t("help")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-text-body">{t("startLabel")}</span>
          <input
            type="datetime-local"
            value={value.startAt}
            onChange={(e) => onChange({ startAt: e.target.value })}
            disabled={disabled}
            aria-invalid={!!errors?.startAt}
            aria-describedby={errors?.startAt ? "event-start-error" : undefined}
            className={fieldClass}
          />
          {errors?.startAt && (
            <p id="event-start-error" className="mt-1 text-xs text-red-600">{errors.startAt}</p>
          )}
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-text-body">{t("endLabel")}</span>
          <input
            type="datetime-local"
            value={value.endAt}
            onChange={(e) => onChange({ endAt: e.target.value })}
            disabled={disabled}
            aria-invalid={!!errors?.endAt}
            aria-describedby={errors?.endAt ? "event-end-error" : undefined}
            className={fieldClass}
          />
          {errors?.endAt && (
            <p id="event-end-error" className="mt-1 text-xs text-red-600">{errors.endAt}</p>
          )}
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-text-body">{t("locationLabel")}</span>
          <input
            type="text"
            value={value.location}
            onChange={(e) => onChange({ location: e.target.value })}
            disabled={disabled}
            placeholder={t("locationPlaceholder")}
            className={fieldClass}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-text-body">{t("formatLabel")}</span>
          <select
            value={value.format}
            onChange={(e) => onChange({ format: e.target.value })}
            disabled={disabled}
            className={fieldClass}
          >
            <option value="">{t("formatNone")}</option>
            {EVENT_FORMATS.map((f) => (
              <option key={f} value={f}>{t(`format.${f}`)}</option>
            ))}
          </select>
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-xs font-semibold text-text-body">{t("registrationUrlLabel")}</span>
          <input
            type="url"
            inputMode="url"
            value={value.registrationUrl}
            onChange={(e) => onChange({ registrationUrl: e.target.value })}
            disabled={disabled}
            placeholder="https://"
            aria-invalid={!!errors?.registrationUrl}
            aria-describedby={errors?.registrationUrl ? "event-url-error" : undefined}
            className={fieldClass}
          />
          {errors?.registrationUrl && (
            <p id="event-url-error" className="mt-1 text-xs text-red-600">{errors.registrationUrl}</p>
          )}
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-text-body">{t("registrationDeadlineLabel")}</span>
          <input
            type="datetime-local"
            value={value.registrationDeadline}
            onChange={(e) => onChange({ registrationDeadline: e.target.value })}
            disabled={disabled}
            className={fieldClass}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-text-body">{t("statusOverrideLabel")}</span>
          <select
            value={value.statusOverride}
            onChange={(e) => onChange({ statusOverride: e.target.value })}
            disabled={disabled}
            className={fieldClass}
          >
            <option value="">{t("statusOverrideNone")}</option>
            {EVENT_STATUS_OVERRIDES.map((s) => (
              <option key={s} value={s}>{t(`statusOverride.${s}`)}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-text-muted">{t("timezoneNote")}</p>
    </section>
  );
}
