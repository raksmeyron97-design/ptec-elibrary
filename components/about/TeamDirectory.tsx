"use client";

// components/about/TeamDirectory.tsx
//
// The public team directory on /about/team, in its redesigned editorial form:
// underline filter tabs, service-area groups numbered 01/02/03…, one wide row
// per member (portrait · identity · facts · actions), and a quick-look panel
// (right-hand drawer on desktop, bottom sheet on mobile). Members with a slug
// also link to their full profile page at /about/team/<slug>.
//
// ── Privacy ──
// This component NEVER decides what may be published. `phone` and `email`
// arrive already nulled unless an admin ticked the per-member public-display
// toggle, because the page reads the `team_members_public` view (migration
// 0070), which applies those toggles in SQL. So the rule here is simply:
// render a contact row only when the field is non-null, and offer the
// library's official desk as the fallback route to everyone else. There is no
// client-side privacy logic to get wrong, and no code path that can surface a
// personal Gmail address the library did not approve.
//
// ── Accessibility ──
// The quick-look panel is a modal dialog and behaves like one: focus moves in
// on open, Tab is trapped inside it, Escape closes it, and focus returns to
// the exact button that opened it. Background scroll is locked while it is
// open. Filter tabs are real buttons with `aria-pressed`, and the directory's
// result count is announced politely when the filter changes.
//
// ── Bilingual names ──
// The active locale leads and the other script follows as a secondary line —
// a person's name is exactly the kind of short official label the brief says
// SHOULD carry both languages.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  Briefcase,
  Clock,
  GraduationCap,
  Languages,
  Mail,
  PanelRight,
  Phone,
  UserRound,
  X,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import {
  cardSummary,
  groupBySection,
  photoAltText,
  sectionCounts,
  truncate,
  type PublicTeamMember,
  type PublicTeamSection,
} from "@/lib/team/public";
import type { AboutLocale } from "@/lib/about/format";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/** The library's official desk, passed down from published system settings so
 *  every row can point at a real contact route without ever needing a member's
 *  personal number. */
export type TeamDeskInfo = {
  phone: string | null;
  tel: string | null;
  hours: string | null;
};

/** The member's name in the active locale, with the other script beneath. */
function names(member: PublicTeamMember, locale: AboutLocale) {
  const primary = locale === "km" ? member.name_km : member.name_en;
  const secondary = locale === "km" ? member.name_en : member.name_km;
  const primaryLang: AboutLocale = primary === member.name_km ? "km" : "en";
  return {
    primary: primary?.trim() || member.name_en || member.name_km,
    primaryLang,
    secondary: secondary?.trim() && secondary !== primary ? secondary : null,
    secondaryLang: (primaryLang === "km" ? "en" : "km") as AboutLocale,
  };
}

function position(member: PublicTeamMember, locale: AboutLocale) {
  const primary = locale === "km" ? member.position_km : member.position_en;
  return primary?.trim() || member.position_en?.trim() || member.position_km?.trim() || null;
}

function responsibilityList(member: PublicTeamMember, locale: AboutLocale) {
  if (locale === "km" && member.responsibilities_km.length > 0)
    return { items: member.responsibilities_km, lang: "km" as const };
  if (member.responsibilities_en.length > 0)
    return { items: member.responsibilities_en, lang: "en" as const };
  return { items: member.responsibilities_km, lang: "km" as const };
}

function sectionLabel(section: PublicTeamSection, locale: AboutLocale) {
  return (
    (locale === "km" ? section.name_km : section.name_en) ||
    section.name_en ||
    section.name_km
  );
}

function sectionBlurb(section: PublicTeamSection, locale: AboutLocale) {
  const primary = locale === "km" ? section.description_km : section.description_en;
  const value = primary?.trim() || section.description_en?.trim() || section.description_km?.trim();
  return value || null;
}

