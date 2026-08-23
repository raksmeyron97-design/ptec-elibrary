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
  Search,
  UserRound,
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
      {/* ── Search ─────────────────────────────────────────────────────────
          Offered only once the roster is big enough for scanning it by eye to
          be work. Below that a search box is just another control to skip. */}
      {members.length >= SEARCH_THRESHOLD && (
        <div className="mb-6">
          <label htmlFor={searchId} className="sr-only">
            {t("directory.searchLabel")}
          </label>
          {/* .focus-shell on the wrapper of a grouped control — see
              docs/ACCESSIBILITY-FOCUS.md. The input itself carries no second
              indicator. */}
          <div className="focus-shell relative flex items-center rounded-xl border border-divider bg-bg-surface">
            <Search
              className="pointer-events-none absolute left-3.5 h-4 w-4 text-text-muted"
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
              className="min-h-11 w-full flex-1 rounded-xl bg-transparent py-2 pl-10 pr-10 text-base text-text-heading outline-none placeholder:text-text-muted"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={t("directory.searchClear")}
                className="absolute right-1.5 flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition-colors hover:text-text-heading"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      )}

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
      <div className="border-b-2 border-divider" aria-hidden="true" />

      {/* ── Grouped directory ──────────────────────────────────────────── */}
      <div aria-live="polite">
        {groups.length === 0 ? (
          <p
            role="status"
            className="mt-8 rounded-2xl border border-dashed border-border-strong bg-paper px-6 py-12 text-center text-sm text-text-muted"
          >
            {trimmedQuery
              ? t("directory.noSearchResults", { query: trimmedQuery })
              : t("directory.emptyArea")}
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

                  {/* A grid, not stacked full-width rows. The row layout was
                      built for a roster of a dozen; with one or two members it
                      left a card's worth of content stretched across the full
                      page and read as a rendering fault. Cards keep their
                      natural width at any roster size. */}
                  <ul
                    className={
                      sectionMembers.length === 1
                        ? "mt-6"
                        : "mt-6 grid items-stretch gap-5 sm:grid-cols-2 xl:grid-cols-3"
                    }
                  >
                    {sectionMembers.map((member) => (
                      <MemberCard
                        key={member.id}
                        member={member}
                        locale={locale}
                        layout={sectionMembers.length === 1 ? "feature" : "grid"}
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

/** How many "Ask me about" lines a card shows before it defers to the profile
 *  page. Three is what fits without the card growing taller than its portrait
 *  block on a phone; the rest are counted, not truncated. */
const CARD_ASK_LIMIT = 3;

/**
 * One member, as a card in the directory grid.
 *
 * The information order here is a deliberate answer to the question a reader
 * actually arrives with — "who do I ask about X, and can I ask them?" — not
 * "how senior is this person?". So the card leads with what the member helps
 * with, and carries only the two facts that bear on whether a reader can
 * approach them: the languages they work in and when they are around.
 * Education and years of experience are credentials, not service information;
 * they live on the profile page, one click away.
 */
function MemberCard({
  member,
  locale,
  layout,
  onQuickLook,
}: {
  member: PublicTeamMember;
  locale: AboutLocale;
  /** "feature" is the single-member form: the card turns on its side and runs
   *  the full width, because one vertical card in a three-column grid leaves
   *  two empty columns and reads as content that failed to load. */
  layout: "grid" | "feature";
  onQuickLook: (member: PublicTeamMember, trigger: HTMLButtonElement) => void;
}) {
  const feature = layout === "feature";
  const t = useTranslations("about.team");
  const name = names(member, locale);
  const role = position(member, locale);
  const summary = cardSummary(member, 150);
  const responsibilities = responsibilityList(member, locale);
  const asks = responsibilities.items.slice(0, CARD_ASK_LIMIT);
  const askOverflow = responsibilities.items.length - asks.length;

  return (
    <li className="h-full">
      <article
        className={`group border border-divider bg-bg-surface transition-[border-color,box-shadow,transform] duration-300 ease-[cubic-bezier(.2,.7,.2,1)] hover:border-brand/40 hover:shadow-[0_18px_38px_-22px_rgba(11,21,48,.45)] motion-reduce:transition-none ${
          feature
            ? "grid sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]"
            : "flex h-full flex-col hover:-translate-y-1 motion-reduce:hover:translate-y-0"
        }`}
      >
        {/* Portrait — fixed 4:5 box, reserved before the bytes arrive so a slow
            image can never shift the grid. In colour, deliberately: this page
            exists to make a reader comfortable walking up and asking someone a
            question, and a desaturated portrait reads formal and distant. */}
        {/* The plate is tinted, not white: these portraits are studio cut-outs
            on white, and against a white card the person floated with no edge.
            A faint brand wash gives the figure something to sit on. */}
        <div
          className={`relative w-full overflow-hidden bg-surface-brand-soft ${
            feature
              ? "aspect-[4/5] border-b border-divider sm:aspect-auto sm:border-b-0 sm:border-r"
              : "aspect-[4/5] border-b border-divider"
          }`}
        >
          {member.photo_url ? (
            <Image
              src={member.photo_url}
              alt={photoAltText(member)}
              fill
              loading="lazy"
              sizes={feature ? "(min-width: 640px) 15rem, 92vw" : "(min-width: 1280px) 22rem, (min-width: 640px) 45vw, 92vw"}
              className="object-cover transition-transform duration-500 ease-[cubic-bezier(.2,.7,.2,1)] group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            />
          ) : (
            // A missing portrait gets a deliberate placeholder — a monogram on
            // a tinted panel — not a broken-image icon and not a blank grey
            // box, which reads as a failed load.
            <div
              className="flex h-full w-full flex-col items-center justify-center gap-2 bg-surface-brand-soft"
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
            <span className="absolute bottom-0 left-0 bg-gold-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-blue-950">
              {t("directory.keyContact")}
            </span>
          )}
        </div>

        <div className={`flex flex-1 flex-col p-5 ${feature ? "sm:p-7" : ""}`}>
          {/* Identity */}
          <h4 className="about-wrap text-lg font-bold leading-tight tracking-tight text-text-heading">
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
            <p className="about-wrap mt-2 text-[11px] font-bold uppercase tracking-[0.08em] text-brand">
              {role}
            </p>
          )}
          {summary && (
            <p lang={summary.lang} className="about-copy mt-3 line-clamp-3 text-sm text-text-body">
              {summary.text}
            </p>
          )}

          {/* ── Ask me about ──────────────────────────────────────────────
              The reason a reader is on this page. It used to sit in the far
              column as chips truncated to 48 characters — mid-word, so the
              one thing they came to read was the one thing they could not. */}
          {asks.length > 0 && (
            <div className="mt-5 border-t border-divider pt-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted">
                {t("directory.askMeAbout")}
              </p>
              <ul className="mt-2.5 space-y-1.5">
                {/* Keyed by the text itself: an admin editing the list
                    reorders it, and an index key would then re-use the wrong
                    DOM node for the wrong entry. */}
                {asks.map((item) => (
                  <li
                    key={item}
                    lang={responsibilities.lang}
                    className="about-wrap flex gap-2.5 text-[13px] leading-snug text-text-body"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-accent-line"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              {askOverflow > 0 && (
                <p className="mt-2 pl-[1.375rem] text-[11px] font-semibold tabular-nums text-text-muted">
                  {t("directory.moreResponsibilities", { count: askOverflow })}
                </p>
              )}
            </div>
          )}

          {/* ── Can I approach them? ──────────────────────────────────────
              Exactly two facts, both about service rather than seniority. */}
          {(member.languages.length > 0 || member.working_hours) && (
            <dl className="mt-4 space-y-2 border-t border-divider pt-4">
              {member.languages.length > 0 && (
                <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2.5">
                  <Languages className="mt-0.5 h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
                  <dt className="sr-only">{t("profile.languages")}</dt>
                  <dd className="about-wrap col-start-2 text-[12.5px] text-text-body">
                    {member.languages.join(", ")}
                  </dd>
                </div>
              )}
              {member.working_hours && (
                <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2.5">
                  <Clock className="mt-0.5 h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
                  <dt className="sr-only">{t("directory.availability")}</dt>
                  <dd className="about-wrap col-start-2 text-[12.5px] text-text-body">
                    {member.working_hours}
                  </dd>
                </div>
              )}
            </dl>
          )}

          {/* ── Actions ───────────────────────────────────────────────────
              One primary route, one quiet alternative. These used to be two
              equally-weighted buttons leading to the same information, which
              made the reader choose before knowing there was no difference. */}
          <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-5">
            {member.slug && (
              <Link
                href={`/about/team/${member.slug}`}
                className={`inline-flex min-h-11 items-center justify-between gap-3 bg-brand px-4 text-xs font-bold uppercase tracking-[0.06em] text-brand-contrast transition-colors hover:bg-brand-hover ${
                  // Fills the card in the grid form, where it is the card's
                  // base; keeps its natural width in the feature form, where
                  // stretching it across the content column made a button look
                  // like a banner.
                  feature ? "min-w-48" : "flex-1"
                }`}
              >
                {/* The accessible name says WHOSE profile — "View profile"
                    repeated down a directory is meaningless out of context. */}
                <span aria-hidden="true">{t("directory.viewProfile")}</span>
                <span className="sr-only">{t("directory.profileOf", { name: name.primary })}</span>
                <ArrowRight
                  className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                  aria-hidden="true"
                />
              </Link>
            )}
            <button
              type="button"
              onClick={(event) => onQuickLook(member, event.currentTarget)}
              className="inline-flex min-h-11 items-center gap-2 text-xs font-bold uppercase tracking-[0.06em] text-text-muted underline-offset-4 transition-colors hover:text-brand hover:underline"
            >
              <span aria-hidden="true">{t("directory.quickLook")}</span>
              <span className="sr-only">{t("directory.profileOf", { name: name.primary })}</span>
              <PanelRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            </button>
          </div>
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
            <div className="relative h-[9.5rem] w-[7.5rem] shrink-0 border border-divider bg-surface-brand-soft">
              {member.photo_url ? (
                <Image
                  src={member.photo_url}
                  alt={photoAltText(member)}
                  fill
                  sizes="7.5rem"
                  className="object-cover"
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
              {/* Unordered, and unnumbered, to match the profile page: what
                  someone helps with is a set, not a ranked or timed sequence. */}
              <ul>
                {responsibilities.items.map((item) => (
                  <li
                    key={item}
                    className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-3 border-b border-divider py-3"
                  >
                    <span
                      aria-hidden="true"
                      className="h-px w-4 translate-y-[-0.25rem] bg-accent-line"
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
