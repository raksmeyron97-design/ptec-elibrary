"use client";

// components/about/TeamProfileSheet.tsx
//
// The quick look: a bottom sheet on a phone, a right-hand panel from `sm` up.
// It is a shortcut past a page load, never a replacement for the profile page
// — every sheet ends with the route to the real one.
//
// ── Privacy ──
// This component NEVER decides what may be published. `phone` and `email`
// arrive already nulled unless an admin ticked the per-member public-display
// toggle, because the page reads the `team_members_public` view (migration
// 0070), which applies those toggles in SQL. So the rule here is simply:
// render a contact row only when the field is non-null, and offer the
// library's official desk as the route to everyone else. There is no
// client-side privacy logic to get wrong, and no code path that can surface a
// personal number the library did not approve.
//
// ── Accessibility ──
// It is a modal dialog and behaves like one: focus moves in on open, Tab is
// trapped, Escape closes it, background scroll is locked, and focus returns to
// the exact control that opened it. The close button is the initial focus
// target rather than the panel itself, so the first Tab lands on real content
// and the escape route is one Shift+Tab away wherever the reader is.
//
// ── Look ──
// It is an editorial staff profile, not an application dialog: the page's own
// white surface, a gold rule under the header, the same circular portrait the
// cards use, and the same small department label. The navy plate it used to
// wear is what made it read as a modal belonging to a piece of software.
//
// ── Motion ──
// One 200–220ms slide, from the edge the sheet is anchored to, defined in CSS
// (`.team-sheet`) so `prefers-reduced-motion` can switch it off in the same
// place as every other animation on the page. No animation library.

