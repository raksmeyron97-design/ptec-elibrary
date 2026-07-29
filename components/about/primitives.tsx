// components/about/primitives.tsx
//
// The small, shared building blocks of the About page system. Every one is a
// SERVER component — none of them holds state, so none of them costs a
// hydration bundle. The three genuinely interactive pieces live in their own
// "use client" files (AboutSubNavigation, PrintPageAction, and the per-page
// explorers).
//
// Design constraints these encode, so the five pages can't drift apart again:
//
//   • ONE heading treatment (<SectionHeading>) — the four hand-rolled copies
//     that used to live in the page files are gone.
//   • Bilingual titles are STACKED, never concatenated on one line. The
//     active locale leads at full size; the other language follows as a
//     smaller secondary line with its own `lang` attribute.
//   • Colour is never the only signal. <NoticePanel> pairs every tone with an
//     icon and a visible text label.
//   • Radius/border/shadow come from the shared tokens, not per-page inline
//     gradients.

import type { ReactNode } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Ban,
  CircleHelp,
  Info,
  type LucideIcon,
} from "lucide-react";
import type { AboutLocale } from "@/lib/about/format";
import { localized } from "@/lib/about/format";
import type { LocalizedText } from "@/lib/about/types";

/* ────────────────────────────────────────────────────────────────────────────
   Bilingual text
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Renders a source string in the active locale, with the correct `lang`
 * attribute for whichever language it actually resolved to. Returns null
 * (renders nothing) when the source has neither language — the caller's
 * empty state takes over instead of an empty element.
 */
export function LanguageAwareText({
  value,
  locale,
  as: Tag = "span",
  className,
}: {
  value: LocalizedText | null | undefined;
  locale: AboutLocale;
  as?: "span" | "p" | "div" | "li" | "dd" | "dt";
  className?: string;
}) {
  const resolved = localized(value, locale);
  if (!resolved) return null;
  return (
    <Tag lang={resolved.lang} className={className}>
      {resolved.text}
    </Tag>
  );
}

/**
 * A title in both languages, STACKED — the active locale first at full size,
 * the other language beneath it, quieter and smaller.
 *
 * This is the one rule the old pages broke: they rendered
 * `Library Rules<span>បទបញ្ជាបណ្ណាល័យ</span>` on a single line, so the two
 * scripts collided with no separator and neither read as the primary title.
 */
