"use client";

// components/about/TeamMemberDialog.tsx
//
// The member panel behind /about/team's cards: a real modal dialog, rendered
// entirely from props the page already fetched. No request is made when it
// opens — the whole roster is a handful of rows and it is already in memory,
// so a round trip here would buy nothing and cost a spinner.
//
// ── It is not glass ──
// The filter bar is the only translucent surface on this page. This panel
// carries a portrait, a biography and a phone number, and content behind a
// blur is the one thing the glass rules forbid (docs/MOBILE-GLASS-UI.md).
//
// ── It is portalled ──
// To <body>, for the reason GlassSheet is: `backdrop-filter` makes an element
// the containing block for every `position: fixed` descendant, and the sticky
// filter bar is a glass surface on the same page. Portalling makes it
// impossible for that to ever matter, instead of relying on the DOM order
// staying the way it is today.
//
// ── Privacy ──
// Unchanged from the directory it replaces, and it is not this component's
// decision: `phone` and `email` arrive already nulled unless an admin ticked
// the per-member public-display toggle, because the page reads the
// `team_members_public` view (migration 0070). The rule here is only "render
// a contact row when the field is non-null", with the library's official desk
// as the route to everyone else.

import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  Briefcase,
  Clock,
  GraduationCap,
  Languages,
  Mail,
  Phone,
  X,
  type LucideIcon,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import { photoAltText, type PublicTeamMember } from "@/lib/team/public";
import { committeeInitials } from "@/lib/committee/public";
import {
  memberDepartment,
  memberNames,
  memberPosition,
  memberSummary,
} from "@/lib/team/directory";
import type { AboutLocale } from "@/lib/about/format";

/** The library's official desk, from published system settings — the contact
 *  route for every member who has published none of their own. */
export type TeamDeskInfo = {
  phone: string | null;
  tel: string | null;
  hours: string | null;
};

function responsibilityList(member: PublicTeamMember, locale: AboutLocale) {
  if (locale === "km" && member.responsibilities_km.length > 0)
    return { items: member.responsibilities_km, lang: "km" as const };
  if (member.responsibilities_en.length > 0)
    return { items: member.responsibilities_en, lang: "en" as const };
  return { items: member.responsibilities_km, lang: "km" as const };
}