import { useEffect, useId, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  Briefcase,
  Clock,
  GraduationCap,
  Languages,
  Mail,
  Phone,
  Star,
  X,
  type LucideIcon,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { PublicTeamMember } from "@/lib/team/public";
import {
  memberArea,
  memberBio,
  memberNames,
  memberPosition,
  memberResponsibilities,
  memberSummary,
} from "@/lib/team/directory";
import type { AboutLocale } from "@/lib/about/format";
import TeamPortrait from "./TeamPortrait";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/** Long enough to be an introduction, short enough that the profile page is
 *  still worth opening. */
const SHEET_SUMMARY_CHARS = 260;

/** The library's official desk, from published system settings — so the sheet
 *  can always offer a real route to a member without publishing anyone's
 *  personal number. */
export type TeamDeskInfo = {
  phone: string | null;
  tel: string | null;
  hours: string | null;
};

export default function TeamProfileSheet({
  member,
  locale,
  desk,
  onClose,
}: {
  member: PublicTeamMember;
  locale: AboutLocale;
  desk: TeamDeskInfo;
  onClose: () => void;
}) {
  const t = useTranslations("about.team");
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const name = memberNames(member, locale);
  const role = memberPosition(member, locale);
  const area = memberArea(member, locale);
  const summary = memberSummary(member, locale, SHEET_SUMMARY_CHARS);
  const bio = memberBio(member, locale);
  const responsibilities = memberResponsibilities(member, locale);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    panel.querySelector<HTMLElement>("[data-close-button]")?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

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

  return (
    // z-[110]: the site header stacks at z-[100].
    <div
      className="team-sheet__backdrop fixed inset-0 z-[110] flex items-end justify-center bg-blue-950/60 sm:items-stretch sm:justify-end"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        className="team-sheet"
      >
        {/* A light header on the page's own surface. A navy plate here made
            the panel read as an application dialog; the gold rule under it is
            the same edge the site header and footer carry, so this reads as
            the top of a staff profile instead. */}
        <div className="team-sheet__head">
          {/* Decorative drag affordance — dragging is not implemented, the
              close button and Escape are — so it is hidden from assistive tech
              and from every viewport that gets the side panel. */}
          <span aria-hidden="true" className="team-sheet__grabber" />
          <div className="flex min-w-0 items-start gap-3.5">
            <TeamPortrait member={member} sizes="4.5rem" />
            <div className="min-w-0">
              <h2 id={titleId} className="about-wrap min-w-0 text-lg font-bold text-text-heading">
                <span lang={name.primaryLang} className="block">
                  {name.primary}
                </span>
                {name.secondary && (
                  <span
                    lang={name.secondaryLang}
                    className="about-wrap mt-0.5 block text-sm font-normal text-text-muted"
                  >
                    {name.secondary}
                  </span>
                )}
              </h2>
              {role && (
                <p lang={role.lang} className="team-card__role about-wrap">
                  <span className="sr-only">{t("profile.position")}: </span>
                  <span>{role.text}</span>
                </p>
              )}
              {area && (
                <p lang={area.lang} className="team-card__area about-wrap">
                  <span className="sr-only">{t("profile.department")}: </span>
                  <span>{area.text}</span>
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            data-close-button
            onClick={onClose}
            aria-label={t("directory.close")}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-divider text-text-muted transition-colors hover:border-brand/40 hover:text-brand"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="team-sheet__scroll px-5 py-5">
          {member.is_featured && (
            <p className="team-card__flag !mt-0">
              <Star className="h-3 w-3 shrink-0 fill-current" aria-hidden="true" />
              <span className="about-wrap">{t("directory.keyContact")}</span>
            </p>
          )}
          {summary && (
            <p lang={summary.lang} className="about-copy about-wrap mt-2 text-sm text-text-body">
              {summary.text}
            </p>
          )}

          {facts.length > 0 && (
            <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3">
              {facts.map((fact) => (
                <div key={fact.label} className="border-t border-divider pt-2.5">
                  <dt className="flex items-center gap-1.5 text-[11px] font-semibold text-text-muted">
                    <fact.icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="about-wrap">{fact.label}</span>
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
              <h3 className="team-sheet__heading about-wrap">{t("profile.responsibilities")}</h3>
              {/* Unordered, and unnumbered, to match the profile page: what
                  someone helps with is a set, not a ranked sequence. */}
              <ul className="mt-2 divide-y divide-divider">
                {responsibilities.items.map((item) => (
                  <li key={item} className="flex items-start gap-3 py-2.5">
                    <span
                      aria-hidden="true"
                      className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500"
                    />
                    <span
                      lang={responsibilities.lang}
                      className="about-copy about-wrap text-sm text-text-body"
                    >
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {bio && (
            <section className="mt-7">
              <h3 className="team-sheet__heading about-wrap">{t("profile.biography")}</h3>
              <p lang={bio.lang} className="about-copy about-wrap mt-2 text-sm text-text-body">
                {bio.text}
              </p>
            </section>
          )}

          <section className="mt-7 border-t-2 border-divider pt-4">
            <h3 className="team-sheet__heading about-wrap">{t("profile.contact")}</h3>
            {hasContact ? (
              <ul className="mt-2 space-y-1">
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
              // The member has approved no personal contact detail for
              // publication — point at the official desk rather than showing
              // an empty section or, worse, guessing an address.
              <div className="mt-2">
                {desk.tel ? (
                  <a
                    href={desk.tel}
                    className="inline-flex min-h-11 items-center text-lg font-bold text-text-heading hover:text-brand"
                  >
                    {desk.phone}
                  </a>
                ) : (
                  <p className="text-lg font-bold text-text-heading">{desk.phone}</p>
                )}
                <p className="about-copy about-wrap mt-1 text-xs text-text-muted">
                  {t("profile.noContact")}
                </p>
              </div>
            ) : (
              <p className="about-copy about-wrap mt-2 text-sm text-text-muted">
                {t("profile.noContact")}
              </p>
            )}
          </section>

          {member.slug && (
            <Link
              href={`/about/team/${member.slug}`}
              className="mt-6 inline-flex min-h-11 w-full items-center justify-between gap-3 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-contrast transition-colors hover:bg-brand-hover"
            >
              <span className="about-wrap">{t("profile.openFullProfile")}</span>
              <span className="sr-only">{t("directory.profileOf", { name: name.primary })}</span>
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
