"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Upload, X, Loader2 } from "lucide-react";
import { uploadToZima } from "@/app/actions/upload";
import { LIMITS, ANNOUNCEMENT_TYPES, PRIORITIES } from "@/lib/admin/announcements/shared";
import type { AnnouncementInput } from "@/lib/admin/announcements/validation";
import type { FieldErrors } from "@/lib/admin/announcements/validation";

const inputClass =
  "h-10 w-full rounded-lg border border-divider bg-bg-surface px-3 text-sm text-text-body placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand/30";
const textareaClass =
  "w-full rounded-lg border border-divider bg-bg-surface px-3 py-2 text-sm text-text-body placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand/30 resize-y";
const labelClass = "mb-1.5 block text-xs font-semibold text-text-muted";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs font-medium text-danger" role="alert">{message}</p>;
}

function Counter({ value, max }: { value: number; max: number }) {
  const over = value > max;
  return <span className={`ml-auto text-[11px] tabular-nums ${over ? "text-danger" : "text-text-muted"}`}>{value}/{max}</span>;
}

export default function StepContent({
  value,
  onChange,
  errors,
}: {
  value: AnnouncementInput;
  onChange: (patch: Partial<AnnouncementInput>) => void;
  errors: FieldErrors;
}) {
  const t = useTranslations("adminAnnouncements.composer.content");
  const tType = useTranslations("adminAnnouncements.type");
  const [locale, setLocale] = useState<"en" | "km">("en");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function patchContent(loc: "en" | "km", fields: Partial<AnnouncementInput["content"]["en"]>) {
    onChange({ content: { ...value.content, [loc]: { ...value.content[loc], ...fields } } });
  }

  async function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)) {
      setUploadError(t("imageBadType"));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError(t("imageTooLarge"));
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await uploadToZima(fd, "announcements");
      if ("error" in res) setUploadError(res.error);
      else onChange({ imageUrl: res.publicUrl });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const km = value.content.km;
  const isKmComplete = !!km.title.trim();

  return (
    <div className="space-y-6">
      <fieldset className="space-y-4">
        <legend className="text-sm font-bold text-text-heading">{t("basicsLegend")}</legend>

        <div>
          <label className={labelClass} htmlFor="ann-internal-name">
            {t("internalName")} <span className="text-danger">*</span>
          </label>
          <input
            id="ann-internal-name"
            value={value.internalName}
            onChange={(e) => onChange({ internalName: e.target.value })}
            placeholder={t("internalNamePlaceholder")}
            maxLength={LIMITS.internalName}
            className={inputClass}
            aria-describedby="ann-internal-name-help"
            aria-invalid={!!errors.internalName}
          />
          <p id="ann-internal-name-help" className="mt-1 text-xs text-text-muted">{t("internalNameHelp")}</p>
          <FieldError message={errors.internalName} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="ann-type">{t("type")}</label>
            <select id="ann-type" value={value.type} onChange={(e) => onChange({ type: e.target.value as AnnouncementInput["type"] })} className={inputClass}>
              {ANNOUNCEMENT_TYPES.map((ty) => <option key={ty} value={ty}>{tType(ty)}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="ann-priority">{t("priority")}</label>
            <select id="ann-priority" value={value.priority} onChange={(e) => onChange({ priority: e.target.value as AnnouncementInput["priority"] })} className={inputClass}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{t(`priorityOption.${p}`)}</option>)}
            </select>
            <p className="mt-1 text-xs text-text-muted">{t(`priorityHelp.${value.priority}`)}</p>
          </div>
        </div>

        <div>
          <span className={labelClass}>{t("image")}</span>
          {value.imageUrl ? (
            <div className="relative w-48 overflow-hidden rounded-lg border border-divider">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={value.imageUrl} alt="" className="aspect-video w-full object-cover" />
              <button type="button" onClick={() => onChange({ imageUrl: null })} aria-label={t("removeImage")} className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={handleImagePick} className="hidden" id="ann-image-input" disabled={uploading} />
              <label htmlFor="ann-image-input" className="flex w-48 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-divider bg-paper py-6 text-xs font-semibold text-text-muted transition hover:border-brand hover:text-brand">
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                {uploading ? t("uploading") : t("chooseImage")}
              </label>
            </>
          )}
          {uploadError && <p className="mt-1 text-xs text-danger">{uploadError}</p>}
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-xl border border-divider p-4">
        <legend className="px-1 text-sm font-bold text-text-heading">{t("bilingualLegend")}</legend>

        <div role="tablist" aria-label={t("languageTabs")} className="inline-flex rounded-lg border border-divider bg-paper p-0.5">
          <button type="button" role="tab" aria-selected={locale === "en"} onClick={() => setLocale("en")} className={`rounded-md px-4 py-1.5 text-[13px] font-semibold transition ${locale === "en" ? "bg-brand text-white" : "text-text-muted"}`}>
            {t("english")} <span className="ml-1 text-emerald-500">●</span>
          </button>
          <button type="button" role="tab" aria-selected={locale === "km"} onClick={() => setLocale("km")} className={`rounded-md px-4 py-1.5 text-[13px] font-semibold transition ${locale === "km" ? "bg-brand text-white" : "text-text-muted"}`}>
            {t("khmer")} <span className={`ml-1 ${isKmComplete ? "text-emerald-500" : "text-text-muted"}`}>{isKmComplete ? "●" : "○"}</span>
          </button>
        </div>

        {locale === "en" ? (
          <LocaleFields locale="en" content={value.content.en} onChangeField={(f) => patchContent("en", f)} errors={errors} required t={t} />
        ) : (
          <LocaleFields locale="km" content={km} onChangeField={(f) => patchContent("km", f)} errors={errors} required={false} t={t} font="font-khmer" />
        )}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-bold text-text-heading">{t("ctaLegend")}</legend>
        <div>
          <label className={labelClass} htmlFor="ann-cta-url">{t("ctaUrl")}</label>
          <input
            id="ann-cta-url"
            value={value.ctaUrl ?? ""}
            onChange={(e) => onChange({ ctaUrl: e.target.value })}
            placeholder={t("ctaUrlPlaceholder")}
            className={inputClass}
            aria-invalid={!!errors.ctaUrl}
          />
          <p className="mt-1 text-xs text-text-muted">{t("ctaUrlHelp")}</p>
          <FieldError message={errors.ctaUrl} />
        </div>
      </fieldset>
    </div>
  );
}

