"use client";

// Shared form primitives for the System Settings workspace. All inputs are
// controlled; validation errors arrive as dot-paths from
// lib/system-settings/schemas.ts and render inline next to their field.

import type { FieldError } from "@/lib/system-settings/types";

export function errorFor(errors: FieldError[], path: string): string | null {
  return errors.find((e) => e.path === path)?.message ?? null;
}

export function SectionIntro({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mb-5">
      <h2 className="text-lg font-bold text-text-heading">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}

export function FieldGroup({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="rounded-2xl border border-divider bg-bg-surface p-5">
      <legend className="px-1 text-sm font-bold text-text-heading">{title}</legend>
      {hint && <p className="mb-3 -mt-1 text-xs text-slate-500">{hint}</p>}
      <div className="space-y-4">{children}</div>
    </fieldset>
  );
}

export function TextField({
  id,
  label,
  value,
  onChange,
  error,
  helper,
  usedIn,
  required = false,
  disabled = false,
  lang,
  placeholder,
  maxLength,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  helper?: string;
  /** Where this value appears on the public site — shown under the field. */
  usedIn?: string;
  required?: boolean;
  disabled?: boolean;
  lang?: "km" | "en";
  placeholder?: string;
  maxLength?: number;
  type?: "text" | "email" | "url" | "tel" | "date";
}) {
  const describedBy = [
    helper ? `${id}-helper` : null,
    error ? `${id}-error` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div>
      <label htmlFor={id} className="mb-1 flex items-baseline gap-1.5 text-[13px] font-semibold text-slate-700">
        {label}
        {required && (
          <span aria-hidden="true" className="text-rose-500">*</span>
        )}
        {maxLength != null && value.length > maxLength * 0.8 && (
          <span className="ml-auto text-[11px] font-normal tabular-nums text-slate-400">
            {value.length}/{maxLength}
          </span>
        )}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        lang={lang}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        aria-required={required || undefined}
        className={`w-full rounded-xl border px-3 py-2 text-sm text-text-heading transition-colors focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 ${
          error ? "border-rose-400 bg-rose-50/40" : "border-divider bg-bg-surface"
        } ${lang === "km" ? "font-kh leading-relaxed" : ""}`}
      />
      {helper && !error && (
        <p id={`${id}-helper`} className="mt-1 text-xs text-slate-500">
          {helper}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs font-medium text-rose-600">
          {error}
        </p>
      )}
      {usedIn && (
        <p className="mt-1 text-[11px] text-slate-400">Used in: {usedIn}</p>
      )}
    </div>
  );
}

export function TextAreaField({
  id,
  label,
  value,
  onChange,
  error,
  helper,
  required = false,
  disabled = false,
  lang,
  maxLength,
  rows = 3,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  helper?: string;
  required?: boolean;
  disabled?: boolean;
  lang?: "km" | "en";
  maxLength?: number;
  rows?: number;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 flex items-baseline gap-1.5 text-[13px] font-semibold text-slate-700">
        {label}
        {required && <span aria-hidden="true" className="text-rose-500">*</span>}
        {maxLength != null && (
          <span className="ml-auto text-[11px] font-normal tabular-nums text-slate-400">
            {value.length}/{maxLength}
          </span>
        )}
      </label>
      <textarea
        id={id}
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        lang={lang}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        aria-required={required || undefined}
        className={`w-full rounded-xl border px-3 py-2 text-sm text-text-heading transition-colors focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 ${
          error ? "border-rose-400 bg-rose-50/40" : "border-divider bg-bg-surface"
        } ${lang === "km" ? "font-kh leading-relaxed" : ""}`}
      />
      {helper && !error && <p className="mt-1 text-xs text-slate-500">{helper}</p>}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs font-medium text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}

/** Paired English + Khmer inputs, side by side on wide screens. */
export function LocalizedFields({
  idBase,
  label,
  value,
  onChange,
  errors,
  pathBase,
  required = true,
  requiredKm = true,
  disabled = false,
  maxLength,
  textarea = false,
  usedIn,
}: {
  idBase: string;
  label: string;
  value: { en: string; km: string };
  onChange: (v: { en: string; km: string }) => void;
  errors: FieldError[];
  pathBase: string;
  required?: boolean;
  requiredKm?: boolean;
  disabled?: boolean;
  maxLength?: number;
  textarea?: boolean;
  usedIn?: string;
}) {
  const Comp = textarea ? TextAreaField : TextField;
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-semibold text-slate-700">{label}</p>
      <div className="grid gap-3 md:grid-cols-2">
        <Comp
          id={`${idBase}-en`}
          label="English"
          value={value.en}
          onChange={(en) => onChange({ ...value, en })}
          error={errorFor(errors, `${pathBase}.en`)}
          required={required}
          disabled={disabled}
          maxLength={maxLength}
        />
        <Comp
          id={`${idBase}-km`}
          label="ខ្មែរ (Khmer)"
          value={value.km}
          onChange={(km) => onChange({ ...value, km })}
          error={errorFor(errors, `${pathBase}.km`)}
          required={required && requiredKm}
          disabled={disabled}
          lang="km"
          maxLength={maxLength}
        />
      </div>
      {usedIn && <p className="mt-1 text-[11px] text-slate-400">Used in: {usedIn}</p>}
    </div>
  );
}