export function BilingualTitle({
  primary,
  locale,
  level = "h2",
  className = "",
  secondaryClassName = "",
}: {
  primary: LocalizedText;
  locale: AboutLocale;
  level?: "h1" | "h2" | "h3";
  className?: string;
  secondaryClassName?: string;
}) {
  const Heading = level;
  const lead = localized(primary, locale);
  const otherLocale: AboutLocale = locale === "km" ? "en" : "km";
  const secondaryRaw = otherLocale === "km" ? primary.km : primary.en;
  const secondary = secondaryRaw?.trim() ? secondaryRaw.trim() : null;
  if (!lead) return null;

  return (
    <Heading className={className}>
      <span lang={lead.lang} className="about-wrap block">
        {lead.text}
      </span>
      {secondary && secondary !== lead.text && (
        <span
          lang={otherLocale}
          className={`about-wrap mt-1 block font-normal ${secondaryClassName}`}
        >
          {secondary}
        </span>
      )}
    </Heading>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Sections
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The single section-heading treatment for all five pages: an accent rule,
 * the heading, and an optional lead paragraph.
 *
 * `id` is required — it is what the parent <AboutSection> points
 * `aria-labelledby` at, which is how a screen-reader user gets a list of the
 * page's regions instead of five anonymous "region" landmarks.
 */
export function SectionHeading({
  id,
  title,
  description,
  level = "h2",
  action,
}: {
  id: string;
  title: string;
  description?: string | null;
  level?: "h2" | "h3";
  action?: ReactNode;
}) {
  const Heading = level;
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-3">
          <span
            className="mt-1.5 h-6 w-1 shrink-0 rounded-full bg-brand"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <Heading
              id={id}
              className={`about-wrap font-semibold tracking-tight text-text-heading ${
                level === "h2" ? "text-xl sm:text-2xl" : "text-lg"
              }`}
            >
              {title}
            </Heading>
            {description && (
              <p className="about-copy about-measure mt-2 text-sm text-text-body">
                {description}
              </p>
            )}
          </div>
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/**
 * A titled region of a page. Always a real <section> with an accessible name,
 * so the page's structure is navigable rather than a flat run of divs.
 */
export function AboutSection({
  id,
  title,
  description,
  children,
  className = "",
  headingLevel = "h2",
  action,
}: {
  id: string;
  title: string;
  description?: string | null;
  children: ReactNode;
  className?: string;
  headingLevel?: "h2" | "h3";
  action?: ReactNode;
}) {
  const headingId = `${id}-heading`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={`scroll-mt-24 ${className}`}
    >
      <SectionHeading
        id={headingId}
        title={title}
        description={description}
        level={headingLevel}
        action={action}
      />
      {children}
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Surfaces
   ──────────────────────────────────────────────────────────────────────────── */

/** The shared card surface — soft border, restrained shadow, 16px radius. */
export function InformationCard({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "li" | "article";
}) {
  return (
    <Tag
      className={`rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm sm:p-6 ${className}`}
    >
      {children}
    </Tag>
  );
}

/**
 * A single figure. The number is always plain text in the DOM — never an
 * animated count-up, which delays the real value and reads as a changing
 * string to assistive tech.
 *
 * `value` may be null: that is the honest state for a figure the library has
 * not supplied, and the card renders `fallback` instead of "0" or "NaN".
 */
export function StatCard({
  value,
  label,
  hint,
  fallback,
  emphasis = false,
  icon: Icon,
}: {
  value: string | null;
  label: string;
  hint?: string | null;
  fallback?: string;
  emphasis?: boolean;
  icon?: LucideIcon;
}) {
  const hasValue = value !== null && value !== "";
  return (
    <InformationCard
      className={`flex h-full flex-col ${emphasis ? "border-brand/25 bg-brand/[0.03]" : ""}`}
    >
      {Icon && (
        <Icon
          className={`mb-3 h-5 w-5 ${emphasis ? "text-brand" : "text-text-muted"}`}
          aria-hidden="true"
        />
      )}
      <p
        className={`about-wrap text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl ${
          hasValue ? "text-text-heading" : "text-text-muted"
        }`}
      >
        {hasValue ? value : (fallback ?? "—")}
      </p>
      <p className="about-wrap mt-1.5 text-sm font-medium text-text-body">{label}</p>
      {hint && <p className="about-wrap mt-1 text-xs text-text-muted">{hint}</p>}
    </InformationCard>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Notices
   ──────────────────────────────────────────────────────────────────────────── */

export type NoticeTone = "info" | "caution" | "prohibited" | "positive" | "neutral";

const NOTICE_STYLES: Record<
  NoticeTone,
  { icon: LucideIcon; wrapper: string; iconClass: string; labelClass: string }
> = {
  // Blue: neutral institutional information.
  info: {
    icon: Info,
    wrapper: "border-blue-200 bg-blue-50 dark:border-blue-500/30 dark:bg-blue-500/10",
    iconClass: "text-blue-700 dark:text-blue-300",
    labelClass: "text-blue-900 dark:text-blue-100",
  },
  // Amber: a policy the reader must not miss, but nothing punitive.
  caution: {
    icon: AlertTriangle,
    wrapper: "border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10",
    iconClass: "text-amber-700 dark:text-amber-300",
    labelClass: "text-amber-900 dark:text-amber-100",
  },
  // Red is reserved for prohibited/destructive conduct — never for
  // "closed today" or an ordinary late fee.
  prohibited: {
    icon: Ban,
    wrapper: "border-red-300 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10",
    iconClass: "text-red-700 dark:text-red-300",
    labelClass: "text-red-900 dark:text-red-100",
  },
  // Green is reserved for open/available states.
  positive: {
    icon: BadgeCheck,
    wrapper: "border-green-300 bg-green-50 dark:border-green-500/30 dark:bg-green-500/10",
    iconClass: "text-green-700 dark:text-green-300",
    labelClass: "text-green-900 dark:text-green-100",
  },
  neutral: {
    icon: CircleHelp,
    wrapper: "border-divider bg-paper",
    iconClass: "text-text-muted",
    labelClass: "text-text-heading",
  },
};

/**
 * A callout whose tone is carried by THREE signals at once: colour, an icon,
 * and a visible text label. WCAG 1.4.1 forbids colour alone, and a printed or
 * high-contrast rendering keeps the meaning either way.
 */
export function NoticePanel({
  tone = "info",
  label,
  children,
  className = "",
  role,
}: {
  tone?: NoticeTone;
  /** Visible category label, e.g. "Policy notice". Required — this is the
   *  non-colour signal. */
  label: string;
  children: ReactNode;
  className?: string;
  role?: "status" | "note";
}) {
  const style = NOTICE_STYLES[tone];
  const Icon = style.icon;
  return (
    <div
      role={role}
      className={`rounded-2xl border p-4 sm:p-5 ${style.wrapper} ${className}`}
    >
      <div className="flex gap-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${style.iconClass}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-semibold uppercase tracking-wide ${style.labelClass}`}>
            {label}
          </p>
          <div className="about-copy mt-1.5 text-sm text-text-body">{children}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * The state for content the library has not supplied yet. Deliberately calm
 * and specific: it says what is missing and what to do instead, rather than
 * showing a shrugging illustration or, worse, invented filler.
 */
export function EmptyContentState({
  title,
  body,
  action,
  className = "",
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={`rounded-2xl border border-dashed border-border-strong bg-paper px-6 py-10 text-center ${className}`}
    >
      <p className="about-wrap text-sm font-semibold text-text-heading">{title}</p>
      {body && (
        <p className="about-copy mx-auto mt-2 max-w-prose text-sm text-text-muted">{body}</p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Provenance
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * "Information last reviewed <date>", plus an optional policy version. Public
 * institutional information without a review date is hard to trust, and this
 * is the one place the date is formatted so it can't drift between pages.
 */
export function ContentLastUpdated({
  reviewedLabel,
  versionLabel,
  note,
  className = "",
}: {
  reviewedLabel: string | null;
  versionLabel?: string | null;
  note?: string | null;
  className?: string;
}) {
  if (!reviewedLabel && !versionLabel) return null;
  return (
    <div className={`text-xs text-text-muted ${className}`}>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {reviewedLabel && <span>{reviewedLabel}</span>}
        {versionLabel && (
          <span className="inline-flex items-center rounded-full border border-divider px-2 py-0.5 font-medium">
            {versionLabel}
          </span>
        )}
      </p>
      {note && <p className="about-copy mt-1.5 max-w-prose">{note}</p>}
    </div>
  );
}