export default function TeamDirectory({
  members,
  sections,
  locale,
  desk,
}: {
  members: PublicTeamMember[];
  sections: PublicTeamSection[];
  locale: AboutLocale;
  desk: TeamDeskInfo;
}) {
  const t = useTranslations("about.team");
  const [filter, setFilter] = useState<string>("all");
  const [selected, setSelected] = useState<PublicTeamMember | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const counts = useMemo(() => sectionCounts(members), [members]);
  const hasUnsectioned = members.some((m) => !m.section_id);

  const visible = useMemo(() => {
    if (filter === "all") return members;
    if (filter === "unsectioned") return members.filter((m) => !m.section_id);
    return members.filter((m) => m.section_id === filter);
  }, [members, filter]);

  const groups = useMemo(() => groupBySection(visible, sections), [visible, sections]);

  const open = useCallback((member: PublicTeamMember, trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setSelected(member);
  }, []);

  const close = useCallback(() => {
    setSelected(null);
    // Returning focus to the originating button is what keeps keyboard users
    // from being dumped back at the top of the document.
    triggerRef.current?.focus();
  }, []);

  return (
    <>
      {/* ── Filter tabs + result count ─────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        {sections.length > 1 ? (
          <div
            role="group"
            aria-label={t("directory.filterLabel")}
            className="-mb-px flex min-w-0 flex-wrap gap-x-7"
          >
            <FilterTab
              label={t("directory.all")}
              count={members.length}
              active={filter === "all"}
              onClick={() => setFilter("all")}
            />
            {sections.map((section) => (
              <FilterTab
                key={section.id}
                label={sectionLabel(section, locale)}
                count={counts[section.id] ?? 0}
                active={filter === section.id}
                onClick={() => setFilter(section.id)}
              />
            ))}
            {hasUnsectioned && (
              <FilterTab
                label={t("directory.other")}
                count={counts[""] ?? 0}
                active={filter === "unsectioned"}
                onClick={() => setFilter("unsectioned")}
              />
            )}
          </div>
        ) : (
          <span aria-hidden="true" />
        )}
        <p className="pb-2 text-xs text-text-muted" role="status">
          {filter === "all"
            ? t("directory.showingAll", { count: members.length })
            : t("directory.showingFiltered", { count: visible.length, total: members.length })}
        </p>
      </div>
      <div className="border-b-2 border-divider" aria-hidden="true" />

      {/* ── Grouped directory ──────────────────────────────────────────── */}
      <div aria-live="polite">
        {groups.length === 0 ? (
          <p
            role="status"
            className="mt-8 rounded-2xl border border-dashed border-border-strong bg-paper px-6 py-12 text-center text-sm text-text-muted"
          >
            {t("directory.emptyArea")}
          </p>
        ) : (
          <div className="space-y-12">
            {groups.map(({ section, members: sectionMembers }, index) => {
              const headingId = `team-section-${section?.id ?? "other"}`;
              const blurb = section ? sectionBlurb(section, locale) : null;
              return (
                <section key={section?.id ?? "unsectioned"} aria-labelledby={headingId} className="pt-10">
                  <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-b-2 border-text-heading pb-3">
                    <span
                      className="text-sm font-bold tabular-nums tracking-wide text-brand"
                      aria-hidden="true"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <h3
                      id={headingId}
                      className="about-wrap min-w-0 flex-1 text-lg font-bold tracking-tight text-text-heading"
                    >
                      {section ? sectionLabel(section, locale) : t("directory.otherMembers")}
                    </h3>
                    <p className="shrink-0 text-xs font-semibold uppercase tracking-wide text-text-muted">
                      {t("directory.memberCount", { count: sectionMembers.length })}
                    </p>
                  </div>
                  {blurb && (
                    <p className="about-copy about-measure mt-3.5 text-sm text-text-body">{blurb}</p>
                  )}

                  <ul>
                    {sectionMembers.map((member, memberIndex) => (
                      <MemberRow
                        key={member.id}
                        member={member}
                        locale={locale}
                        desk={desk}
                        first={memberIndex === 0 && !blurb}
                        onQuickLook={open}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {selected && <ProfilePanel member={selected} locale={locale} desk={desk} onClose={close} />}
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function FilterTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={[
        "relative inline-flex min-h-12 items-center gap-2.5 pb-3 pt-2 text-[13px] font-bold uppercase tracking-wide transition-colors",
        active ? "text-brand" : "text-text-body hover:text-brand",
      ].join(" ")}
    >
      <span className="about-wrap">{label}</span>
      <span
        className={`px-1.5 py-px text-[11px] font-bold tabular-nums ${
          active
            ? "bg-brand text-brand-contrast"
            : "border border-border-strong text-text-muted"
        }`}
      >
        {count}
      </span>
      {/* The active underline is a sibling span, not a border, so switching
          tabs cannot shift the row by a pixel (same trick as the sub-nav). */}
      {active && (
        <span aria-hidden="true" className="absolute inset-x-0 -bottom-0.5 h-1 bg-brand" />
      )}
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

const ROW_CHIP_LIMIT = 4;

function MemberRow({
  member,
  locale,
  desk,
  first,
  onQuickLook,
}: {
  member: PublicTeamMember;
  locale: AboutLocale;
  desk: TeamDeskInfo;
  first: boolean;
  onQuickLook: (member: PublicTeamMember, trigger: HTMLButtonElement) => void;
}) {
  const t = useTranslations("about.team");
  const name = names(member, locale);
  const role = position(member, locale);
  const summary = cardSummary(member, 200);
  const responsibilities = responsibilityList(member, locale);
  const chips = responsibilities.items.slice(0, ROW_CHIP_LIMIT);
  const chipOverflow = responsibilities.items.length - chips.length;

  const facts: { icon: typeof GraduationCap; label: string; value: string }[] = [];
  if (member.education)
    facts.push({ icon: GraduationCap, label: t("profile.education"), value: member.education });
  if (member.years_experience)
    facts.push({ icon: Briefcase, label: t("profile.experience"), value: member.years_experience });
  if (member.languages.length > 0)
    facts.push({ icon: Languages, label: t("profile.languages"), value: member.languages.join(", ") });
  if (member.working_hours)
    facts.push({ icon: Clock, label: t("profile.workingHours"), value: member.working_hours });

  return (
    <li className={first ? "" : "border-t border-divider"}>
      <article className="grid gap-x-8 gap-y-5 py-7 sm:grid-cols-[9rem_minmax(0,1fr)] lg:grid-cols-[10.75rem_minmax(0,1.1fr)_minmax(0,1.3fr)_13rem]">
        {/* Portrait — fixed 4:5 box, reserved before the bytes arrive so a
            slow image can never shift the directory. Grayscale is the
            redesign's editorial treatment; the tag stays readable over it. */}
        <div className="relative aspect-[4/5] w-36 border border-divider bg-paper sm:w-full">
          {member.photo_url ? (
            <Image
              src={member.photo_url}
              alt={photoAltText(member)}
              fill
              loading="lazy"
              sizes="(min-width: 1024px) 10.75rem, (min-width: 640px) 9rem, 9rem"
              className="object-cover grayscale contrast-[1.05]"
            />
          ) : (
            // A missing portrait gets a deliberate placeholder — a monogram
            // on a tinted panel — not a broken-image icon and not a blank
            // grey box, which reads as a failed load.
            <div
              className="flex h-full w-full flex-col items-center justify-center gap-2 bg-surface-brand-soft"
              aria-hidden="true"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-bg-surface text-xl font-semibold text-brand shadow-sm">
                {(name.primary || "?").trim().charAt(0)}
              </span>
              <UserRound className="h-4 w-4 text-text-muted/50" />
              <span className="px-3 text-center text-[11px] text-text-muted">
                {t("directory.noPhoto")}
              </span>
            </div>
          )}
          {member.is_featured && (
            <span className="absolute bottom-0 left-0 bg-gold-500 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-blue-950">
              {t("directory.keyContact")}
            </span>
          )}
        </div>

        {/* Identity */}
        <div className="min-w-0">
          <h4 className="about-wrap text-xl font-bold leading-tight tracking-tight text-text-heading">
            <span lang={name.primaryLang} className="block">
              {name.primary}
            </span>
            {name.secondary && (
              <span
                lang={name.secondaryLang}
                className="mt-1 block text-sm font-normal text-text-muted"
              >
                {name.secondary}
              </span>
            )}
          </h4>
          {role && (
            <p className="about-wrap mt-3 text-xs font-bold uppercase tracking-[0.08em] text-brand">
              {role}
            </p>
          )}
          {summary && (
            <p lang={summary.lang} className="about-copy mt-3 line-clamp-4 text-sm text-text-body">
              {summary.text}
            </p>
          )}
        </div>

        {/* Facts + responsibilities */}
        <div className="min-w-0">
          {facts.length > 0 && (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
              {facts.map((fact) => (
                <div key={fact.label} className="border-t border-divider pt-2.5">
                  <dt className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted">
                    <fact.icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {fact.label}
                  </dt>
                  <dd className="about-wrap mt-1.5 text-sm font-medium text-text-heading">
                    {fact.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {chips.length > 0 && (
            <div className={`border-t border-divider pt-2.5 ${facts.length > 0 ? "mt-4" : ""}`}>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted">
                {t("profile.responsibilities")}
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {/* Keyed by the responsibility text itself: an admin editing
                    the list reorders it, and an index key would then re-use
                    the wrong DOM node for the wrong entry. */}
                {chips.map((item) => (
                  <li
                    key={item}
                    lang={responsibilities.lang}
                    className="about-wrap border border-border-strong px-2 py-1 text-[11px] font-semibold text-text-body"
                  >
                    {truncate(item, 48)}
                  </li>
                ))}
                {chipOverflow > 0 && (
                  <li className="border border-border-strong px-2 py-1 text-[11px] font-semibold tabular-nums text-text-muted">
                    {t("directory.moreResponsibilities", { count: chipOverflow })}
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2.5 sm:col-span-2 sm:flex-row sm:items-start lg:col-span-1 lg:flex-col">
          {member.slug && (
            <Link
              href={`/about/team/${member.slug}`}
              className="inline-flex min-h-12 w-full items-center justify-between gap-3 bg-brand px-4 py-3 text-xs font-bold uppercase tracking-[0.06em] text-brand-contrast transition-colors hover:bg-brand-hover sm:w-auto sm:min-w-44 lg:w-full"
            >
              {/* The accessible name says WHOSE profile — "Full profile"
                  repeated down a directory is meaningless out of context. */}
              <span aria-hidden="true">{t("directory.fullProfile")}</span>
              <span className="sr-only">{t("directory.profileOf", { name: name.primary })}</span>
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            </Link>
          )}
          <button
            type="button"
            onClick={(event) => onQuickLook(member, event.currentTarget)}
            className="inline-flex min-h-12 w-full items-center justify-between gap-3 border-2 border-text-heading px-4 py-3 text-xs font-bold uppercase tracking-[0.06em] text-text-heading transition-colors hover:border-brand hover:text-brand sm:w-auto sm:min-w-44 lg:w-full"
          >
            <span aria-hidden="true">{t("directory.quickLook")}</span>
            <span className="sr-only">{t("directory.profileOf", { name: name.primary })}</span>
            <PanelRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          </button>
          {desk.phone && (
            <div className="w-full border-t border-divider pt-2.5 sm:w-auto sm:border-t-0 sm:pt-0 lg:w-full lg:border-t lg:pt-2.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted">
                {t("directory.serviceDesk")}
              </p>
              {desk.tel ? (
                <a
                  href={desk.tel}
                  className="mt-1 inline-flex min-h-6 items-center text-sm font-semibold text-brand hover:underline"
                >
                  {desk.phone}
                </a>
              ) : (
                <p className="mt-1 text-sm font-semibold text-text-heading">{desk.phone}</p>
              )}
              {member.working_hours && (
                <p className="about-wrap mt-0.5 text-xs text-text-muted">{member.working_hours}</p>
              )}
            </div>
          )}
        </div>
      </article>
    </li>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function ProfilePanel({
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
  const name = names(member, locale);
  const role = position(member, locale);
  const area =
    (locale === "km" ? member.section_name_km : member.section_name_en) ||
    member.section_name_en ||
    member.section_name_km;

  const summary = cardSummary(member, 260);
  const bio = locale === "km" ? member.bio_km || member.bio_en : member.bio_en || member.bio_km;
  const bioLang: AboutLocale = bio && bio === member.bio_km ? "km" : "en";
  const responsibilities = responsibilityList(member, locale);

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

  const facts: { icon: typeof GraduationCap; label: string; value: string }[] = [];
  if (member.education)
    facts.push({ icon: GraduationCap, label: t("profile.education"), value: member.education });
  if (member.years_experience)
    facts.push({ icon: Briefcase, label: t("profile.experience"), value: member.years_experience });
  if (member.languages.length > 0)
    facts.push({ icon: Languages, label: t("profile.languages"), value: member.languages.join(", ") });
  if (member.working_hours)
    facts.push({ icon: Clock, label: t("profile.workingHours"), value: member.working_hours });

  const hasContact = Boolean(member.email || member.phone);

  return (
    // z-[110]: the site header stacks at z-[100].
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-blue-950/60 backdrop-blur-sm sm:items-stretch sm:justify-end"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        // Bottom sheet on mobile, right-hand drawer with the redesign's gold
        // spine from `sm` up.
        className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-bg-surface shadow-lg sm:max-h-none sm:max-w-md sm:rounded-none sm:border-l-4 sm:border-gold-500"
      >
        {/* Navy header — the redesign's hero band, condensed. Literal blue
            classes on purpose: this surface stays dark in both themes, like
            the About hero it echoes. */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 rounded-t-3xl bg-blue-900 px-5 py-5 sm:rounded-none">
          <div className="min-w-0">
            {area && (
              <p className="about-wrap text-[10px] font-bold uppercase tracking-[0.14em] text-gold-300">
                {area}
              </p>
            )}
            <h2 id={titleId} className="about-wrap mt-1.5 min-w-0 text-xl font-bold tracking-tight text-white">
              <span lang={name.primaryLang} className="block">
                {name.primary}
              </span>
              {name.secondary && (
                <span
                  lang={name.secondaryLang}
                  className="mt-0.5 block text-sm font-normal text-white/60"
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
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center border-2 border-white/35 text-white transition-colors hover:border-white [--focus-color:#fff]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="px-5 py-6">
          <div className="flex gap-5">
            <div className="relative h-[9.5rem] w-[7.5rem] shrink-0 border border-divider bg-paper">
              {member.photo_url ? (
                <Image
                  src={member.photo_url}
                  alt={photoAltText(member)}
                  fill
                  sizes="7.5rem"
                  className="object-cover grayscale contrast-[1.05]"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-surface-brand-soft" aria-hidden="true">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-bg-surface text-lg font-semibold text-brand shadow-sm">
                    {(name.primary || "?").trim().charAt(0)}
                  </span>
                </div>
              )}
            </div>
            <div className="min-w-0">
              {role && (
                <p className="about-wrap text-xs font-bold uppercase tracking-[0.08em] text-brand">
                  {role}
                </p>
              )}
              {summary && (
                <p lang={summary.lang} className="about-copy mt-2.5 text-sm text-text-body">
                  {summary.text}
                </p>
              )}
            </div>
          </div>

          {facts.length > 0 && (
            <dl className="mt-7 grid grid-cols-2 gap-x-5 gap-y-4">
              {facts.map((fact) => (
                <div key={fact.label} className="border-t border-divider pt-2.5">
                  <dt className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted">
                    <fact.icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {fact.label}
                  </dt>
                  <dd className="about-wrap mt-1.5 text-sm font-medium text-text-heading">
                    {fact.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {responsibilities.items.length > 0 && (
            <section className="mt-8">
              <h3 className="border-b-2 border-text-heading pb-2 text-xs font-bold uppercase tracking-[0.14em] text-text-heading">
                {t("profile.responsibilities")}
              </h3>
              <ol>
                {responsibilities.items.map((item, index) => (
                  <li key={item} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3 border-b border-divider py-3">
                    <span className="text-xs font-bold tabular-nums text-brand" aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span lang={responsibilities.lang} className="about-copy text-sm text-text-body">
                      {item}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {bio && (
            <section className="mt-8">
              <h3 className="border-b-2 border-text-heading pb-2 text-xs font-bold uppercase tracking-[0.14em] text-text-heading">
                {t("profile.biography")}
              </h3>
              <p lang={bioLang} className="about-copy mt-3 text-sm text-text-body">
                {bio}
              </p>
            </section>
          )}

          <section className="mt-8 border-t-2 border-text-heading pt-4">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted">
              {t("profile.contact")}
            </h3>
            {hasContact ? (
              <ul className="mt-2 space-y-2">
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
              // The member has not approved any personal contact detail for
              // publication — point at the official desk instead of showing an
              // empty section or, worse, guessing an address.
              <div className="mt-2">
                {desk.tel ? (
                  <a
                    href={desk.tel}
                    className="inline-flex min-h-6 items-center text-lg font-bold tracking-tight text-text-heading hover:text-brand"
                  >
                    {desk.phone}
                  </a>
                ) : (
                  <p className="text-lg font-bold tracking-tight text-text-heading">{desk.phone}</p>
                )}
                <p className="about-copy mt-1.5 text-xs text-text-muted">{t("profile.noContact")}</p>
              </div>
            ) : (
              <p className="about-copy mt-2 text-sm text-text-muted">{t("profile.noContact")}</p>
            )}
          </section>

          {member.slug && (
            <Link
              href={`/about/team/${member.slug}`}
              className="mt-6 inline-flex min-h-12 w-full items-center justify-between gap-3 bg-brand px-4 py-3 text-xs font-bold uppercase tracking-[0.06em] text-brand-contrast transition-colors hover:bg-brand-hover"
            >
              <span aria-hidden="true">{t("profile.openFullProfile")}</span>
              <span className="sr-only">{t("directory.profileOf", { name: name.primary })}</span>
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
