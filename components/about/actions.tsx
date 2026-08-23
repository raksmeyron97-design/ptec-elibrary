// components/about/actions.tsx
//
// The action treatments the About pages share: internal links, external/`tel:`
// links, and the official-contact card.
//
// Two rules these enforce:
//
//   1. NO DEAD CONTROLS. Every component here requires a real destination.
//      A missing href renders nothing at all rather than a disabled-looking
//      button — the brief's "no dead buttons or fake links" is a hard
//      constraint, and an unusable control is worse than an absent one.
//   2. Locale-aware vs plain links are NOT interchangeable. `AboutLinkAction`
//      takes an internal, locale-agnostic path and routes it through
//      @/i18n/navigation so it picks up /km. `AboutExternalAction` takes an
//      absolute URL, `tel:` or `mailto:` and uses a plain <a> — running one of
//      those through the localized Link would produce "/km/tel:012...".

import type { ReactNode } from "react";
import { ExternalLink, Mail, MapPin, Phone, type LucideIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";

type Variant = "primary" | "secondary" | "onDark";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand text-brand-contrast hover:bg-brand-hover",
  secondary:
    "border border-divider bg-bg-surface text-text-body shadow-sm hover:border-brand/40 hover:text-brand",
  onDark:
    "border border-white/25 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 [--focus-color:#fff]",
};

// min-h-11 = the 44px minimum touch target (WCAG 2.5.8), applied to every
// action regardless of how short its label renders in either language.
const BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors";

/** An internal link. `href` is locale-agnostic ("/theses"), never "/km/...". */
export function AboutLinkAction({
  href,
  icon: Icon,
  children,
  variant = "secondary",
  className = "",
}: {
  href: string | null | undefined;
  icon?: LucideIcon;
  children: ReactNode;
  variant?: Variant;
  className?: string;
}) {
  if (!href) return null;
  return (
    <Link href={href} className={`${BASE} ${VARIANTS[variant]} ${className}`}>
      {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
      {children}
    </Link>
  );
}

/**
 * An absolute URL, `tel:` or `mailto:` link.
 *
 * `newTab` adds the security rel AND a visually-hidden "opens in a new tab"
 * note, because a link that silently steals the tab is a WCAG 3.2.5 failure.
 */
export function AboutExternalAction({
  href,
  icon: Icon,
  children,
  variant = "secondary",
  newTab = false,
  newTabLabel,
  className = "",
}: {
  href: string | null | undefined;
  icon?: LucideIcon;
  children: ReactNode;
  variant?: Variant;
  newTab?: boolean;
  newTabLabel?: string;
  className?: string;
}) {
  if (!href || !href.trim()) return null;
  return (
    <a
      href={href}
      {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={`${BASE} ${VARIANTS[variant]} ${className}`}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
      {children}
      {newTab && (
        <>
          <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
          {newTabLabel && <span className="sr-only">{newTabLabel}</span>}
        </>
      )}
    </a>
  );
}

/**
 * The library's OFFICIAL contact channels — desk phone, institutional email,
 * address, hours.
 *
 * This component exists specifically so the Team page can offer a way to
 * reach staff WITHOUT publishing anyone's personal phone number or Gmail
 * address. Every value it renders comes from published system settings, i.e.
 * from a channel the institution has chosen to make public.
 */
export function OfficialContactCard({
  heading,
  body,
  privacyNote,
  deskLabel,
  desk,
  deskHref,
  emailLabel,
  email,
  hoursLabel,
  hours,
  addressLabel,
  address,
  actions,
}: {
  heading: string;
  body?: string;
  privacyNote?: string;
  deskLabel: string;
  desk?: string | null;
  deskHref?: string | null;
  emailLabel: string;
  email?: string | null;
  hoursLabel: string;
  hours?: string | null;
  addressLabel?: string;
  address?: string | null;
  actions?: ReactNode;
}) {
  const rows: { label: string; value: string; href?: string | null; icon: LucideIcon }[] = [];
  if (desk) rows.push({ label: deskLabel, value: desk, href: deskHref, icon: Phone });
  // An email is only linkable when it is actually an address. The source form
  // supplied "Info.ptec.edu.kh", which has no "@" — see
  // docs/about-pages-content-validation.md §5. Rendering it as a mailto: would
  // produce a link that silently fails in the reader's mail client.
  if (email) {
    rows.push({
      label: emailLabel,
      value: email,
      href: email.includes("@") ? `mailto:${email}` : null,
      icon: Mail,
    });
  }
  if (address && addressLabel) rows.push({ label: addressLabel, value: address, icon: MapPin });

  return (
    <section
      aria-labelledby="about-official-contact"
      className="overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm"
    >
      <div className="border-b border-divider bg-paper px-5 py-4 sm:px-6">
        <h2 id="about-official-contact" className="text-lg font-semibold text-text-heading">
          {heading}
        </h2>
        {body && <p className="about-copy mt-1.5 max-w-2xl text-sm text-text-body">{body}</p>}
      </div>

      <div className="px-5 py-5 sm:px-6">
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {/* A <dl> may contain exactly ONE level of <div> grouping before its
              <dt>/<dd> pairs. This used to nest a second <div> to stack the
              text beside the icon, which put dt/dd out of the list entirely —
              axe reported definition-list + dlitem and it cost the /about/team
              listing its Lighthouse a11y score. Grid does the same layout with
              dt/dd as direct children of the one allowed wrapper. */}
          {rows.map((row) => (
            <div
              key={row.label}
              className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3"
            >
              <row.icon
                className="row-span-2 mt-0.5 h-4 w-4 shrink-0 text-text-muted"
                aria-hidden="true"
              />
              <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">
                {row.label}
              </dt>
              <dd className="about-wrap col-start-2 mt-0.5 text-sm text-text-heading">
                {row.href ? (
                  <a href={row.href} className="rounded font-medium text-brand hover:underline">
                    {row.value}
                  </a>
                ) : (
                  row.value
                )}
              </dd>
            </div>
          ))}
          {hours && (
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 sm:col-span-2">
              {/* Invisible icon purely to align this row's text with the rows
                  above it; aria-hidden keeps it out of the accessibility tree. */}
              <Phone className="row-span-2 mt-0.5 h-4 w-4 shrink-0 opacity-0" aria-hidden="true" />
              <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">
                {hoursLabel}
              </dt>
              <dd className="about-wrap about-copy col-start-2 mt-0.5 text-sm text-text-heading">
                {hours}
              </dd>
            </div>
          )}
        </dl>

        {actions && <div className="mt-6 flex flex-wrap gap-3">{actions}</div>}

        {privacyNote && (
          <p className="about-copy mt-5 border-t border-divider pt-4 text-xs text-text-muted">
            {privacyNote}
          </p>
        )}
      </div>
    </section>
  );
}
