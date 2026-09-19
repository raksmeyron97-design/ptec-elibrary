"use client";

// components/about/TeamDirectory.tsx
//
// The public team directory on /about/team, drawn in the About section's
// ROSTER layout — the same navy group bands, white panels and small portrait
// cards as the committee page (components/about/CommitteeRoster.tsx), so the
// two people pages read as one institution.
//
// The layout is deliberately plain: a tab bar to choose a service area, a
// search field once the roster is big enough to need one, and then one panel
// per service area — a band naming it, a grid of cards beneath. A card is a
// portrait, a name in both scripts, the position in blue, one line of what the
// person does, and two links: the profile page and a quick look. Nothing here
// animates, and nothing is decorated for its own sake.
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
// result count is announced politely when the filter changes. Every visible
// action label is contained in its accessible name (WCAG 2.5.3), and the name
// also says WHOSE profile (2.4.4).
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
  Search,
  Users,
  X,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import {
  cardSummary,
  groupBySection,
  photoAltText,
  sectionCounts,
  type PublicTeamMember,
  type PublicTeamSection,
} from "@/lib/team/public";
import { committeeInitials } from "@/lib/committee/public";
import type { AboutLocale } from "@/lib/about/format";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/** Roster size at which the search box starts being offered. Under this, the
 *  whole directory fits on one or two screens and the service-area tabs are a
 *  faster way in. */
