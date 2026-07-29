"use client";

// components/about/TeamDirectory.tsx
//
// The public team directory on /about/team: filter chips, a portrait grid, and
// a profile panel (a right-hand drawer on desktop, a bottom sheet on mobile).
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
// The profile panel is a modal dialog and behaves like one: focus moves in on
// open, Tab is trapped inside it, Escape closes it, and focus returns to the
// exact card button that opened it. Background scroll is locked while it is
// open. Filter chips are real buttons with `aria-pressed`, and the grid's
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
  Briefcase,
  Clock,
  GraduationCap,
  Languages,
  ListChecks,
  Mail,
  Phone,
  Star,
  UserCircle,
  UserRound,
  X,
} from "lucide-react";
import {
  cardSummary,
  groupBySection,
  photoAltText,
  sectionCounts,
  type PublicTeamMember,
  type PublicTeamSection,
} from "@/lib/team/public";
import type { AboutLocale } from "@/lib/about/format";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

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

function sectionName(member: PublicTeamMember, locale: AboutLocale) {
  const primary = locale === "km" ? member.section_name_km : member.section_name_en;
  return (
    primary?.trim() || member.section_name_en?.trim() || member.section_name_km?.trim() || null
  );
}

export default function TeamDirectory({
  members,
  sections,
  locale,
}: {
  members: PublicTeamMember[];
  sections: PublicTeamSection[];
  locale: AboutLocale;
}) {
  const t = useTranslations("about.team");
  const [filter, setFilter] = useState<string>("all");
  const [selected, setSelected] = useState<PublicTeamMember | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const counts = useMemo(() => sectionCounts(members), [members]);
  const featured = useMemo(() => members.filter((m) => m.is_featured), [members]);
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
    // Returning focus to the originating card is what keeps keyboard users
    // from being dumped back at the top of the document.
    triggerRef.current?.focus();
  }, []);

  return (
    <>
      {sections.length > 1 && (
        <div
          role="group"
          aria-label={t("directory.filterLabel")}
          className="-mx-1 mb-8 flex flex-wrap gap-2 px-1"
        >
          <FilterChip
            label={t("directory.all")}
            count={members.length}
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          {sections.map((section) => (
            <FilterChip
              key={section.id}
              label={
                (locale === "km" ? section.name_km : section.name_en) ||
                section.name_en ||
                section.name_km
              }
              count={counts[section.id] ?? 0}
              active={filter === section.id}
              onClick={() => setFilter(section.id)}
            />
          ))}
          {hasUnsectioned && (
            <FilterChip
              label={t("directory.other")}
              count={counts[""] ?? 0}
              active={filter === "unsectioned"}
              onClick={() => setFilter("unsectioned")}
            />
          )}
        </div>
      )}

      {/* Featured members first, but only in the unfiltered view — repeating
          them inside a filtered result would show the same person twice. */}
      {filter === "all" && featured.length > 0 && (
        <section aria-labelledby="team-featured-heading" className="mb-12">
          <div className="mb-5 flex items-center gap-2.5">
            <Star className="h-4 w-4 fill-current text-gold-600" aria-hidden="true" />
            <div>
              <h3 id="team-featured-heading" className="text-base font-semibold text-text-heading">
                {t("directory.keyContacts")}
              </h3>
              <p className="text-xs text-text-muted">{t("directory.keyContactsBody")}</p>
            </div>
          </div>
          <MemberGrid members={featured} locale={locale} onOpen={open} />
        </section>
      )}

      <div aria-live="polite">
        {groups.length === 0 ? (
          <p role="status" className="rounded-2xl border border-dashed border-border-strong bg-paper px-6 py-12 text-center text-sm text-text-muted">
            {t("directory.emptyArea")}
          </p>
        ) : (
          <div className="space-y-12">
            {groups.map(({ section, members: sectionMembers }) => (
              <section
                key={section?.id ?? "unsectioned"}
                aria-labelledby={`team-section-${section?.id ?? "other"}`}
              >
                <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-divider pb-3">
                  <h3
                    id={`team-section-${section?.id ?? "other"}`}
                    className="about-wrap text-base font-semibold text-text-heading"
                  >
                    {section
                      ? (locale === "km" ? section.name_km : section.name_en) || section.name_en
                      : t("directory.otherMembers")}
                  </h3>
                  <p className="shrink-0 text-xs text-text-muted">
                    {t("directory.memberCount", { count: sectionMembers.length })}
                  </p>
                </div>
                <MemberGrid members={sectionMembers} locale={locale} onOpen={open} />
              </section>
            ))}
          </div>
        )}
      </div>

      {selected && <ProfilePanel member={selected} locale={locale} onClose={close} />}
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function FilterChip({
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
        "inline-flex min-h-11 items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
        active
          ? "border-brand bg-brand text-brand-contrast"
          : "border-divider bg-bg-surface text-text-body hover:border-brand/40 hover:text-brand",
      ].join(" ")}
    >
      <span className="about-wrap">{label}</span>
      <span
        className={`rounded-full px-1.5 py-px text-xs font-semibold tabular-nums ${
          active ? "bg-white/20" : "bg-paper text-text-muted"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function MemberGrid({
  members,
  locale,
  onOpen,
}: {
  members: PublicTeamMember[];
  locale: AboutLocale;
  onOpen: (member: PublicTeamMember, trigger: HTMLButtonElement) => void;
}) {
  const t = useTranslations("about.team");
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {members.map((member) => {
        const name = names(member, locale);
        const role = position(member, locale);
        const area = sectionName(member, locale);
        const summary = cardSummary(member, 110);
        return (
          <li key={member.id}>
            <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm">
              {/* Fixed 3:4 box: reserved before the portrait loads, so a slow
                  image can never shift the grid. */}
              <div className="relative aspect-[3/4] w-full bg-paper">
                {member.photo_url ? (
                  <Image
                    src={member.photo_url}
                    alt={photoAltText(member)}
                    fill
                    loading="lazy"
                    sizes="(min-width: 1024px) 20rem, (min-width: 640px) 45vw, 90vw"
                    className="object-cover"
                  />
                ) : (
                  // A missing portrait gets a deliberate placeholder — a
                  // monogram on a tinted panel — not a broken-image icon and
                  // not a blank grey box, which reads as a failed load. The
                  // initial is decorative (the name is right below it), so the
                  // whole panel is hidden from assistive tech and the reason
                  // is stated in text for sighted users.
                  <div
                    className="flex h-full w-full flex-col items-center justify-center gap-2 bg-brand/[0.06]"
                    aria-hidden="true"
                  >
                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-bg-surface text-2xl font-semibold text-brand shadow-sm">
                      {(name.primary || "?").trim().charAt(0)}
                    </span>
                    <UserRound className="h-4 w-4 text-text-muted/50" />
                    <span className="px-3 text-center text-[11px] text-text-muted">
                      {t("directory.noPhoto")}
                    </span>
                  </div>
                )}
                {member.is_featured && (
                  <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-bg-surface/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold-700 shadow-sm backdrop-blur">
                    <Star className="h-3 w-3 fill-current" aria-hidden="true" />
                    {t("directory.keyContacts")}
                  </span>
                )}
              </div>

              <div className="flex flex-1 flex-col p-4">
                <h4 className="about-wrap text-base font-semibold leading-snug text-text-heading">
                  <span lang={name.primaryLang} className="block">
                    {name.primary}
                  </span>
                  {name.secondary && (
                    <span
                      lang={name.secondaryLang}
                      className="mt-0.5 block text-sm font-normal text-text-muted"
                    >
                      {name.secondary}
                    </span>
                  )}
                </h4>

                {role && <p className="about-wrap mt-2 text-sm font-medium text-brand">{role}</p>}
                {area && <p className="about-wrap mt-0.5 text-xs text-text-muted">{area}</p>}
                {/* One line only — long biographies belong in the panel. */}
                {summary && (
                  <p lang={summary.lang} className="about-copy mt-3 line-clamp-2 text-sm text-text-body">
                    {summary.text}
                  </p>
                )}

                <button
                  type="button"
                  onClick={(event) => onOpen(member, event.currentTarget)}
                  className="mt-auto inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-divider px-4 py-2.5 pt-2.5 text-sm font-semibold text-text-body transition-colors hover:border-brand/40 hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                  {/* The accessible name says WHOSE profile — "View profile"
                      repeated across a grid is meaningless out of context. */}
                  <span aria-hidden="true">{t("directory.viewProfile")}</span>
                  <span className="sr-only">
                    {t("directory.profileOf", { name: name.primary })}
                  </span>
                </button>
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function ProfilePanel({
  member,
  locale,
  onClose,
}: {
  member: PublicTeamMember;
  locale: AboutLocale;
  onClose: () => void;
}) {
  const t = useTranslations("about.team");
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const name = names(member, locale);
  const role = position(member, locale);
  const area = sectionName(member, locale);

  const bio = locale === "km" ? member.bio_km || member.bio_en : member.bio_en || member.bio_km;
  const bioLang: AboutLocale =
    bio && bio === member.bio_km ? "km" : "en";
  const responsibilities =
    locale === "km"
      ? member.responsibilities_km.length
        ? { items: member.responsibilities_km, lang: "km" as const }
        : { items: member.responsibilities_en, lang: "en" as const }
      : member.responsibilities_en.length
        ? { items: member.responsibilities_en, lang: "en" as const }
        : { items: member.responsibilities_km, lang: "km" as const };

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
        // Bottom sheet on mobile, right-hand drawer from `sm` up.
        className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-bg-surface shadow-lg sm:max-h-none sm:max-w-md sm:rounded-none sm:rounded-l-3xl"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-divider bg-bg-surface/95 px-5 py-4 backdrop-blur">
          <h2 id={titleId} className="about-wrap min-w-0 text-lg font-semibold text-text-heading">
            <span lang={name.primaryLang} className="block">
              {name.primary}
            </span>
            {name.secondary && (
              <span lang={name.secondaryLang} className="mt-0.5 block text-sm font-normal text-text-muted">
                {name.secondary}
              </span>
            )}
          </h2>
          <button
            type="button"
            data-close-button
            onClick={onClose}
            aria-label={t("directory.close")}
            className="shrink-0 rounded-xl border border-divider p-2 text-text-muted transition-colors hover:border-brand/40 hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="px-5 py-5">
          <div className="flex gap-4">
            <div className="relative h-24 w-[4.5rem] shrink-0 overflow-hidden rounded-xl bg-paper">
              {member.photo_url ? (
                <Image
                  src={member.photo_url}
                  alt={photoAltText(member)}
                  fill
                  sizes="4.5rem"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center" aria-hidden="true">
                  <UserCircle className="h-10 w-10 text-text-muted/30" />
                </div>
              )}
            </div>
            <dl className="min-w-0 space-y-2">
              {role && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-text-muted">
                    {t("profile.position")}
                  </dt>
                  <dd className="about-wrap text-sm font-medium text-text-heading">{role}</dd>
                </div>
              )}
              {area && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-text-muted">
                    {t("profile.department")}
                  </dt>
                  <dd className="about-wrap text-sm text-text-body">{area}</dd>
                </div>
              )}
            </dl>
          </div>

          {facts.length > 0 && (
            <dl className="mt-6 grid grid-cols-2 gap-3">
              {facts.map((fact) => (
                <div key={fact.label} className="rounded-xl border border-divider bg-paper p-3">
                  <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-text-muted">
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
            <section className="mt-6">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
                {t("profile.responsibilities")}
              </h3>
              <ul className="mt-2.5 space-y-2">
                {/* Keyed by the responsibility text itself: an admin editing
                    the list reorders it, and an index key would then re-use
                    the wrong DOM node for the wrong entry. */}
                {responsibilities.items.map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <span
                      className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand/50"
                      aria-hidden="true"
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
            <section className="mt-6">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                {t("profile.biography")}
              </h3>
              <p lang={bioLang} className="about-copy mt-2 text-sm text-text-body">
                {bio}
              </p>
            </section>
          )}

          <section className="mt-6 rounded-xl border border-divider bg-paper p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              {t("profile.contact")}
            </h3>
            {hasContact ? (
              <ul className="mt-2.5 space-y-2.5">
                {member.email && (
                  <li>
                    <a
                      href={`mailto:${member.email}`}
                      className="flex min-h-11 items-center gap-3 rounded text-sm text-text-body transition-colors hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
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
                      className="flex min-h-11 items-center gap-3 rounded text-sm text-text-body transition-colors hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    >
                      <Phone className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                      <span>{member.phone}</span>
                    </a>
                  </li>
                )}
              </ul>
            ) : (
              // The member has not approved any personal contact detail for
              // publication — point at the official desk instead of showing
              // an empty section or, worse, guessing an address.
              <p className="about-copy mt-2 text-sm text-text-muted">{t("profile.noContact")}</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
