"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  GENDER_OPTIONS,
  INSTITUTION_TYPE_OPTIONS,
  PROFESSIONAL_ROLE_OPTIONS,
  DOWNLOAD_PURPOSE_OPTIONS,
  computeDownloadProfileStatus,
  type DownloadProfileRow,
  type DownloadProfileField,
} from "@/lib/profile/download-profile-shared";
import { updateDownloadProfile } from "@/app/actions/profile";
import { safeReturnTo } from "@/lib/security/return-to";

type Props = {
  email: string;
  initial: Partial<DownloadProfileRow>;
  /** Validated internal path to return to after completing the profile. */
  returnTo?: string | null;
};

const inputBase =
  "w-full h-11 px-3.5 rounded-xl bg-bg-surface border border-divider text-text-body placeholder:text-text-muted focus:border-brand focus:ring-2 focus:ring-brand focus:outline-none transition";
const labelBase = "block text-sm font-semibold text-text-body mb-1.5";

export default function DownloadProfileForm({ email, initial, returnTo }: Props) {
  const t = useTranslations("downloadProfile");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Controlled where interactivity is needed; the rest are uncontrolled with
  // defaultValue (server validates + re-computes completeness on save anyway).
  const [purpose, setPurpose] = useState(initial.download_purpose ?? "");
  const [responsible, setResponsible] = useState(!!initial.responsible_use_accepted_at);
  const [privacy, setPrivacy] = useState(!!initial.download_privacy_consent_at);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [status, setStatus] = useState(() => computeDownloadProfileStatus(initial));

  // Deep-linked from a thesis download prompt → move focus to the section.
  useEffect(() => {
    if (returnTo) headingRef.current?.focus();
  }, [returnTo]);

  // Unsaved-change protection.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const fieldLabels = useMemo<Record<DownloadProfileField, string>>(
    () => ({
      full_name: t("fields.full_name"),
      gender: t("fields.gender"),
      phone: t("fields.phone"),
      institution_name: t("fields.institution_name"),
      institution_type: t("fields.institution_type"),
      faculty_department: t("fields.faculty_department"),
      professional_role: t("fields.professional_role"),
      country: t("fields.country"),
      download_purpose: t("fields.download_purpose"),
      download_purpose_other: t("fields.download_purpose_other"),
      responsible_use_accepted_at: t("consent.responsibleShort"),
      download_privacy_consent_at: t("consent.privacyShort"),
    }),
    [t],
  );

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMsg(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateDownloadProfile(formData);
      if (res?.error) {
        setMsg({ type: "error", text: res.error });
        return;
      }
      setDirty(false);
      const nowComplete = !!res?.complete;
      setStatus((s) => ({
        ...s,
        complete: nowComplete,
        missingFields: (res?.missingFields ?? []) as DownloadProfileField[],
        percent: nowComplete
          ? 100
          : s.percent,
      }));
      setMsg({ type: "success", text: t("saved") });
      // If the reader came from a thesis download prompt and is now complete,
      // send them back to finish the download.
      if (nowComplete && returnTo) {
        const dest = safeReturnTo(returnTo);
        router.push(dest);
        router.refresh();
      }
    });
  };

  const markDirty = () => setDirty(true);

  return (
    <div className="bg-bg-surface border border-divider rounded-2xl shadow-sm overflow-hidden">
      <div className="px-6 sm:px-8 pt-6 sm:pt-8 pb-5">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-bold text-text-heading outline-none"
        >
          {t("title")}
        </h2>
        <p className="text-sm text-text-muted mt-1">{t("intro")}</p>

        {/* Completion indicator */}
        <div
          className="mt-4 rounded-xl border border-divider bg-paper p-3.5"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-text-body">
              {status.complete ? t("statusComplete") : t("statusIncomplete")}
            </span>
            <span
              className={`text-xs font-bold ${status.complete ? "text-emerald-600" : "text-amber-600"}`}
            >
              {status.percent}%
            </span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-divider overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${status.complete ? "bg-emerald-500" : "bg-amber-500"}`}
              style={{ width: `${status.percent}%` }}
            />
          </div>
          {!status.complete && status.missingFields.length > 0 && (
            <p className="mt-2 text-xs text-text-muted">
              {t("missingPrefix")}{" "}
              {status.missingFields
                .filter((f) => f !== "download_purpose_other")
                .map((f) => fieldLabels[f])
                .join(", ")}
            </p>
          )}
          {status.updatedAt && (
            <p className="mt-1 text-xs text-text-muted">
              {t("lastUpdated", { date: new Date(status.updatedAt).toLocaleDateString() })}
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-divider" />

      <form ref={formRef} onSubmit={onSubmit} onChange={markDirty} className="px-6 sm:px-8 py-6 sm:py-8 space-y-8">
        {/* ── Personal ── */}
        <fieldset className="space-y-5">
          <legend className="text-sm font-bold uppercase tracking-wide text-text-heading">
            {t("sections.personal")}
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="sm:col-span-2">
              <label htmlFor="dp_full_name" className={labelBase}>
                {t("fields.full_name")} <span className="text-red-500">*</span>
              </label>
              <input
                id="dp_full_name"
                name="full_name"
                type="text"
                required
                autoComplete="name"
                defaultValue={initial.full_name ?? ""}
                className={inputBase}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="dp_email" className={labelBase}>
                {t("fields.email")}
              </label>
              <input
                id="dp_email"
                type="email"
                value={email}
                disabled
                autoComplete="email"
                className="w-full h-11 px-3.5 rounded-xl bg-paper border border-divider text-text-muted cursor-not-allowed"
              />
              <p className="text-xs text-text-muted mt-1.5">{t("fields.emailVerifiedHelp")}</p>
            </div>
            <div>
              <label htmlFor="dp_gender" className={labelBase}>
                {t("fields.gender")} <span className="text-red-500">*</span>
              </label>
              <select id="dp_gender" name="gender" required defaultValue={initial.gender ?? ""} className={inputBase}>
                <option value="" disabled>
                  {t("select")}
                </option>
                {GENDER_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {t(`gender.${v}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="dp_phone" className={labelBase}>
                {t("fields.phone")} <span className="text-red-500">*</span>
              </label>
              <input
                id="dp_phone"
                name="phone"
                type="tel"
                required
                inputMode="tel"
                autoComplete="tel"
                pattern="[0-9+()\-\s]{6,40}"
                defaultValue={initial.phone ?? ""}
                placeholder="+855 ..."
                className={inputBase}
              />
            </div>
          </div>
        </fieldset>

        {/* ── Institution ── */}
        <fieldset className="space-y-5">
          <legend className="text-sm font-bold uppercase tracking-wide text-text-heading">
            {t("sections.institution")}
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="sm:col-span-2">
              <label htmlFor="dp_institution_name" className={labelBase}>
                {t("fields.institution_name")} <span className="text-red-500">*</span>
              </label>
              <input
                id="dp_institution_name"
                name="institution_name"
                type="text"
                required
                autoComplete="organization"
                defaultValue={initial.institution_name ?? ""}
                className={inputBase}
              />
            </div>
            <div>
              <label htmlFor="dp_institution_type" className={labelBase}>
                {t("fields.institution_type")} <span className="text-red-500">*</span>
              </label>
              <select
                id="dp_institution_type"
                name="institution_type"
                required
                defaultValue={initial.institution_type ?? ""}
                className={inputBase}
              >
                <option value="" disabled>
                  {t("select")}
                </option>
                {INSTITUTION_TYPE_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {t(`institutionType.${v}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="dp_professional_role" className={labelBase}>
                {t("fields.professional_role")} <span className="text-red-500">*</span>
              </label>
              <select
                id="dp_professional_role"
                name="professional_role"
                required
                defaultValue={initial.professional_role ?? ""}
                className={inputBase}
              >
                <option value="" disabled>
                  {t("select")}
                </option>
                {PROFESSIONAL_ROLE_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {t(`role.${v}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="dp_faculty_department" className={labelBase}>
                {t("fields.faculty_department")} <span className="text-red-500">*</span>
              </label>
              <input
                id="dp_faculty_department"
                name="faculty_department"
                type="text"
                required
                defaultValue={initial.faculty_department ?? ""}
                className={inputBase}
              />
            </div>
            <div>
              <label htmlFor="dp_country" className={labelBase}>
                {t("fields.country")} <span className="text-red-500">*</span>
              </label>
              <input
                id="dp_country"
                name="country"
                type="text"
                required
                autoComplete="country-name"
                defaultValue={initial.country ?? ""}
                className={inputBase}
              />
            </div>
            <div>
              <label htmlFor="dp_province_city" className={labelBase}>
                {t("fields.province_city")}{" "}
                <span className="text-text-muted font-normal">({t("optional")})</span>
              </label>
              <input
                id="dp_province_city"
                name="province_city"
                type="text"
                defaultValue={initial.province_city ?? ""}
                className={inputBase}
              />
            </div>
            <div>
              <label htmlFor="dp_student_staff_id" className={labelBase}>
                {t("fields.student_staff_id")}{" "}
                <span className="text-text-muted font-normal">({t("optional")})</span>
              </label>
              <input
                id="dp_student_staff_id"
                name="student_staff_id"
                type="text"
                defaultValue={initial.student_staff_id ?? ""}
                className={inputBase}
              />
            </div>
          </div>
        </fieldset>

        {/* ── Usage & consent ── */}
        <fieldset className="space-y-5">
          <legend className="text-sm font-bold uppercase tracking-wide text-text-heading">
            {t("sections.usage")}
          </legend>
          <div>
            <label htmlFor="dp_download_purpose" className={labelBase}>
              {t("fields.download_purpose")} <span className="text-red-500">*</span>
            </label>
            <select
              id="dp_download_purpose"
              name="download_purpose"
              required
              value={purpose}
              onChange={(e) => {
                setPurpose(e.target.value);
                markDirty();
              }}
              className={inputBase}
            >
              <option value="" disabled>
                {t("select")}
              </option>
              {DOWNLOAD_PURPOSE_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {t(`purpose.${v}`)}
                </option>
              ))}
            </select>
          </div>
          {purpose === "other" && (
            <div>
              <label htmlFor="dp_download_purpose_other" className={labelBase}>
                {t("fields.download_purpose_other")} <span className="text-red-500">*</span>
              </label>
              <input
                id="dp_download_purpose_other"
                name="download_purpose_other"
                type="text"
                required
                defaultValue={initial.download_purpose_other ?? ""}
                className={inputBase}
              />
            </div>
          )}

          <div className="rounded-xl border border-divider bg-paper p-4 space-y-3">
            <label className="flex items-start gap-3 text-sm text-text-body cursor-pointer">
              <input
                type="checkbox"
                name="responsible_use"
                checked={responsible}
                onChange={(e) => {
                  setResponsible(e.target.checked);
                  markDirty();
                }}
                className="mt-0.5 h-4 w-4 rounded border-divider text-brand focus:ring-brand"
                required
              />
              <span>{t("consent.responsible")}</span>
            </label>
            <label className="flex items-start gap-3 text-sm text-text-body cursor-pointer">
              <input
                type="checkbox"
                name="download_privacy"
                checked={privacy}
                onChange={(e) => {
                  setPrivacy(e.target.checked);
                  markDirty();
                }}
                className="mt-0.5 h-4 w-4 rounded border-divider text-brand focus:ring-brand"
                required
              />
              <span>{t("consent.privacy")}</span>
            </label>
            <p className="text-xs text-text-muted">{t("privacyNote")}</p>
          </div>
        </fieldset>
      </form>

      <div className="border-t border-divider bg-paper px-6 sm:px-8 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div aria-live="polite" className="min-h-[1.25rem]">
          {msg && (
            <p
              role="status"
              className={`text-sm font-medium ${msg.type === "success" ? "text-emerald-700" : "text-red-600"}`}
            >
              {msg.text}
            </p>
          )}
        </div>
        <button
          type="submit"
          onClick={() => formRef.current?.requestSubmit()}
          disabled={pending}
          className="h-11 px-6 rounded-xl bg-brand text-brand-contrast font-semibold hover:bg-brand-hover transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
        >
          {pending ? t("saving") : t("save")}
        </button>
      </div>
    </div>
  );
}