const SEARCH_THRESHOLD = 8;

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
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PublicTeamMember | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchId = useId();

  const counts = useMemo(() => sectionCounts(members), [members]);
  const hasUnsectioned = members.some((m) => !m.section_id);

  // Search runs entirely in memory over the roster the page already fetched —
  // it is a handful of rows, so there is no request to make and no debounce to
  // tune. Both scripts of every field are searched at once, so typing a Khmer
  // name finds the person while the page is in English and vice versa.
  const trimmedQuery = query.trim();
  const matches = useMemo(() => {
    if (!trimmedQuery) return null;
    const needle = trimmedQuery.toLowerCase();
    return new Set(
      members
        .filter((m) =>
          [
            m.name_en,
            m.name_km,
            m.position_en,
            m.position_km,
            m.section_name_en,
            m.section_name_km,
            m.short_bio_en,
            m.short_bio_km,
            ...m.responsibilities_en,
            ...m.responsibilities_km,
            ...m.languages,
          ]
            .filter(Boolean)
            .some((field) => (field as string).toLowerCase().includes(needle)),
        )
        .map((m) => m.id),
    );
  }, [members, trimmedQuery]);

  const visible = useMemo(() => {
    const byArea =
      filter === "all"
        ? members
        : filter === "unsectioned"
          ? members.filter((m) => !m.section_id)
          : members.filter((m) => m.section_id === filter);
    return matches ? byArea.filter((m) => matches.has(m.id)) : byArea;
  }, [members, filter, matches]);

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
      {/* ── Controls: area tabs, search, result count ─────────────────── */}
      <div className="team-toolbar">
        {sections.length > 1 && (
          <div role="group" aria-label={t("directory.filterLabel")} className="team-tabs">
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
        )}

        {/* Offered only once the roster is big enough for scanning it by eye
            to be work. Below that a search box is just another control to
            skip. */}
        {members.length >= SEARCH_THRESHOLD && (
          <div className="w-full md:w-72">
            <label htmlFor={searchId} className="sr-only">
              {t("directory.searchLabel")}
            </label>
            {/* .focus-shell on the wrapper of a grouped control — see
                docs/ACCESSIBILITY-FOCUS.md. The input itself carries no second
                indicator. */}
            <div className="focus-shell relative flex items-center rounded-md border border-divider bg-bg-surface">
              <Search
                className="pointer-events-none absolute left-3 h-4 w-4 text-text-muted"
                aria-hidden="true"
              />
              <input
                id={searchId}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("directory.searchPlaceholder")}
                autoComplete="off"
                // 16px minimum: anything smaller makes iOS Safari zoom the page
                // on focus, which strands the reader at 2× on a phone.
                className="min-h-11 w-full flex-1 rounded-md bg-transparent py-2 pl-9 pr-10 text-base text-text-heading outline-none placeholder:text-text-muted"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label={t("directory.searchClear")}
                  className="absolute right-1 flex h-9 w-9 items-center justify-center rounded-md text-text-muted transition-colors hover:text-text-heading"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        )}

        <p className="team-toolbar__status" role="status">
          {trimmedQuery
            ? t("directory.showingSearch", {
                count: visible.length,
                total: members.length,
                query: trimmedQuery,
              })
            : filter === "all"
              ? t("directory.showingAll", { count: members.length })
              : t("directory.showingFiltered", { count: visible.length, total: members.length })}
        </p>
      </div>

      {/* ── One panel per service area ───────────────────────────────── */}
      <div aria-live="polite">
        {groups.length === 0 ? (
          <p
            role="status"
            className="rounded-lg border border-dashed border-border-strong bg-paper px-6 py-12 text-center text-sm text-text-muted"
          >
            {trimmedQuery
              ? t("directory.noSearchResults", { query: trimmedQuery })
              : t("directory.emptyArea")}
          </p>
        ) : (
          <ol className="roster-panels">
            {groups.map(({ section, members: sectionMembers }) => {
              const headingId = `team-section-${section?.id ?? "other"}`;
              const blurb = section ? sectionBlurb(section, locale) : null;
              return (
                <li key={section?.id ?? "unsectioned"}>
                  <section aria-labelledby={headingId} className="roster-panel scroll-mt-24">
                    <header className="roster-band">
                      <Users className="h-5 w-5 shrink-0" aria-hidden="true" />
                      <h3 id={headingId} className="roster-band__title about-wrap">
                        {section ? sectionLabel(section, locale) : t("directory.otherMembers")}
                      </h3>
                      <span className="roster-band__count">
                        {t("directory.memberCount", { count: sectionMembers.length })}
                      </span>
                    </header>
                    <div className="roster-panel__body">
                      {blurb && (
                        <p className="about-copy about-measure mb-4 text-sm text-text-body">
                          {blurb}
                        </p>
                      )}
                      <ul className="roster-grid">
                        {sectionMembers.map((member) => (
                          <li key={member.id}>
                            <MemberCard member={member} locale={locale} onQuickLook={open} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  </section>
                </li>
              );
            })}
          </ol>
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
      className={`team-tab ${active ? "team-tab--active" : ""}`}
    >
      <span className="about-wrap">{label}</span>
      <span className="team-tab__count">{count}</span>
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

/**
 * One member, as a card in the panel grid: portrait, name, position, one
 * line of what they do, and the two routes to more. The card has TWO
 * interactive elements, so unlike the committee card it is never one
 * stretched link — both stay visible and distinct.
 */
function MemberCard({
  member,
  locale,
  onQuickLook,
}: {
  member: PublicTeamMember;
  locale: AboutLocale;
  onQuickLook: (member: PublicTeamMember, trigger: HTMLButtonElement) => void;
}) {
  const t = useTranslations("about.team");
  const name = names(member, locale);
  const role = position(member, locale);
  const summary = cardSummary(member, 110);

  return (
    <article className="roster-card">
      <div className="roster-card__photo">
        {member.photo_url ? (
          // In colour, deliberately: this page exists to make a reader
          // comfortable walking up and asking someone a question, and a
          // desaturated portrait reads formal and distant.
          <Image
            src={member.photo_url}
            alt={photoAltText(member)}
            fill
            loading="lazy"
            sizes="(min-width: 768px) 15rem, (min-width: 640px) 30vw, 45vw"
            className="object-cover object-top"
          />
        ) : (
          // A missing portrait gets a deliberate placeholder — a monogram on
          // a tinted panel — not a broken-image icon and not a blank grey
          // box, which reads as a failed load. Initials come from the
          // person's name, never the honorific's first letter.
          <div className="roster-monogram" aria-hidden="true">
            <span className="roster-monogram__mark">{committeeInitials(member) || "?"}</span>
          </div>
        )}
      </div>

      <h4 className="roster-card__name about-wrap">
        <span lang={name.primaryLang} className="block">
          {name.primary}
        </span>
        {name.secondary && (
          <span lang={name.secondaryLang} className="roster-card__alt about-wrap block">
            {name.secondary}
          </span>
        )}
      </h4>

      {role && (
        <p className="roster-card__role about-wrap">
          <span className="sr-only">{t("profile.position")}: </span>
          <span>{role}</span>
        </p>
      )}

      {summary && (
        <p lang={summary.lang} className="roster-card__line about-wrap line-clamp-2">
          {summary.text}
        </p>
      )}

      {member.is_featured && (
        <p>
          <span className="roster-card__featured">{t("directory.keyContact")}</span>
        </p>
      )}

      <div className="roster-card__actions">
        {member.slug && (
          <Link href={`/about/team/${member.slug}`} className="roster-card__link">
            {/* The accessible name says WHOSE profile — "View profile"
                repeated down a directory is meaningless out of context —
                and still CONTAINS the visible label. */}
            <span>{t("directory.viewProfile")}</span>
            <span className="sr-only">{t("directory.profileOf", { name: name.primary })}</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </Link>
        )}
        <button
          type="button"
          onClick={(event) => onQuickLook(member, event.currentTarget)}
          className="roster-card__link roster-card__link--quiet"
        >
          <PanelRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{t("directory.quickLook")}</span>
          <span className="sr-only">{t("directory.profileOf", { name: name.primary })}</span>
        </button>
      </div>
    </article>
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
      className="fixed inset-0 z-[110] flex items-end justify-center bg-blue-950/60 sm:items-stretch sm:justify-end"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        // Bottom sheet on mobile, right-hand drawer from `sm` up.
        className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-lg bg-bg-surface shadow-lg sm:max-h-none sm:max-w-md sm:rounded-none"
      >
        {/* Navy header, the same band the directory panels wear. Literal blue
            classes on purpose: this surface stays dark in both themes. */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 bg-blue-900 px-5 py-4">
          <div className="min-w-0">
            {area && (
              <p className="about-wrap text-[11px] font-semibold uppercase tracking-[0.1em] text-white/75">
                {area}
              </p>
            )}
            <h2 id={titleId} className="about-wrap mt-1 min-w-0 text-lg font-bold text-white">
              <span lang={name.primaryLang} className="block">
                {name.primary}
              </span>
              {name.secondary && (
                <span lang={name.secondaryLang} className="mt-0.5 block text-sm font-normal text-white/70">
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

        <div className="px-5 py-5">
          <div className="flex gap-4">
            <div className="relative h-[9rem] w-[7.25rem] shrink-0 overflow-hidden rounded-md border border-divider bg-surface-brand-soft">
              {member.photo_url ? (
                <Image
                  src={member.photo_url}
                  alt={photoAltText(member)}
                  fill
                  sizes="7.25rem"
                  className="object-cover object-top"
                />
              ) : (
                <div className="roster-monogram" aria-hidden="true">
                  <span className="roster-monogram__mark">{committeeInitials(member) || "?"}</span>
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
              {/* Unordered, and unnumbered, to match the profile page: what
                  someone helps with is a set, not a ranked or timed sequence. */}
              <ul className="mt-2 divide-y divide-divider">
                {responsibilities.items.map((item) => (
                  <li key={item} className="flex items-start gap-3 py-2.5">
                    <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
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
              // The member has not approved any personal contact detail for
              // publication — point at the official desk instead of showing an
              // empty section or, worse, guessing an address.
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
              className="mt-6 inline-flex min-h-11 w-full items-center justify-between gap-3 rounded-md bg-brand px-4 py-2.5 text-sm font-bold text-brand-contrast transition-colors hover:bg-brand-hover"
            >
              <span>{t("profile.openFullProfile")}</span>
              <span className="sr-only">{t("directory.profileOf", { name: name.primary })}</span>
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
