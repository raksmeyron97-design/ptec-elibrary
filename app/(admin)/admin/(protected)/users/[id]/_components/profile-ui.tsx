"use client";

/**
 * Presentational primitives for the user profile page.
 *
 * Every colour is a design token. The Users section had drifted into raw
 * palette classes (`bg-red-50`, `text-emerald-600`, `border-slate-300`,
 * `bg-cyan-50`) which `lib/status-tokens.test.ts` polices in callouts and which
 * carry no dark-mode variant — the admin panel forces light today, so they look
 * fine and are a trap for the first person who changes that.
 */

import { AlertTriangle, Minus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ProfileSectionState } from "@/lib/admin/user-profile-shared";

// ── Card ─────────────────────────────────────────────────────────────────────

export function Card({
  title,
  description,
  actions,
  children,
  className = "",
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-divider bg-bg-surface shadow-sm ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-divider px-5 py-4">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-semibold text-text-heading">{title}</h3>}
            {description && <p className="mt-0.5 text-xs text-text-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

// ── Definition row ───────────────────────────────────────────────────────────

/**
 * Label + value. A value the reader did not supply prints an em dash in muted
 * text WITH a screen-reader word, because a lone dash announces as nothing and
 * a blank row is indistinguishable from a broken one.
 */
export function DataRow({
  label,
  value,
  mono = false,
  hint,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  mono?: boolean;
  hint?: React.ReactNode;
}) {
  const t = useTranslations("adminUsers.profile");
  const empty = value === null || value === undefined || value === "";
  return (
    <div className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] items-baseline gap-3 py-1.5">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className={`min-w-0 text-sm ${empty ? "text-text-muted" : "text-text-body"}`}>
        {empty ? (
          <span>
            <span aria-hidden="true">—</span>
            <span className="sr-only">{t("notProvided")}</span>
          </span>
        ) : (
          <span className={`break-words ${mono ? "font-mono text-[12.5px]" : ""}`}>{value}</span>
        )}
        {hint && <span className="mt-0.5 block text-[11.5px] text-text-muted">{hint}</span>}
      </dd>
    </div>
  );
}

// ── Section state ────────────────────────────────────────────────────────────

/**
 * "We could not read this" is a different sentence from "there is nothing
 * here", and rendering the second when the first is true is how a profile
 * quietly lies about a person. Every section that can fail says which it is.
 */
export function SectionState({
  state,
  emptyMessage,
  children,
}: {
  state: ProfileSectionState;
  emptyMessage: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = useTranslations("adminUsers.profile");
  if (state === "unavailable") {
    return (
      <p className="flex items-start gap-2 rounded-xl border border-warning-line bg-warning-soft px-3 py-2.5 text-[13px] text-warning-text">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{t("sectionUnavailable")}</span>
      </p>
    );
  }
  if (state === "empty") {
    return (
      <p className="flex items-center gap-2 py-2 text-[13px] text-text-muted">
        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
        {emptyMessage}
      </p>
    );
  }
  return <>{children}</>;
}

// ── Metric tile ──────────────────────────────────────────────────────────────

/**
 * One number and what it counts. Deliberately plain: ten of these sit together,
 * and a tinted card per metric would make the grid a colour chart of nothing.
 */
export function Metric({
  label,
  value,
  href,
}: {
  label: React.ReactNode;
  value: number;
  href?: string;
}) {
  const body = (
    <>
      <span className="block text-xl font-semibold tabular-nums text-text-heading">
        {value.toLocaleString()}
      </span>
      <span className="mt-0.5 block text-[11.5px] leading-tight text-text-muted">{label}</span>
    </>
  );
  const shell = "rounded-xl border border-divider bg-paper px-3 py-2.5 text-left";
  if (!href) return <div className={shell}>{body}</div>;
  return (
    <a href={href} className={`${shell} focus-field block transition hover:border-brand hover:bg-surface-brand-soft`}>
      {body}
    </a>
  );
}

// ── Completeness meter ───────────────────────────────────────────────────────

/**
 * Progress as a bar AND as "4 of 10", because a bar alone cannot be read by
 * anyone who needs the number, and the number is what a librarian acts on.
 */
export function Meter({
  percent,
  label,
  tone = "brand",
}: {
  percent: number;
  label: string;
  tone?: "brand" | "success" | "warning";
}) {
  const fill =
    tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : "bg-brand";
  return (
    <div
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="h-1.5 w-full overflow-hidden rounded-full bg-divider"
    >
      <span className={`block h-full rounded-full ${fill}`} style={{ width: `${percent}%` }} />
    </div>
  );
}