function LocaleFields({
  locale,
  content,
  onChangeField,
  errors,
  required,
  t,
  font,
}: {
  locale: "en" | "km";
  content: AnnouncementInput["content"]["en"];
  onChangeField: (f: Partial<AnnouncementInput["content"]["en"]>) => void;
  errors: FieldErrors;
  required: boolean;
  t: ReturnType<typeof useTranslations>;
  font?: string;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass} htmlFor={`ann-title-${locale}`}>
          {t("titleField")} {required && <span className="text-danger">*</span>}
        </label>
        <div className="flex items-center gap-2">
          <input
            id={`ann-title-${locale}`}
            value={content.title}
            onChange={(e) => onChangeField({ title: e.target.value })}
            maxLength={LIMITS.title}
            className={`${inputClass} ${font ?? ""}`}
            aria-invalid={!!errors[`content.${locale}.title`]}
          />
        </div>
        <div className="mt-0.5 flex"><Counter value={content.title.length} max={LIMITS.title} /></div>
        <FieldError message={errors[`content.${locale}.title`]} />
      </div>

      <div>
        <label className={labelClass} htmlFor={`ann-summary-${locale}`}>{t("summaryField")}</label>
        <textarea id={`ann-summary-${locale}`} value={content.summary} onChange={(e) => onChangeField({ summary: e.target.value })} maxLength={LIMITS.summary} rows={2} className={`${textareaClass} ${font ?? ""}`} />
        <div className="mt-0.5 flex"><Counter value={content.summary.length} max={LIMITS.summary} /></div>
      </div>

      <div>
        <label className={labelClass} htmlFor={`ann-body-${locale}`}>{t("bodyField")}</label>
        <textarea id={`ann-body-${locale}`} value={content.body} onChange={(e) => onChangeField({ body: e.target.value })} maxLength={LIMITS.body} rows={5} className={`${textareaClass} ${font ?? ""}`} />
      </div>

      <div>
        <label className={labelClass} htmlFor={`ann-cta-label-${locale}`}>{t("ctaLabelField")}</label>
        <input id={`ann-cta-label-${locale}`} value={content.ctaLabel} onChange={(e) => onChangeField({ ctaLabel: e.target.value })} maxLength={LIMITS.ctaLabel} className={`${inputClass} ${font ?? ""}`} />
      </div>
    </div>
  );
}
