"use client";

import { useTranslations } from "next-intl";
import type { AnnouncementInput, FieldErrors } from "@/lib/admin/announcements/validation";

const inputClass =
  "h-10 w-full rounded-lg border border-divider bg-bg-surface px-3 text-sm text-text-body focus:outline-none focus:ring-2 focus:ring-brand/30";
const labelClass = "mb-1.5 block text-xs font-semibold text-text-muted";

/** Convert an ISO string to the value a <input type="datetime-local"> expects,
 *  in the browser's local time (which, for PTEC admins, is Asia/Phnom_Penh). */
function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function StepSchedule({
  value,
  onChange,
  errors,
}: {
  value: AnnouncementInput;
  onChange: (patch: Partial<AnnouncementInput>) => void;
  errors: FieldErrors;
}) {
  const t = useTranslations("adminAnnouncements.composer.schedule");
  const schedule = value.schedule;

  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-bold text-text-heading">{t("legend")}</legend>
        {(["now", "schedule"] as const).map((mode) => (
          <label key={mode} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${schedule.mode === mode ? "border-brand/40 bg-brand/5" : "border-divider bg-bg-surface"}`}>
            <input type="radio" name="publish-mode" checked={schedule.mode === mode} onChange={() => onChange({ schedule: { ...schedule, mode } })} className="mt-0.5 h-4 w-4 text-brand focus:ring-focus-ring/30" />
            <span>
              <span className="block text-sm font-semibold text-text-heading">{t(`mode.${mode}`)}</span>
              <span className="block text-xs text-text-muted">{t(`modeDescription.${mode}`)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {schedule.mode === "schedule" && (
        <div>
          <label className={labelClass} htmlFor="ann-scheduled-at">
            {t("scheduledAt")} <span className="text-danger">*</span> <span className="font-normal text-text-muted">({t("timezone")})</span>
          </label>
          <input
            id="ann-scheduled-at"
            type="datetime-local"
            value={toLocalInputValue(schedule.scheduledAt)}
            onChange={(e) => onChange({ schedule: { ...schedule, scheduledAt: e.target.value ? new Date(e.target.value).toISOString() : null } })}
            className={inputClass}
          />
          {errors["schedule.scheduledAt"] && <p className="mt-1 text-xs font-medium text-danger" role="alert">{errors["schedule.scheduledAt"]}</p>}
        </div>
      )}

      <div>
        <label className={labelClass} htmlFor="ann-expires-at">
          {t("expiresAt")} <span className="font-normal text-text-muted">({t("optional")}, {t("timezone")})</span>
        </label>
        <input
          id="ann-expires-at"
          type="datetime-local"
          value={toLocalInputValue(schedule.expiresAt)}
          onChange={(e) => onChange({ schedule: { ...schedule, expiresAt: e.target.value ? new Date(e.target.value).toISOString() : null } })}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-text-muted">{t("expiresAtHelp")}</p>
        {errors["schedule.expiresAt"] && <p className="mt-1 text-xs font-medium text-danger" role="alert">{errors["schedule.expiresAt"]}</p>}
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-bold text-text-heading">{t("displayLegend")}</legend>
        <label className="flex items-center gap-2.5 text-sm text-text-body">
          <input type="checkbox" checked={value.pinned} onChange={(e) => onChange({ pinned: e.target.checked })} className="h-4 w-4 rounded border-divider text-brand focus:ring-focus-ring/30" />
          {t("pinned")}
        </label>
        <p className="ml-6 text-xs text-text-muted">{t("pinnedHelp")}</p>

        <label className="flex items-center gap-2.5 text-sm text-text-body">
          <input type="checkbox" checked={value.dismissible} onChange={(e) => onChange({ dismissible: e.target.checked })} className="h-4 w-4 rounded border-divider text-brand focus:ring-focus-ring/30" />
          {t("dismissible")}
        </label>
        <p className="ml-6 text-xs text-text-muted">{t("dismissibleHelp")}</p>
      </fieldset>
    </div>
  );
}