export default function TeamMemberDialog({
  member,
  locale,
  desk,
  accent,
  onClose,
}: {
  member: PublicTeamMember;
  locale: AboutLocale;
  desk: TeamDeskInfo;
  /** 1…4 — the department's hue, the same one its card wears. */
  accent: number;
  onClose: () => void;
}) {
  const t = useTranslations("about.team");
  const titleId = useId();
  // Focus moves in on open and returns to whatever had it — the card the
  // reader activated, because the card focuses itself before opening this.
  const trapRef = useFocusTrap<HTMLDivElement>(true, { initialFocus: "[data-close-button]" });

  const name = memberNames(member, locale);
  const role = memberPosition(member, locale);
  const department = memberDepartment(member, locale);
  const summary = memberSummary(member, locale, 260);
  const bio = locale === "km" ? member.bio_km || member.bio_en : member.bio_en || member.bio_km;
  const bioLang: AboutLocale = bio && bio === member.bio_km ? "km" : "en";
  const responsibilities = responsibilityList(member, locale);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // The page behind a modal must not scroll under the reader's thumb.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  if (typeof document === "undefined") return null;

  const facts: { icon: LucideIcon; label: string; value: string }[] = [];
  if (member.education)
    facts.push({ icon: GraduationCap, label: t("profile.education"), value: member.education });
  if (member.years_experience)
    facts.push({ icon: Briefcase, label: t("profile.experience"), value: member.years_experience });
  if (member.languages.length > 0)
    facts.push({
      icon: Languages,
      label: t("profile.languages"),
      value: member.languages.join(", "),
    });
  if (member.working_hours)
    facts.push({ icon: Clock, label: t("profile.workingHours"), value: member.working_hours });

  const hasContact = Boolean(member.email || member.phone);

  return createPortal(
    // z-[110]: the site header stacks at z-[100].
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-blue-950/60 p-0 sm:items-center sm:p-4">
      {/* The backdrop is its own element rather than a click handler on the
          wrapper: a click that STARTED inside the panel and ended on the
          scrim — a drag across selected text — must not close the dialog.
          Same shape as GlassSheet's scrim, which is not focusable either. */}
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0" />
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`team-dialog team-accent--${accent} outline-none`}
      >
        {/* Literal navy on purpose: this band stays dark in both themes, the
            same rule the hero and the roster bands follow. */}
        <div className="flex shrink-0 items-start justify-between gap-4 bg-blue-900 px-5 py-4">
          <div className="min-w-0">
            {department && (
              <p className="about-wrap text-[11px] font-semibold uppercase tracking-[0.1em] text-white/75">
                {department}
              </p>
            )}
            <h2 id={titleId} className="about-wrap mt-1 min-w-0 text-lg font-bold text-white">
              <span lang={name.primaryLang} className="block">
                {name.primary}
              </span>
              {name.secondary && (
                <span
                  lang={name.secondaryLang}
                  className="mt-0.5 block text-sm font-normal text-white/70"
                >
                  {name.secondary}
                </span>
              )}
            </h2>
          </div>
          <button
            type="button"
            data-close-button
            onClick={onClose}
            aria-label={t("directory.close")}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/40 text-white transition-colors hover:bg-white/10 [--focus-color:#fff]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
          <div className="flex gap-4">
            <div className="relative aspect-[3/4] w-[7.25rem] shrink-0 overflow-hidden rounded-lg border border-divider bg-surface-brand-soft">
              {member.photo_url ? (
                <Image
                  src={member.photo_url}
                  alt={photoAltText(member)}
                  fill
                  sizes="7.25rem"
                  className="object-cover object-top"
                />
              ) : (
                <div className="team-monogram" aria-hidden="true">
                  {committeeInitials(member) || "?"}
                </div>
              )}
            </div>
            <div className="min-w-0">
              {role && (
                <p className="about-wrap text-sm font-bold text-brand">
                  <span className="sr-only">{t("profile.position")}: </span>
                  <span>{role}</span>
                </p>
              )}
              {department && (
                <p className="mt-2">
                  <span className="team-tag about-wrap">
                    <span className="sr-only">{t("profile.department")}: </span>
                    {department}
                  </span>
                </p>
              )}
              {member.is_featured && (
                <p className="mt-2">
                  <span className="team-card__key">{t("directory.keyContact")}</span>
                </p>
              )}
              {summary && (
                <p lang={summary.lang} className="about-copy mt-2 text-sm text-text-body">
                  {summary.text}
                </p>
              )}
            </div>
          </div>

          {facts.length > 0 && (
            <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3">
              {facts.map((fact) => (
                <div key={fact.label} className="border-t border-divider pt-2.5">
                  <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                    <fact.icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {fact.label}
                  </dt>
                  <dd className="about-wrap mt-1 text-sm font-medium text-text-heading">
                    {fact.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {responsibilities.items.length > 0 && (
            <section className="mt-7">
              <h3 className="team-panel__heading">{t("profile.responsibilities")}</h3>
              <ul className="mt-2 divide-y divide-divider">
                {responsibilities.items.map((item) => (
                  <li key={item} className="flex items-start gap-3 py-2.5">
                    <span
                      aria-hidden="true"
                      className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand"
                    />
                    <span lang={responsibilities.lang} className="about-copy text-sm text-text-body">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {bio && (
            <section className="mt-7">
              <h3 className="team-panel__heading">{t("profile.biography")}</h3>
              <p lang={bioLang} className="about-copy mt-2 text-sm text-text-body">
                {bio}
              </p>
            </section>
          )}

          <section className="mt-7 border-t-2 border-divider pt-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
              {t("profile.contact")}
            </h3>
            {hasContact ? (
              <ul className="mt-1 space-y-1">
                {member.email && (
                  <li>
                    <a
                      href={`mailto:${member.email}`}
                      className="flex min-h-11 items-center gap-3 rounded text-sm font-medium text-text-body transition-colors hover:text-brand"
                    >
                      <Mail className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                      <span className="break-all">{member.email}</span>
                    </a>
                  </li>
                )}
                {member.phone && (
                  <li>
                    <a
                      href={`tel:${member.phone.replace(/\s/g, "")}`}
                      className="flex min-h-11 items-center gap-3 rounded text-sm font-medium text-text-body transition-colors hover:text-brand"
                    >
                      <Phone className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                      <span>{member.phone}</span>
                    </a>
                  </li>
                )}
              </ul>
            ) : desk.phone ? (
              <div className="mt-2">
                {desk.tel ? (
                  <a
                    href={desk.tel}
                    className="inline-flex min-h-6 items-center text-lg font-bold text-text-heading hover:text-brand"
                  >
                    {desk.phone}
                  </a>
                ) : (
                  <p className="text-lg font-bold text-text-heading">{desk.phone}</p>
                )}
                <p className="about-copy mt-1 text-xs text-text-muted">{t("profile.noContact")}</p>
              </div>
            ) : (
              <p className="about-copy mt-2 text-sm text-text-muted">{t("profile.noContact")}</p>
            )}
          </section>

          {member.slug && (
            <Link
              href={`/about/team/${member.slug}`}
              className="mt-6 inline-flex min-h-11 w-full items-center justify-between gap-3 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-contrast transition-colors hover:bg-brand-hover"
            >
              <span>{t("profile.openFullProfile")}</span>
              <span className="sr-only">{t("directory.profileOf", { name: name.primary })}</span>
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
